import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
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
import { PolizasMadreService } from '../cobranza/polizas-madre.service';

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
    private readonly polizasMadre: PolizasMadreService,
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
    flotaId?: string,
  ) {
    const expediente = await this.prisma.expediente.findUnique({
      where: { id: expedienteId },
      include: {
        cliente: {
          include: {
            unidades: { where: { activo: true, ...(flotaId ? { flotaId } : {}) } },
          },
        },
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
    datos: { aseguradoraId: string; urlNube: string; vigenciaInicio?: Date; flotaId?: string },
    actorUserId: string,
  ) {
    const expediente = await this.prisma.expediente.findUnique({
      where: { id: expedienteId },
      include: {
        cliente: {
          include: {
            unidades: { where: { activo: true, ...(datos.flotaId ? { flotaId: datos.flotaId } : {}) } },
          },
        },
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

  listar(filtros: {
    estado?: EstadoPoliza;
    clienteId?: string;
    expedienteId?: string;
    serie?: string;
  }) {
    const serie = filtros.serie?.trim();
    return this.prisma.poliza.findMany({
      where: {
        estado: filtros.estado,
        clienteId: filtros.clienteId,
        expedienteId: filtros.expedienteId,
        ...(serie ? { unidad: { vin: { contains: serie, mode: 'insensitive' } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        cliente: { select: { id: true, razonSocial: true } },
        unidad: { select: { id: true, vin: true, marca: true, modelo: true } },
        aseguradora: { select: { id: true, nombre: true } },
      },
    });
  }

  /** Estado de vigencia legible de una póliza para la consulta por serie. */
  private estadoVigencia(poliza: {
    estado: EstadoPoliza;
    vigenciaFin: Date | null;
  }): 'ACTIVA' | 'CANCELADA' | 'INACTIVA' {
    if (poliza.estado === EstadoPoliza.cancelada) return 'CANCELADA';
    if (poliza.estado === EstadoPoliza.emitida) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      if (poliza.vigenciaFin && poliza.vigenciaFin < hoy) return 'INACTIVA'; // vencida
      return 'ACTIVA';
    }
    return 'INACTIVA'; // pendiente de emisión
  }

  /**
   * Consulta por número de serie (VIN): localiza la unidad y su póliza más
   * reciente, y responde el estado de vigencia + cliente, RFC y fechas.
   */
  async consultarPorSerie(serie: string) {
    const s = serie.trim();
    if (!s) throw new BadRequestException('Escribe un número de serie');

    const unidad = await this.prisma.unidad.findFirst({
      where: { vin: { equals: s, mode: 'insensitive' } },
      include: {
        polizas: {
          orderBy: { createdAt: 'desc' },
          include: {
            cliente: { select: { id: true, razonSocial: true, rfc: true } },
            aseguradora: { select: { nombre: true } },
            polizaMadre: { select: { id: true } },
          },
        },
      },
    });

    if (!unidad || unidad.polizas.length === 0) {
      return { serie: s, encontrada: false as const };
    }

    const p = unidad.polizas[0];
    return {
      serie: s,
      encontrada: true as const,
      vigencia: this.estadoVigencia(p),
      poliza: {
        id: p.id,
        folio: p.folio,
        estado: p.estado,
        vigenciaInicio: p.vigenciaInicio,
        vigenciaFin: p.vigenciaFin,
        aseguradora: p.aseguradora.nombre,
        cliente: p.cliente,
        polizaMadreId: p.polizaMadreId,
      },
      unidad: {
        vin: unidad.vin,
        marca: unidad.marca,
        modelo: unidad.modelo,
        numeroEconomico: unidad.numeroEconomico,
      },
      historial: unidad.polizas.map((h) => ({
        id: h.id,
        folio: h.folio,
        aseguradora: h.aseguradora.nombre,
        vigencia: this.estadoVigencia(h),
        vigenciaInicio: h.vigenciaInicio,
        vigenciaFin: h.vigenciaFin,
      })),
    };
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
   * Marca la póliza como emitida tras capturarla en el portal. La vincula a su
   * Póliza Madre (una por cliente+aseguradora) y deja que ésta arranque el plan
   * de cobranza (parcialidades). No crea cortes por póliza: la cobranza vive en
   * la Madre.
   */
  async marcarEmitida(
    id: string,
    datos: {
      serie?: string;
      folio?: string;
      vigenciaInicio?: Date;
      vigenciaFin?: Date;
      prima?: number;
    },
    actorUserId: string,
  ) {
    const poliza = await this.obtener(id);
    if (poliza.estado === EstadoPoliza.emitida) {
      throw new BadRequestException('Esta póliza ya está marcada como emitida');
    }

    const inicio = datos.vigenciaInicio ?? poliza.vigenciaInicio ?? new Date();
    const fin = datos.vigenciaFin ?? poliza.vigenciaFin ?? null;
    const serie = datos.serie?.trim();

    // Al emitir se captura/actualiza el número de serie (VIN) de la unidad.
    if (serie) {
      await this.prisma.unidad.update({ where: { id: poliza.unidadId }, data: { vin: serie } });
    }

    const actualizada = await this.prisma.poliza.update({
      where: { id },
      data: {
        ...(datos.folio ? { folio: datos.folio } : {}),
        estado: EstadoPoliza.emitida,
        vigenciaInicio: inicio,
        vigenciaFin: fin,
        ...(datos.prima != null ? { prima: datos.prima as never } : {}),
      },
    });

    // Vincula la hija a su Madre y, si es la primera emisión, ancla el plan.
    await this.polizasMadre.vincularHija(id, { fechaEmision: inicio });

    await this.audit.registrar({
      entidad: 'Poliza',
      entidadId: id,
      accion: 'emitida',
      actorUserId,
      diff: { serie: serie ?? null, folio: datos.folio ?? null },
    });

    this.logger.log(`Póliza ${id} emitida (serie ${serie ?? 's/serie'})`);
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
      prima?: number;
      primaNeta?: number;
      financiamiento?: number;
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
        ...(datos.prima !== undefined ? { prima: datos.prima as never } : {}),
        ...(datos.primaNeta !== undefined ? { primaNeta: datos.primaNeta as never } : {}),
        ...(datos.financiamiento !== undefined
          ? { financiamiento: datos.financiamiento as never }
          : {}),
        ...(datos.gastosExpedicion !== undefined
          ? { gastosExpedicion: datos.gastosExpedicion as never }
          : {}),
        ...(datos.iva !== undefined ? { iva: datos.iva as never } : {}),
        ...(datos.primaTotal !== undefined ? { primaTotal: datos.primaTotal as never } : {}),
        ...(datos.numeroPagos !== undefined ? { numeroPagos: datos.numeroPagos } : {}),
      },
    });

    // El desglose manual vive por hija; la Madre recalcula su total y refresca
    // la parcialidad abierta. Si la póliza aún no tiene Madre, se crea/vincula.
    await this.polizasMadre.vincularHija(id);

    await this.audit.registrar({
      entidad: 'Poliza',
      entidadId: id,
      accion: 'actualizar_cobranza',
      actorUserId,
      diff: { ...datos },
    });

    return poliza;
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
