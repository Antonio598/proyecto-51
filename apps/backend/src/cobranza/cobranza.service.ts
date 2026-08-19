import { Injectable, Logger } from '@nestjs/common';
import { EstadoCobranza } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PolizasMadreService } from './polizas-madre.service';
import { sumarDiasNaturales } from './plan-pagos';

/** Días de anticipación con los que una parcialidad se marca "por vencer". */
const DIAS_AVISO = 5;

type CorteMadreConCliente = Awaited<ReturnType<CobranzaService['cargarCortesAbiertos']>>[number];

@Injectable()
export class CobranzaService {
  private readonly logger = new Logger(CobranzaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly polizasMadre: PolizasMadreService,
  ) {}

  private cargarCortesAbiertos() {
    return this.prisma.corteMadre.findMany({
      where: { estado: { not: EstadoCobranza.pagado } },
      include: {
        polizaMadre: {
          include: {
            cliente: { select: { id: true, razonSocial: true, whatsappNumber: true } },
            aseguradora: { select: { nombre: true } },
          },
        },
      },
      orderBy: { fechaVencimiento: 'asc' },
    });
  }

  /**
   * Proceso que corre n8n periódicamente: actualiza los estados de cobranza a
   * nivel Póliza Madre y envía recordatorios (uno por cliente).
   */
  async procesarCiclo(opciones: { enviarRecordatorios?: boolean } = {}) {
    const hoy = this.hoy();
    const limiteAviso = sumarDiasNaturales(hoy, DIAS_AVISO);

    const cortes = await this.cargarCortesAbiertos();

    let vencidos = 0;
    let porVencer = 0;
    const recordatorios: { cliente: string; enviado: boolean; motivo?: string }[] = [];

    // 1. Recalcular el estado de cada parcialidad abierta.
    for (const corte of cortes) {
      let nuevo: EstadoCobranza = EstadoCobranza.vigente;
      if (corte.fechaVencimiento < hoy) {
        nuevo = EstadoCobranza.vencido;
        vencidos++;
      } else if (corte.fechaVencimiento <= limiteAviso) {
        nuevo = EstadoCobranza.por_vencer;
        porVencer++;
      }
      if (nuevo !== corte.estado) {
        await this.prisma.corteMadre.update({ where: { id: corte.id }, data: { estado: nuevo } });
      }
      corte.estado = nuevo;
    }

    // 2. Un recordatorio por cliente (no uno por Madre) para no saturarlo.
    if (opciones.enviarRecordatorios !== false) {
      const porCliente = new Map<string, CorteMadreConCliente[]>();
      for (const corte of cortes) {
        if (corte.estado === EstadoCobranza.vigente) continue;
        const key = corte.polizaMadre.clienteId;
        const lista = porCliente.get(key) ?? [];
        lista.push(corte);
        porCliente.set(key, lista);
      }

      for (const [, lista] of porCliente) {
        const cliente = lista[0].polizaMadre.cliente;
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
      `Ciclo de cobranza: ${cortes.length} parcialidades revisadas, ${vencidos} vencidas, ${porVencer} por vencer`,
    );
    return {
      revisados: cortes.length,
      vencidos,
      porVencer,
      recordatorios,
      ejecutadoEn: new Date().toISOString(),
    };
  }

  /** Dashboard de cobranza a nivel Póliza Madre. */
  async dashboard() {
    const cortes = await this.cargarCortesAbiertos();

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

      const cliente = c.polizaMadre.cliente;
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
        madreId: c.polizaMadreId,
        numeroParcialidad: c.numeroParcialidad,
        esPrimerPago: c.esPrimerPago,
        periodo: c.periodo,
        estado: c.estado,
        fechaVencimiento: c.fechaVencimiento,
        montoEsperado: c.montoEsperado,
        cliente: c.polizaMadre.cliente,
        aseguradora: c.polizaMadre.aseguradora.nombre,
      })),
    };
  }

  /**
   * Cierra la parcialidad pagada y abre la siguiente. Delegado en el servicio de
   * Póliza Madre (unidad de cobranza vigente). Recibe el id del CorteMadre.
   */
  async cerrarYAbrirSiguiente(corteMadreId: string) {
    const res = await this.polizasMadre.cerrarParcialidad(corteMadreId);
    return res.siguiente;
  }

  /**
   * Red de seguridad del cron: vincula pólizas emitidas sueltas a su Madre y
   * regenera la parcialidad abierta de cada Madre con plan configurado.
   */
  async asegurarCortes() {
    // 1. Vincular pólizas emitidas que se quedaron sin Madre.
    const sueltas = await this.prisma.poliza.findMany({
      where: { estado: 'emitida', polizaMadreId: null },
      select: { id: true, vigenciaInicio: true },
    });
    for (const p of sueltas) {
      await this.polizasMadre.vincularHija(p.id, {
        fechaEmision: p.vigenciaInicio ?? new Date(),
      });
    }

    // 2. Regenerar el corte abierto de cada Madre con emisión y total.
    const madres = await this.prisma.polizaMadre.findMany({ select: { id: true } });
    let regenerados = 0;
    for (const m of madres) {
      await this.polizasMadre.recalcularTotales(m.id);
      regenerados++;
    }

    return { vinculadas: sueltas.length, madresRevisadas: regenerados };
  }

  // ── Utilidades internas ──

  private hoy(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private textoRecordatorio(
    razonSocial: string,
    cortes: { estado: EstadoCobranza; fechaVencimiento: Date; montoEsperado: unknown }[],
  ): string {
    const vencidos = cortes.filter((c) => c.estado === EstadoCobranza.vencido);
    const total = cortes.reduce((s, c) => s + (c.montoEsperado ? Number(c.montoEsperado) : 0), 0);
    const monto = total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const fecha = cortes
      .map((c) => c.fechaVencimiento)
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
