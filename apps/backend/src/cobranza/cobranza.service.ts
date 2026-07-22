import { Injectable, Logger } from '@nestjs/common';
import { EstadoCobranza, EstadoPoliza } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { DIAS_ENTRE_CORTES, sumarDias } from '../polizas/polizas.service';

/** Días de anticipación con los que un corte se marca "por vencer". */
const DIAS_AVISO = 5;

@Injectable()
export class CobranzaService {
  private readonly logger = new Logger(CobranzaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /**
   * Módulo 9 — proceso que corre n8n periódicamente.
   * Actualiza los estados de cobranza y envía recordatorios por WhatsApp.
   */
  async procesarCiclo(opciones: { enviarRecordatorios?: boolean } = {}) {
    const hoy = this.hoy();
    const limiteAviso = sumarDias(hoy, DIAS_AVISO);

    const cortes = await this.prisma.corte.findMany({
      where: { estado: { not: EstadoCobranza.pagado } },
      include: {
        poliza: {
          include: {
            cliente: { select: { id: true, razonSocial: true, whatsappNumber: true } },
            aseguradora: { select: { nombre: true } },
          },
        },
      },
    });

    let vencidos = 0;
    let porVencer = 0;
    const recordatorios: { cliente: string; enviado: boolean; motivo?: string }[] = [];

    // 1. Recalcular el estado de cada corte.
    for (const corte of cortes) {
      let nuevo: EstadoCobranza = EstadoCobranza.vigente;
      if (corte.fechaProximoPago < hoy) {
        nuevo = EstadoCobranza.vencido;
        vencidos++;
      } else if (corte.fechaProximoPago <= limiteAviso) {
        nuevo = EstadoCobranza.por_vencer;
        porVencer++;
      }
      if (nuevo !== corte.estado) {
        await this.prisma.corte.update({ where: { id: corte.id }, data: { estado: nuevo } });
      }
      corte.estado = nuevo;
    }

    // 2. Un recordatorio por cliente (no uno por unidad, para no saturarlo).
    if (opciones.enviarRecordatorios !== false) {
      const porCliente = new Map<string, typeof cortes>();
      for (const corte of cortes) {
        if (corte.estado === EstadoCobranza.vigente) continue;
        const lista = porCliente.get(corte.poliza.clienteId) ?? [];
        lista.push(corte);
        porCliente.set(corte.poliza.clienteId, lista);
      }

      for (const [, lista] of porCliente) {
        const cliente = lista[0].poliza.cliente;
        if (!cliente.whatsappNumber) {
          recordatorios.push({
            cliente: cliente.razonSocial,
            enviado: false,
            motivo: 'sin WhatsApp registrado',
          });
          continue;
        }
        try {
          await this.whatsapp.enviarTexto(
            cliente.whatsappNumber,
            this.textoRecordatorio(cliente.razonSocial, lista),
          );
          recordatorios.push({ cliente: cliente.razonSocial, enviado: true });
        } catch (err) {
          this.logger.error(
            `Recordatorio fallido para ${cliente.razonSocial}: ${(err as Error).message}`,
          );
          recordatorios.push({
            cliente: cliente.razonSocial,
            enviado: false,
            motivo: 'error de envío',
          });
        }
      }
    }

    this.logger.log(
      `Ciclo de cobranza: ${cortes.length} cortes revisados, ${vencidos} vencidos, ${porVencer} por vencer`,
    );
    return {
      revisados: cortes.length,
      vencidos,
      porVencer,
      recordatorios,
      ejecutadoEn: new Date().toISOString(),
    };
  }

  /** Dashboard de cobranza: qué está vigente, por vencer y vencido. */
  async dashboard() {
    const cortes = await this.prisma.corte.findMany({
      where: { estado: { not: EstadoCobranza.pagado } },
      include: {
        poliza: {
          include: {
            cliente: { select: { id: true, razonSocial: true } },
            unidad: { select: { vin: true, marca: true, modelo: true } },
            aseguradora: { select: { nombre: true } },
          },
        },
      },
      orderBy: { fechaProximoPago: 'asc' },
    });

    const resumen = {
      vigente: { cantidad: 0, monto: 0 },
      por_vencer: { cantidad: 0, monto: 0 },
      vencido: { cantidad: 0, monto: 0 },
    };
    const porCliente = new Map<
      string,
      { clienteId: string; razonSocial: string; vencido: number; porVencer: number; monto: number }
    >();

    for (const c of cortes) {
      const monto = c.montoEsperado ? Number(c.montoEsperado) : 0;
      const grupo = resumen[c.estado as keyof typeof resumen];
      if (grupo) {
        grupo.cantidad++;
        grupo.monto += monto;
      }

      const cliente = c.poliza.cliente;
      const acumulado = porCliente.get(cliente.id) ?? {
        clienteId: cliente.id,
        razonSocial: cliente.razonSocial,
        vencido: 0,
        porVencer: 0,
        monto: 0,
      };
      if (c.estado === EstadoCobranza.vencido) acumulado.vencido++;
      if (c.estado === EstadoCobranza.por_vencer) acumulado.porVencer++;
      acumulado.monto += monto;
      porCliente.set(cliente.id, acumulado);
    }

    return {
      resumen,
      porCliente: [...porCliente.values()].sort((a, b) => b.vencido - a.vencido),
      cortes: cortes.map((c) => ({
        id: c.id,
        periodo: c.periodo,
        estado: c.estado,
        fechaProximoPago: c.fechaProximoPago,
        montoEsperado: c.montoEsperado,
        cliente: c.poliza.cliente,
        aseguradora: c.poliza.aseguradora.nombre,
        polizaId: c.polizaId,
        folio: c.poliza.folio,
        unidad: c.poliza.unidad,
      })),
    };
  }

  /**
   * Cierra el corte pagado y abre el siguiente a 30 días naturales.
   * Se invoca al confirmar que el pago ya se aplicó en el portal.
   */
  async cerrarYAbrirSiguiente(corteId: string) {
    const corte = await this.prisma.corte.findUnique({
      where: { id: corteId },
      include: { poliza: true },
    });
    if (!corte) return null;

    const siguienteCorte = corte.fechaProximoPago;
    const siguientePago = sumarDias(siguienteCorte, DIAS_ENTRE_CORTES);
    const periodo = `${siguienteCorte.getFullYear()}-${String(
      siguienteCorte.getMonth() + 1,
    ).padStart(2, '0')}`;

    const [, nuevo] = await this.prisma.$transaction([
      this.prisma.corte.update({
        where: { id: corteId },
        data: { estado: EstadoCobranza.pagado },
      }),
      this.prisma.corte.upsert({
        where: { polizaId_periodo: { polizaId: corte.polizaId, periodo } },
        create: {
          polizaId: corte.polizaId,
          periodo,
          fechaCorte: siguienteCorte,
          fechaProximoPago: siguientePago,
          montoEsperado: corte.montoEsperado,
          estado: EstadoCobranza.vigente,
        },
        update: {},
      }),
    ]);

    return nuevo;
  }

  /** Regenera cortes faltantes de pólizas emitidas (red de seguridad del cron). */
  async asegurarCortes() {
    const polizas = await this.prisma.poliza.findMany({
      where: { estado: EstadoPoliza.emitida, cortes: { none: {} } },
    });
    let creados = 0;
    for (const p of polizas) {
      const inicio = p.vigenciaInicio ?? new Date();
      const periodo = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`;
      const prima = p.prima ? Number(p.prima) : 0;
      await this.prisma.corte.create({
        data: {
          polizaId: p.id,
          periodo,
          fechaCorte: inicio,
          fechaProximoPago: sumarDias(inicio, DIAS_ENTRE_CORTES),
          montoEsperado: (prima > 0 ? Number((prima / 12).toFixed(2)) : 0) as never,
          estado: EstadoCobranza.vigente,
        },
      });
      creados++;
    }
    return { creados };
  }

  // ── Utilidades internas ──

  private hoy(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private textoRecordatorio(
    razonSocial: string,
    cortes: { estado: EstadoCobranza; fechaProximoPago: Date; montoEsperado: unknown }[],
  ): string {
    const vencidos = cortes.filter((c) => c.estado === EstadoCobranza.vencido);
    const total = cortes.reduce((s, c) => s + (c.montoEsperado ? Number(c.montoEsperado) : 0), 0);
    const monto = total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const fecha = cortes
      .map((c) => c.fechaProximoPago)
      .sort((a, b) => a.getTime() - b.getTime())[0]
      .toLocaleDateString('es-MX');

    if (vencidos.length > 0) {
      return (
        `Estimado cliente de ${razonSocial}:\n\n` +
        `Le recordamos que tiene ${vencidos.length} pago(s) vencido(s) por un total de ${monto}. ` +
        `La fecha de pago era el ${fecha}.\n\n` +
        `Puede realizar el pago directamente con la aseguradora y enviarnos el comprobante por este medio. ` +
        `Nosotros nos encargamos de aplicarlo.`
      );
    }
    return (
      `Estimado cliente de ${razonSocial}:\n\n` +
      `Le recordamos que su próximo pago de ${monto} vence el ${fecha}.\n\n` +
      `Puede realizar el pago directamente con la aseguradora y enviarnos el comprobante por este medio.`
    );
  }
}
