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

  /**
   * Alta de pólizas por LIGA de nube (Dropbox). El técnico baja los PDF del
   * portal de la aseguradora, los sube a su nube y aquí registra la liga.
   * Crea una póliza por unidad activa (todas comparten la misma liga) sin
   * depender de que exista una propuesta en el expediente; si la hay, usa su
   * prima como prellenado. Las pólizas quedan `pendiente_emision` para emitir.
   */
  async crearDesdeEnlace(
    expedienteId: string,
    datos: { aseguradoraId: string; urlNube: string; vigenciaInicio?: Date },
    actorUserId: string,
  ) {
    const expediente = await this.prisma.expediente.findUnique({
      where: { id: expedienteId },
      include: {
        cliente: { include: { unidades: { where: { activo: true } } } },
        propuestasAseguradora: { where: { aseguradoraId: datos.aseguradoraId } },
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
        'El expediente debe estar aprobado antes de registrar pólizas',
      );
    }
    if (expediente.cliente.unidades.length === 0) {
      throw new BadRequestException('El cliente no tiene unidades activas que asegurar');
    }

    const unidades = expediente.cliente.unidades;
    // Prima de la propuesta (si existe) repartida entre unidades, como prellenado.
    const propuesta = expediente.propuestasAseguradora[0];
    const primaTotal = propuesta?.prima ? Number(propuesta.prima) : 0;
    const primaPorUnidad = primaTotal > 0 ? primaTotal / unidades.length : null;

    const vigenciaInicio = datos.vigenciaInicio ?? null;
    let vigenciaFin: Date | null = null;
    if (vigenciaInicio) {
      vigenciaFin = new Date(vigenciaInicio);
      vigenciaFin.setFullYear(vigenciaFin.getFullYear() + 1);
    }

    const yaEmitidas = new Set(expediente.polizas.map((p) => p.unidadId));
    const nuevas = unidades.filter((u) => !yaEmitidas.has(u.id));
    if (nuevas.length === 0) {
      throw new BadRequestException('Todas las unidades activas ya tienen póliza en este expediente');
    }

    const polizas = await this.prisma.$transaction(
      nuevas.map((unidad) =>
        this.prisma.poliza.create({
          data: {
            clienteId: expediente.clienteId,
            unidadId: unidad.id,
            aseguradoraId: datos.aseguradoraId,
            expedienteId,
            vigenciaInicio,
            vigenciaFin,
            prima: primaPorUnidad as never,
            urlNube: datos.urlNube,
            estado: EstadoPoliza.pendiente_emision,
          },
        }),
      ),
    );

    await this.notificaciones.notificarRol({
      rol: Rol.captura,
      titulo: 'Pólizas registradas por liga',
      mensaje: `${polizas.length} póliza(s) de ${expediente.cliente.razonSocial} se registraron con su liga de nube y están listas para emitir.`,
      enlace: `/polizas?expediente=${expedienteId}`,
      expedienteId,
    });

    await this.audit.registrar({
      entidad: 'Expediente',
      entidadId: expedienteId,
      accion: 'polizas_por_enlace',
      actorUserId,
      diff: { aseguradoraId: datos.aseguradoraId, polizasCreadas: polizas.length, urlNube: datos.urlNube },
    });

    return { creadas: polizas.length, polizas };
  }

  /** Corrige o agrega la liga de nube de una póliza ya existente. */
  async actualizarEnlace(id: string, urlNube: string, actorUserId: string) {
    await this.obtener(id);
    const poliza = await this.prisma.poliza.update({
      where: { id },
      data: { urlNube },
    });
    await this.audit.registrar({
      entidad: 'Poliza',
      entidadId: id,
      accion: 'actualizar_enlace',
      actorUserId,
      diff: { urlNube },
    });
    return poliza;
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
    datos: { folio: string; vigenciaInicio?: Date; vigenciaFin?: Date; prima?: number },
    actorUserId: string,
  ) {
    const poliza = await this.obtener(id);
    if (poliza.estado === EstadoPoliza.emitida) {
      throw new BadRequestException('Esta póliza ya está marcada como emitida');
    }

    const inicio = datos.vigenciaInicio ?? poliza.vigenciaInicio ?? new Date();
    const fin = datos.vigenciaFin ?? poliza.vigenciaFin ?? null;
    // Importe por periodo: de los datos de cobranza capturados (primaTotal /
    // numeroPagos); si no hay, cae a la prima anual entre 12.
    const montoMensual = this.montoPorPeriodo({
      ...poliza,
      prima: datos.prima != null ? (datos.prima as never) : poliza.prima,
    });

    const [actualizada] = await this.prisma.$transaction([
      this.prisma.poliza.update({
        where: { id },
        data: {
          folio: datos.folio,
          estado: EstadoPoliza.emitida,
          vigenciaInicio: inicio,
          vigenciaFin: fin,
          ...(datos.prima != null ? { prima: datos.prima as never } : {}),
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
   * Captura/actualiza a mano los datos de cobranza de la póliza (prima neta,
   * gastos de expedición, IVA, total y número de pagos). Como no hay API con la
   * aseguradora, estos importes se teclean desde el recibo. Si la póliza ya
   * tiene un corte abierto, se actualiza su monto esperado al nuevo importe.
   */
  async actualizarCobranza(
    id: string,
    datos: {
      folio?: string;
      primaNeta?: number;
      gastosExpedicion?: number;
      iva?: number;
      primaTotal?: number;
      numeroPagos?: number;
    },
    actorUserId: string,
  ) {
    await this.obtener(id);

    const poliza = await this.prisma.poliza.update({
      where: { id },
      data: {
        ...(datos.folio !== undefined ? { folio: datos.folio || null } : {}),
        ...(datos.primaNeta !== undefined ? { primaNeta: datos.primaNeta as never } : {}),
        ...(datos.gastosExpedicion !== undefined
          ? { gastosExpedicion: datos.gastosExpedicion as never }
          : {}),
        ...(datos.iva !== undefined ? { iva: datos.iva as never } : {}),
        ...(datos.primaTotal !== undefined ? { primaTotal: datos.primaTotal as never } : {}),
        ...(datos.numeroPagos !== undefined ? { numeroPagos: datos.numeroPagos } : {}),
      },
    });

    // Reflejar el nuevo importe en el corte abierto (si lo hay).
    const monto = this.montoPorPeriodo(poliza);
    if (monto > 0) {
      const corteAbierto = await this.prisma.corte.findFirst({
        where: { polizaId: id, estado: { not: EstadoCobranza.pagado } },
        orderBy: { fechaProximoPago: 'asc' },
      });
      if (corteAbierto) {
        await this.prisma.corte.update({
          where: { id: corteAbierto.id },
          data: { montoEsperado: monto as never },
        });
      }
    }

    await this.audit.registrar({
      entidad: 'Poliza',
      entidadId: id,
      accion: 'actualizar_cobranza',
      actorUserId,
      diff: { ...datos, montoPorPeriodo: monto },
    });

    return poliza;
  }

  /**
   * Importe a cobrar por periodo: primaTotal / numeroPagos. Si no se capturaron
   * esos datos, cae a la prima anual entre 12 (comportamiento anterior).
   */
  private montoPorPeriodo(poliza: {
    primaTotal?: unknown;
    numeroPagos?: number | null;
    prima?: unknown;
  }): number {
    const total = poliza.primaTotal != null ? Number(poliza.primaTotal) : 0;
    const pagos = poliza.numeroPagos ?? 0;
    if (total > 0 && pagos > 0) return Number((total / pagos).toFixed(2));
    const prima = poliza.prima != null ? Number(poliza.prima) : 0;
    return prima > 0 ? Number((prima / 12).toFixed(2)) : 0;
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
