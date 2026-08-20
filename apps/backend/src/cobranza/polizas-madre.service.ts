import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EstadoCobranza, Periodicidad, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  DIAS_A_PRIMER_PAGO,
  EntradaPlan,
  Parcialidad,
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

  /** Find-or-create de la Madre por (cliente, aseguradora). */
  async asegurarMadre(clienteId: string, aseguradoraId: string) {
    return this.prisma.polizaMadre.upsert({
      where: { clienteId_aseguradoraId: { clienteId, aseguradoraId } },
      create: { clienteId, aseguradoraId },
      update: {},
    });
  }

  /**
   * Vincula una póliza a la Madre de su (cliente, aseguradora) y recalcula
   * los totales. Si `fechaEmision` viene y la Madre aún no la tenía, fija el
   * ancla del plan (primera emisión) y abre la primera parcialidad.
   */
  async vincularHija(polizaId: string, opciones: { fechaEmision?: Date } = {}) {
    const poliza = await this.prisma.poliza.findUnique({ where: { id: polizaId } });
    if (!poliza) return null;

    const madre = await this.asegurarMadre(poliza.clienteId, poliza.aseguradoraId);
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
    const hijas = await this.prisma.poliza.findMany({ where: { polizaMadreId: madreId } });
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

    await this.regenerarCorteAbierto(madreId);
  }

  /** Fija periodicidad y/o fecha de emisión, y regenera el calendario. */
  async configurarPlan(
    madreId: string,
    datos: { periodicidad?: Periodicidad; fechaEmision?: Date },
    actorUserId: string,
  ) {
    const madre = await this.obtener(madreId);
    const periodicidad = datos.periodicidad ?? madre.periodicidad;
    const fechaEmision = datos.fechaEmision ?? madre.fechaEmision ?? undefined;
    const numeroPagos = numeroPagosDe(periodicidad);

    await this.prisma.polizaMadre.update({
      where: { id: madreId },
      data: {
        periodicidad,
        numeroPagos,
        fechaEmision: fechaEmision ?? null,
        primeraFechaPago: fechaEmision
          ? sumarDiasNaturales(fechaEmision, DIAS_A_PRIMER_PAGO)
          : null,
      },
    });

    await this.regenerarCorteAbierto(madreId);
    await this.audit.registrar({
      entidad: 'PolizaMadre',
      entidadId: madreId,
      accion: 'configurar_plan',
      actorUserId,
      diff: { periodicidad, fechaEmision: fechaEmision ?? null } as Prisma.InputJsonValue,
    });
    return this.obtener(madreId);
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
    return this.upsertParcialidad(madre.id, p);
  }

  /** Crea o actualiza (fecha/monto) una parcialidad sin pisar su estado de pago. */
  private upsertParcialidad(madreId: string, p: Parcialidad) {
    return this.prisma.corteMadre.upsert({
      where: {
        polizaMadreId_numeroParcialidad: {
          polizaMadreId: madreId,
          numeroParcialidad: p.numeroParcialidad,
        },
      },
      create: {
        polizaMadreId: madreId,
        numeroParcialidad: p.numeroParcialidad,
        periodo: p.periodo,
        fechaCorte: p.fechaVencimiento,
        fechaVencimiento: p.fechaVencimiento,
        montoEsperado: p.montoEsperado as never,
        esPrimerPago: p.esPrimerPago,
        estado: EstadoCobranza.vigente,
      },
      update: {
        periodo: p.periodo,
        fechaCorte: p.fechaVencimiento,
        fechaVencimiento: p.fechaVencimiento,
        montoEsperado: p.montoEsperado as never,
        esPrimerPago: p.esPrimerPago,
      },
    });
  }
}
