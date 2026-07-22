import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EstadoCobranza,
  EstadoExpediente,
  EstadoPoliza,
  OrigenDocumento,
  Rol,
  TipoDocumento,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ClaudeService } from '../ia/claude.service';
import { AuditService } from '../audit/audit.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

/** Días naturales entre cortes de cobranza. */
export const DIAS_ENTRE_CORTES = 30;

export function sumarDias(fecha: Date, dias: number): Date {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

@Injectable()
export class PolizasService {
  private readonly logger = new Logger(PolizasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly claude: ClaudeService,
    private readonly audit: AuditService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /**
   * Módulo 7 — "emitir pólizas". Crea una póliza por unidad en estado
   * `pendiente_emision` y avisa a quien debe capturarlas en el portal.
   * Todo lo previo al tecleo manual queda hecho aquí.
   */
  async prepararEmision(
    expedienteId: string,
    aseguradoraId: string,
    vigenciaInicio: Date,
    actorUserId: string,
  ) {
    const expediente = await this.prisma.expediente.findUnique({
      where: { id: expedienteId },
      include: {
        cliente: { include: { unidades: { where: { activo: true } } } },
        propuestasAseguradora: { where: { aseguradoraId } },
        polizas: true,
      },
    });
    if (!expediente) throw new NotFoundException('Expediente no encontrado');

    const estadosValidos: EstadoExpediente[] = [
      EstadoExpediente.aprobado,
      EstadoExpediente.enviado_a_cliente,
    ];
    if (!estadosValidos.includes(expediente.estado)) {
      throw new BadRequestException(
        'El expediente debe estar aprobado (y enviado al cliente) antes de emitir pólizas',
      );
    }
    const propuesta = expediente.propuestasAseguradora[0];
    if (!propuesta) {
      throw new BadRequestException('La aseguradora elegida no tiene propuesta en el expediente');
    }
    if (expediente.cliente.unidades.length === 0) {
      throw new BadRequestException('El cliente no tiene unidades activas que asegurar');
    }

    // Prima por unidad: se reparte la prima de la propuesta entre las unidades.
    const unidades = expediente.cliente.unidades;
    const primaTotal = propuesta.prima ? Number(propuesta.prima) : 0;
    const primaPorUnidad = primaTotal > 0 ? primaTotal / unidades.length : 0;
    const vigenciaFin = new Date(vigenciaInicio);
    vigenciaFin.setFullYear(vigenciaFin.getFullYear() + 1);

    const yaEmitidas = new Set(expediente.polizas.map((p) => p.unidadId));
    const nuevas = unidades.filter((u) => !yaEmitidas.has(u.id));

    const polizas = await this.prisma.$transaction(
      nuevas.map((unidad) =>
        this.prisma.poliza.create({
          data: {
            clienteId: expediente.clienteId,
            unidadId: unidad.id,
            aseguradoraId,
            expedienteId,
            vigenciaInicio,
            vigenciaFin,
            prima: primaPorUnidad as never,
            estado: EstadoPoliza.pendiente_emision,
          },
        }),
      ),
    );

    await this.notificaciones.notificarRol({
      rol: Rol.captura,
      titulo: 'Pólizas listas para capturar en el portal',
      mensaje: `${polizas.length} póliza(s) de ${expediente.cliente.razonSocial} tienen su checklist generado y esperan captura en el portal de la aseguradora.`,
      enlace: `/polizas?expediente=${expedienteId}`,
      expedienteId,
    });

    await this.audit.registrar({
      entidad: 'Expediente',
      entidadId: expedienteId,
      accion: 'preparar_emision',
      actorUserId,
      diff: { aseguradoraId, polizasCreadas: polizas.length },
    });

    return { creadas: polizas.length, polizas };
  }

  listar(filtros: { estado?: EstadoPoliza; clienteId?: string; expedienteId?: string }) {
    return this.prisma.poliza.findMany({
      where: {
        estado: filtros.estado,
        clienteId: filtros.clienteId,
        expedienteId: filtros.expedienteId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        cliente: { select: { id: true, razonSocial: true } },
        unidad: { select: { id: true, vin: true, marca: true, modelo: true } },
        aseguradora: { select: { id: true, nombre: true } },
      },
    });
  }

  async obtener(id: string) {
    const poliza = await this.prisma.poliza.findUnique({
      where: { id },
      include: {
        cliente: true,
        unidad: true,
        aseguradora: true,
        cortes: { orderBy: { fechaCorte: 'asc' } },
        pagos: { orderBy: { fecha: 'desc' } },
        facturas: true,
      },
    });
    if (!poliza) throw new NotFoundException('Póliza no encontrada');
    return poliza;
  }

  /**
   * Marca la póliza como emitida tras capturarla en el portal.
   * Crea el primer corte de cobranza (30 días naturales) automáticamente.
   */
  async marcarEmitida(
    id: string,
    datos: { folio: string; vigenciaInicio?: Date; vigenciaFin?: Date },
    actorUserId: string,
  ) {
    const poliza = await this.obtener(id);
    if (poliza.estado === EstadoPoliza.emitida) {
      throw new BadRequestException('Esta póliza ya está marcada como emitida');
    }

    const inicio = datos.vigenciaInicio ?? poliza.vigenciaInicio ?? new Date();
    const fin = datos.vigenciaFin ?? poliza.vigenciaFin ?? null;
    const primaAnual = poliza.prima ? Number(poliza.prima) : 0;
    const montoMensual = primaAnual > 0 ? Number((primaAnual / 12).toFixed(2)) : 0;

    const [actualizada] = await this.prisma.$transaction([
      this.prisma.poliza.update({
        where: { id },
        data: {
          folio: datos.folio,
          estado: EstadoPoliza.emitida,
          vigenciaInicio: inicio,
          vigenciaFin: fin,
        },
      }),
      // Primer corte: la fecha del siguiente pago es corte + 30 días naturales.
      this.prisma.corte.upsert({
        where: { polizaId_periodo: { polizaId: id, periodo: this.periodoDe(inicio) } },
        create: {
          polizaId: id,
          periodo: this.periodoDe(inicio),
          fechaCorte: inicio,
          fechaProximoPago: sumarDias(inicio, DIAS_ENTRE_CORTES),
          montoEsperado: montoMensual as never,
          estado: EstadoCobranza.vigente,
        },
        update: {},
      }),
    ]);

    await this.audit.registrar({
      entidad: 'Poliza',
      entidadId: id,
      accion: 'emitida',
      actorUserId,
      diff: { folio: datos.folio },
    });

    this.logger.log(`Póliza ${id} emitida con folio ${datos.folio}`);
    return actualizada;
  }

  /**
   * Adjunta el PDF de la póliza y extrae el folio y la vigencia con Claude,
   * para no volver a teclear datos que ya están en el documento.
   */
  async adjuntarPdf(
    id: string,
    archivo: { buffer: Buffer; nombre: string; mime: string },
    actorUserId: string,
  ) {
    const poliza = await this.obtener(id);

    const storageKey = await this.storage.subir(
      `clientes/${poliza.clienteId}/polizas`,
      archivo.nombre,
      archivo.buffer,
      archivo.mime,
    );
    const documento = await this.prisma.documento.create({
      data: {
        clienteId: poliza.clienteId,
        expedienteId: poliza.expedienteId,
        polizaId: poliza.id,
        tipo: TipoDocumento.poliza,
        origen: OrigenDocumento.manual_upload,
        storageKey,
        mime: archivo.mime,
        nombreOriginal: archivo.nombre,
        procesado: true,
      },
    });

    // Lectura automática del folio: el humano sólo confirma.
    let extraido: { folio: string | null; vigenciaInicio: string | null; vigenciaFin: string | null } = {
      folio: null,
      vigenciaInicio: null,
      vigenciaFin: null,
    };
    try {
      extraido = await this.claude.extraerFolioPoliza(archivo.buffer, archivo.mime);
    } catch (err) {
      this.logger.warn(`No se pudo leer el folio del PDF: ${(err as Error).message}`);
    }

    await this.prisma.poliza.update({
      where: { id },
      data: { pdfDocId: documento.id },
    });

    await this.audit.registrar({
      entidad: 'Poliza',
      entidadId: id,
      accion: 'adjuntar_pdf',
      actorUserId,
      diff: { documentoId: documento.id, folioDetectado: extraido.folio },
    });

    return { documentoId: documento.id, sugerencia: extraido };
  }

  /** Periodo de cobranza en formato AAAA-MM. */
  periodoDe(fecha: Date): string {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
  }
}
