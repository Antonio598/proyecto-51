import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EstadoCobranza, EstadoPoliza, Periodicidad, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  DIAS_A_PRIMER_PAGO,
  EntradaPlan,
  Parcialidad,
  diasEntrePagos,
  generarCalendario,
  numeroPagosDe,
  sumarDiasNaturales,
} from './plan-pagos';

const num = (v: unknown): number => (v != null ? Number(v) : 0);

/**
 * Póliza Madre — concentra la cobranza de un cliente en una aseguradora.
 *
 * Agrupa las pólizas hijas/endosos, mantiene los totales consolidados y lleva el
 * plan de pagos (periodicidad + parcialidades). El importe que se cobra al
 * cliente es el total de la Madre; el desglose por hija sale de sumar sus partes.
 */
@Injectable()
export class PolizasMadreService {
  private readonly logger = new Logger(PolizasMadreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Find-or-create de la Madre por (cliente, flota, aseguradora). */
  async asegurarMadre(clienteId: string, aseguradoraId: string, flotaId: string | null) {
    const existente = await this.prisma.polizaMadre.findFirst({
      where: { clienteId, aseguradoraId, flotaId },
    });
    if (existente) return existente;
    return this.prisma.polizaMadre.create({ data: { clienteId, aseguradoraId, flotaId } });
  }

  /** Flota "General" del cliente (se crea si no existe) para unidades sin flota. */
  private async flotaGeneral(clienteId: string) {
    const existente = await this.prisma.flota.findFirst({
      where: { clienteId, nombre: 'General' },
    });
    if (existente) return existente;
    return this.prisma.flota.create({ data: { clienteId, nombre: 'General' } });
  }

  /**
   * Vincula una póliza a la Madre de su (cliente, flota, aseguradora) y recalcula
   * los totales. Cada flota se cobra por separado; si la unidad no tiene flota,
   * se asigna a la flota "General" del cliente. Si `fechaEmision` viene y la
   * Madre aún no la tenía, fija el ancla del plan y abre la primera parcialidad.
   */
  async vincularHija(polizaId: string, opciones: { fechaEmision?: Date } = {}) {
    const poliza = await this.prisma.poliza.findUnique({
      where: { id: polizaId },
      include: { unidad: { select: { id: true, flotaId: true } } },
    });
    if (!poliza) return null;

    // Resuelve la flota de la unidad (o la crea como "General").
    let flotaId = poliza.unidad.flotaId;
    if (!flotaId) {
      const general = await this.flotaGeneral(poliza.clienteId);
      flotaId = general.id;
      await this.prisma.unidad.update({
        where: { id: poliza.unidad.id },
        data: { flotaId },
      });
    }

    const madre = await this.asegurarMadre(poliza.clienteId, poliza.aseguradoraId, flotaId);
    if (poliza.polizaMadreId !== madre.id) {
      await this.prisma.poliza.update({
        where: { id: polizaId },
        data: { polizaMadreId: madre.id },
      });
    }

    if (opciones.fechaEmision && !madre.fechaEmision) {
      await this.prisma.polizaMadre.update({
        where: { id: madre.id },
        data: {
          fechaEmision: opciones.fechaEmision,
          primeraFechaPago: sumarDiasNaturales(opciones.fechaEmision, DIAS_A_PRIMER_PAGO),
          numeroPagos: numeroPagosDe(madre.periodicidad),
        },
      });
    }

    await this.recalcularTotales(madre.id);
    return madre.id;
  }

  /** Recalcula los totales consolidados sumando las hijas y refresca el corte abierto. */
  async recalcularTotales(madreId: string) {
    const madre = await this.obtener(madreId);

    // Si los totales se capturaron a mano en la Madre, no se sobreescriben.
    if (!madre.totalesManual) {
      // Las pólizas canceladas (bajas) no cuentan para el total de la Madre.
      const hijas = await this.prisma.poliza.findMany({
        where: { polizaMadreId: madreId, estado: { not: EstadoPoliza.cancelada } },
      });
      const suma = (campo: keyof (typeof hijas)[number]) =>
        hijas.reduce((s, h) => s + num(h[campo] as unknown), 0);

      const primaNeta = suma('primaNeta');
      const financiamiento = suma('financiamiento');
      const gastosExpedicion = suma('gastosExpedicion');
      const iva = suma('iva');
      let primaTotal = suma('primaTotal');
      // Si nadie capturó el total, derivarlo de las partes.
      if (primaTotal <= 0) primaTotal = primaNeta + financiamiento + gastosExpedicion + iva;
      // Último recurso: la prima anual (comportamiento previo, plan de pagos iguales).
      if (primaTotal <= 0) primaTotal = suma('prima');

      await this.prisma.polizaMadre.update({
        where: { id: madreId },
        data: {
          primaNeta: primaNeta as never,
          financiamiento: financiamiento as never,
          gastosExpedicion: gastosExpedicion as never,
          iva: iva as never,
          primaTotal: primaTotal as never,
        },
      });
    }

    await this.regenerarCorteAbierto(madreId);
  }

  /**
   * Edita la Póliza Madre: periodicidad, fecha de emisión y, opcionalmente, los
   * totales capturados a mano (que entonces dejan de recalcularse por suma de
   * hijas). Regenera el calendario.
   */
  async configurarPlan(
    madreId: string,
    datos: {
      periodicidad?: Periodicidad;
      fechaEmision?: Date;
      totalesManual?: boolean;
      primaNeta?: number;
      financiamiento?: number;
      gastosExpedicion?: number;
      iva?: number;
      primaTotal?: number;
    },
    actorUserId: string,
  ) {
    const madre = await this.obtener(madreId);
    const periodicidad = datos.periodicidad ?? madre.periodicidad;
    const fechaEmision = datos.fechaEmision ?? madre.fechaEmision ?? undefined;
    const numeroPagos = numeroPagosDe(periodicidad);

    const dec = (v?: number) => (v !== undefined ? (v as never) : undefined);

    await this.prisma.polizaMadre.update({
      where: { id: madreId },
      data: {
        periodicidad,
        numeroPagos,
        fechaEmision: fechaEmision ?? null,
        primeraFechaPago: fechaEmision
          ? sumarDiasNaturales(fechaEmision, DIAS_A_PRIMER_PAGO)
          : null,
        ...(datos.totalesManual !== undefined ? { totalesManual: datos.totalesManual } : {}),
        ...(datos.primaNeta !== undefined ? { primaNeta: dec(datos.primaNeta) } : {}),
        ...(datos.financiamiento !== undefined ? { financiamiento: dec(datos.financiamiento) } : {}),
        ...(datos.gastosExpedicion !== undefined
          ? { gastosExpedicion: dec(datos.gastosExpedicion) }
          : {}),
        ...(datos.iva !== undefined ? { iva: dec(datos.iva) } : {}),
        ...(datos.primaTotal !== undefined ? { primaTotal: dec(datos.primaTotal) } : {}),
      },
    });

    // Si se apagan los totales manuales, se recalculan desde las hijas.
    await this.recalcularTotales(madreId);
    await this.audit.registrar({
      entidad: 'PolizaMadre',
      entidadId: madreId,
      accion: 'configurar_plan',
      actorUserId,
      diff: { ...datos, fechaEmision: fechaEmision ?? null } as unknown as Prisma.InputJsonValue,
    });
    return this.obtener(madreId);
  }

  /** Edita a mano la fecha de vencimiento de una parcialidad (no se regenera). */
  async editarVencimiento(
    madreId: string,
    numeroParcialidad: number,
    fecha: Date,
    actorUserId: string,
  ) {
    const corte = await this.prisma.corteMadre.findUnique({
      where: { polizaMadreId_numeroParcialidad: { polizaMadreId: madreId, numeroParcialidad } },
    });
    if (!corte) throw new NotFoundException('Parcialidad no encontrada');
    const actualizado = await this.prisma.corteMadre.update({
      where: { id: corte.id },
      data: { fechaVencimiento: fecha, fechaCorte: fecha, fechaManual: true },
    });
    await this.audit.registrar({
      entidad: 'CorteMadre',
      entidadId: corte.id,
      accion: 'editar_vencimiento',
      actorUserId,
      diff: { numeroParcialidad, fecha: fecha.toISOString() },
    });
    return actualizado;
  }

  /**
   * Marca la parcialidad vigente de la Madre como pagada (salda la Madre y
   * todos sus endosos del periodo), guarda el momento del pago y abre la
   * siguiente parcialidad si el plan aún tiene pagos.
   */
  async marcarPagado(madreId: string, actorUserId: string) {
    const abierto = await this.prisma.corteMadre.findFirst({
      where: { polizaMadreId: madreId, estado: { not: EstadoCobranza.pagado } },
      orderBy: { numeroParcialidad: 'asc' },
    });
    if (!abierto) {
      throw new BadRequestException('No hay una parcialidad pendiente de pago en esta Póliza Madre');
    }
    return this.cerrarParcialidad(abierto.id, actorUserId);
  }

  /**
   * Cierra una parcialidad concreta (por su id) y abre la siguiente. Es el
   * punto único usado tanto por "marcar como pagado" como por el flujo de pagos
   * conciliados.
   */
  async cerrarParcialidad(corteMadreId: string, actorUserId?: string) {
    const corte = await this.prisma.corteMadre.findUnique({
      where: { id: corteMadreId },
      include: { polizaMadre: true },
    });
    if (!corte) throw new NotFoundException('Parcialidad no encontrada');

    if (corte.estado !== EstadoCobranza.pagado) {
      await this.prisma.corteMadre.update({
        where: { id: corteMadreId },
        data: { estado: EstadoCobranza.pagado, pagadoEn: new Date() },
      });
    }

    const siguiente = await this.abrirSiguienteParcialidad(
      corte.polizaMadre,
      corte.numeroParcialidad,
    );

    await this.audit.registrar({
      entidad: 'PolizaMadre',
      entidadId: corte.polizaMadreId,
      accion: 'pago_parcialidad',
      actorUserId: actorUserId ?? null,
      diff: {
        parcialidad: corte.numeroParcialidad,
        siguiente: siguiente?.numeroParcialidad ?? null,
      } as Prisma.InputJsonValue,
    });

    this.logger.log(
      `Madre ${corte.polizaMadreId}: parcialidad ${corte.numeroParcialidad} pagada; ` +
        `siguiente: ${siguiente?.numeroParcialidad ?? 'n/a'}`,
    );
    return { pagada: corte.numeroParcialidad, siguiente };
  }

  /** Detalle completo de la Madre: totales, calendario, hijas y pagos. */
  async detalle(madreId: string) {
    const madre = await this.prisma.polizaMadre.findUnique({
      where: { id: madreId },
      include: {
        cliente: { select: { id: true, razonSocial: true, rfc: true, contactoEmail: true } },
        aseguradora: { select: { id: true, nombre: true } },
        flota: { select: { id: true, nombre: true } },
        hijas: {
          orderBy: { createdAt: 'asc' },
          include: { unidad: { select: { vin: true, marca: true, modelo: true } } },
        },
        cortes: {
          orderBy: { numeroParcialidad: 'asc' },
          include: { pagos: true, recordatorios: { orderBy: { enviadoEn: 'desc' } } },
        },
      },
    });
    if (!madre) throw new NotFoundException('Póliza Madre no encontrada');

    return {
      ...madre,
      calendario: this.calendario(madre),
    };
  }

  /** Lista de Pólizas Madre (opcionalmente por cliente). */
  listar(clienteId?: string) {
    return this.prisma.polizaMadre.findMany({
      where: { clienteId },
      orderBy: { updatedAt: 'desc' },
      include: {
        cliente: { select: { id: true, razonSocial: true } },
        aseguradora: { select: { nombre: true } },
        flota: { select: { nombre: true } },
        _count: { select: { hijas: true } },
        cortes: {
          where: { estado: { not: EstadoCobranza.pagado } },
          orderBy: { numeroParcialidad: 'asc' },
          take: 1,
        },
      },
    });
  }

  async obtener(madreId: string) {
    const madre = await this.prisma.polizaMadre.findUnique({ where: { id: madreId } });
    if (!madre) throw new NotFoundException('Póliza Madre no encontrada');
    return madre;
  }

  // ── Internas ──

  /** Traduce los datos de la Madre al calendario de parcialidades. */
  calendario(madre: {
    primaNeta: Prisma.Decimal | null;
    financiamiento: Prisma.Decimal | null;
    gastosExpedicion: Prisma.Decimal | null;
    iva: Prisma.Decimal | null;
    primaTotal: Prisma.Decimal | null;
    periodicidad: Periodicidad;
    fechaEmision: Date | null;
  }): Parcialidad[] {
    if (!madre.fechaEmision) return [];
    const entrada: EntradaPlan = {
      primaNeta: num(madre.primaNeta),
      financiamiento: num(madre.financiamiento),
      gastosExpedicion: num(madre.gastosExpedicion),
      iva: num(madre.iva),
      primaTotal: num(madre.primaTotal),
      periodicidad: madre.periodicidad,
      fechaEmision: madre.fechaEmision,
    };
    return generarCalendario(entrada);
  }

  /**
   * Asegura que exista el corte de la parcialidad vigente (la primera no pagada)
   * con importe y fecha al día. No crea las futuras por adelantado: se abren al
   * pagar la anterior.
   */
  private async regenerarCorteAbierto(madreId: string) {
    const madre = await this.obtener(madreId);
    const cal = this.calendario(madre);
    if (cal.length === 0) return;

    const pagadas = await this.prisma.corteMadre.count({
      where: { polizaMadreId: madreId, estado: EstadoCobranza.pagado },
    });
    if (pagadas >= cal.length) return; // plan saldado

    const p = cal[pagadas];
    await this.upsertParcialidad(madreId, p);
  }

  private async abrirSiguienteParcialidad(
    madre: {
      id: string;
      numeroPagos: number;
      primaNeta: Prisma.Decimal | null;
      financiamiento: Prisma.Decimal | null;
      gastosExpedicion: Prisma.Decimal | null;
      iva: Prisma.Decimal | null;
      primaTotal: Prisma.Decimal | null;
      periodicidad: Periodicidad;
      fechaEmision: Date | null;
    },
    parcialidadPagada: number,
  ) {
    const cal = this.calendario(madre);
    const siguienteNum = parcialidadPagada + 1;
    if (siguienteNum > madre.numeroPagos || siguienteNum > cal.length) return null;
    const p = cal[siguienteNum - 1];
    // La fecha se encadena desde la parcialidad recién pagada (respeta ediciones
    // manuales): siguiente = fecha pagada + días de la periodicidad.
    const pagada = await this.prisma.corteMadre.findUnique({
      where: {
        polizaMadreId_numeroParcialidad: {
          polizaMadreId: madre.id,
          numeroParcialidad: parcialidadPagada,
        },
      },
    });
    const fecha = pagada
      ? sumarDiasNaturales(pagada.fechaVencimiento, diasEntrePagos(madre.periodicidad))
      : p.fechaVencimiento;
    return this.upsertParcialidad(madre.id, p, fecha);
  }

  /** Crea o actualiza una parcialidad. No pisa la fecha si es manual. */
  private async upsertParcialidad(madreId: string, p: Parcialidad, fechaOverride?: Date) {
    const fecha = fechaOverride ?? p.fechaVencimiento;
    const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    const existente = await this.prisma.corteMadre.findUnique({
      where: {
        polizaMadreId_numeroParcialidad: {
          polizaMadreId: madreId,
          numeroParcialidad: p.numeroParcialidad,
        },
      },
    });

    if (existente) {
      return this.prisma.corteMadre.update({
        where: { id: existente.id },
        data: {
          montoEsperado: p.montoEsperado as never,
          esPrimerPago: p.esPrimerPago,
          // Sólo se actualiza la fecha si NO fue editada a mano.
          ...(existente.fechaManual ? {} : { periodo, fechaCorte: fecha, fechaVencimiento: fecha }),
        },
      });
    }

    return this.prisma.corteMadre.create({
      data: {
        polizaMadreId: madreId,
        numeroParcialidad: p.numeroParcialidad,
        periodo,
        fechaCorte: fecha,
        fechaVencimiento: fecha,
        montoEsperado: p.montoEsperado as never,
        esPrimerPago: p.esPrimerPago,
        estado: EstadoCobranza.vigente,
      },
    });
  }
}
