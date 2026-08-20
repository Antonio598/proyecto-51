import { Injectable, Logger } from '@nestjs/common';
import { EstadoCobranza, Periodicidad } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CorreoService, plantillaCorreo } from '../correo/correo.service';
import { ClaudeService } from '../ia/claude.service';
import { generarCalendario } from './plan-pagos';

const num = (v: unknown): number => (v != null ? Number(v) : 0);
const DIA_MS = 86_400_000;

function mxn(v: number): string {
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

/** Línea de desglose/alta/baja para el correo. */
interface LineaDesglose {
  etiqueta: string;
  detalle?: string;
  monto: number;
}

/**
 * Calendario de recordatorios de cobranza por correo, con historial e
 * idempotencia. Reemplaza el recordatorio único por WhatsApp.
 *
 * Cadencia: hitos a 20 y 15 días antes del vencimiento; desde 10 días y hasta
 * después del vencimiento, uno cada ~3 días. Cada parcialidad guarda qué
 * recordatorio ya se envió (RecordatorioCobranza), así el cron no repite. Al
 * pagar, la parcialidad deja de estar abierta y el ciclo se detiene solo.
 */
@Injectable()
export class RecordatoriosService {
  private readonly logger = new Logger(RecordatoriosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly correo: CorreoService,
    private readonly claude: ClaudeService,
  ) {}

  /** Procesa el calendario de recordatorios de todas las parcialidades abiertas. */
  async procesar() {
    if (!this.correo.estaConfigurado()) {
      this.logger.warn('Correo no configurado: no se envían recordatorios.');
      return { enviados: 0, omitidos: 0, motivo: 'correo no configurado' };
    }

    const hoy = this.hoy();
    const cortes = await this.prisma.corteMadre.findMany({
      where: { estado: { not: EstadoCobranza.pagado } },
      include: {
        recordatorios: { select: { clave: true } },
        polizaMadre: {
          include: {
            cliente: { select: { razonSocial: true, contactoEmail: true } },
            aseguradora: { select: { nombre: true } },
            hijas: { include: { unidad: { select: { vin: true, marca: true, modelo: true } } } },
          },
        },
      },
    });

    let enviados = 0;
    let omitidos = 0;
    const detalle: { cliente: string; enviado: boolean; motivo?: string; clave?: string }[] = [];

    for (const corte of cortes) {
      const dias = Math.round((corte.fechaVencimiento.getTime() - hoy.getTime()) / DIA_MS);
      const clave = this.claveRecordatorio(dias);
      if (!clave) continue;
      if (corte.recordatorios.some((r) => r.clave === clave)) continue; // ya enviado

      const cliente = corte.polizaMadre.cliente;
      if (!cliente.contactoEmail) {
        omitidos++;
        detalle.push({ cliente: cliente.razonSocial, enviado: false, motivo: 'sin correo' });
        continue;
      }

      try {
        await this.enviarRecordatorio(corte, dias, clave);
        enviados++;
        detalle.push({ cliente: cliente.razonSocial, enviado: true, clave });
      } catch (err) {
        this.logger.error(
          `Recordatorio fallido (${cliente.razonSocial}): ${(err as Error).message}`,
        );
        detalle.push({ cliente: cliente.razonSocial, enviado: false, motivo: 'error de envío' });
      }
    }

    this.logger.log(`Recordatorios de cobranza: ${enviados} enviados, ${omitidos} sin correo`);
    return { enviados, omitidos, detalle, ejecutadoEn: new Date().toISOString() };
  }

  /**
   * Clave del recordatorio que corresponde hoy según los días al vencimiento,
   * o null si aún es muy pronto. Usa ventanas (no días exactos) para tolerar
   * que el cron no corra justo el día objetivo.
   */
  private claveRecordatorio(dias: number): string | null {
    if (dias > 20) return null; // demasiado pronto
    if (dias > 15) return 'd20';
    if (dias > 10) return 'd15';
    // dias <= 10: cadencia cada ~3 días (incluye vencidos, buckets crecientes).
    const bucket = Math.floor((10 - dias) / 3);
    return `c3:${bucket}`;
  }

  private async enviarRecordatorio(
    corte: {
      id: string;
      numeroParcialidad: number;
      esPrimerPago: boolean;
      montoEsperado: unknown;
      fechaVencimiento: Date;
      polizaMadre: {
        numeroPagos: number;
        periodicidad: Periodicidad;
        fechaEmision: Date | null;
        primaNeta: unknown;
        financiamiento: unknown;
        gastosExpedicion: unknown;
        iva: unknown;
        primaTotal: unknown;
        cliente: { razonSocial: string; contactoEmail: string | null };
        aseguradora: { nombre: string };
        hijas: Array<{
          folio: string | null;
          primaNeta: unknown;
          financiamiento: unknown;
          gastosExpedicion: unknown;
          iva: unknown;
          primaTotal: unknown;
          prima: unknown;
          unidad: { vin: string | null; marca: string | null; modelo: string | null };
        }>;
      };
    },
    dias: number,
    clave: string,
  ) {
    const madre = corte.polizaMadre;
    const total = num(corte.montoEsperado);
    const vencido = dias < 0;
    const previos = await this.prisma.recordatorioCobranza.count({
      where: { corteMadreId: corte.id },
    });

    // Desglose por hija de ESTA parcialidad (para que las líneas sumen al total).
    const idx = corte.numeroParcialidad - 1;
    const desglose: LineaDesglose[] = madre.hijas.map((h) => {
      const calH = generarCalendario({
        primaNeta: num(h.primaNeta),
        financiamiento: num(h.financiamiento),
        gastosExpedicion: num(h.gastosExpedicion),
        iva: num(h.iva),
        primaTotal: num(h.primaTotal) || num(h.prima),
        periodicidad: madre.periodicidad,
        fechaEmision: madre.fechaEmision ?? new Date(),
      });
      return {
        etiqueta: `Póliza ${h.folio ?? 'pendiente'}`,
        detalle: [h.unidad.marca, h.unidad.modelo].filter(Boolean).join(' ') || h.unidad.vin || '',
        monto: calH[idx]?.montoEsperado ?? 0,
      };
    });

    // Copy adaptativo con IA; si falla, texto determinista.
    const copy = await this.copy({
      cliente: madre.cliente.razonSocial,
      aseguradora: madre.aseguradora.nombre,
      total,
      dias,
      vencido,
      numeroParcialidad: corte.numeroParcialidad,
      esPrimerPago: corte.esPrimerPago,
      periodicidad: madre.periodicidad,
      recordatoriosPrevios: previos,
      fechaLimite: corte.fechaVencimiento.toLocaleDateString('es-MX'),
    });

    const html = this.renderHtml({
      copy,
      total,
      numeroParcialidad: corte.numeroParcialidad,
      numeroPagos: madre.numeroPagos,
      esPrimerPago: corte.esPrimerPago,
      fechaLimite: corte.fechaVencimiento.toLocaleDateString('es-MX'),
      aseguradora: madre.aseguradora.nombre,
      desglose,
      altas: [], // Fase 4: endosos de alta (verde)
      bajas: [], // Fase 4: cancelaciones (rojo, negativo)
      vencido,
    });

    await this.correo.enviar({
      para: madre.cliente.contactoEmail!,
      asunto: copy.asunto,
      html,
      texto: `${copy.saludo}\n\n${copy.cuerpo}\n\nImporte de esta parcialidad: ${mxn(total)} (vence ${corte.fechaVencimiento.toLocaleDateString('es-MX')}).\n\n${copy.cierre}`,
    });

    await this.prisma.recordatorioCobranza.create({
      data: {
        corteMadreId: corte.id,
        clave,
        canal: 'correo',
        destino: madre.cliente.contactoEmail,
        asunto: copy.asunto,
        diasRestantes: dias,
      },
    });
  }

  /** Copy con IA; fallback determinista si la IA no está disponible. */
  private async copy(ctx: {
    cliente: string;
    aseguradora: string;
    total: number;
    dias: number;
    vencido: boolean;
    numeroParcialidad: number;
    esPrimerPago: boolean;
    periodicidad: Periodicidad;
    recordatoriosPrevios: number;
    fechaLimite: string;
  }): Promise<{ asunto: string; saludo: string; cuerpo: string; cierre: string }> {
    try {
      return await this.claude.redactarCorreoCobranza({
        cliente: ctx.cliente,
        aseguradora: ctx.aseguradora,
        totalFormateado: mxn(ctx.total),
        diasRestantes: ctx.dias,
        vencido: ctx.vencido,
        numeroParcialidad: ctx.numeroParcialidad,
        esPrimerPago: ctx.esPrimerPago,
        periodicidad: ctx.periodicidad,
        recordatoriosPrevios: ctx.recordatoriosPrevios,
        fechaLimite: ctx.fechaLimite,
      });
    } catch (err) {
      this.logger.warn(`IA no disponible para el correo, uso texto base: ${(err as Error).message}`);
      const saludo = `Estimado cliente de ${ctx.cliente}:`;
      if (ctx.vencido) {
        return {
          asunto: `Pago pendiente de su póliza (${ctx.aseguradora})`,
          saludo,
          cuerpo:
            'Le recordamos que el pago de esta parcialidad se encuentra vencido. Puede realizarlo directamente con la aseguradora y enviarnos el comprobante por este medio para aplicarlo.',
          cierre: 'Quedamos a sus órdenes. Gracias.',
        };
      }
      return {
        asunto: `Recordatorio de pago próximo (${ctx.aseguradora})`,
        saludo,
        cuerpo:
          'Le recordamos que se aproxima la fecha límite de pago de esta parcialidad. Puede pagar directamente con la aseguradora y enviarnos el comprobante por este medio para aplicarlo.',
        cierre: 'Quedamos a sus órdenes. Gracias.',
      };
    }
  }

  /** HTML del correo: total primero, luego desglose; altas en verde, bajas en rojo. */
  private renderHtml(d: {
    copy: { saludo: string; cuerpo: string; cierre: string };
    total: number;
    numeroParcialidad: number;
    numeroPagos: number;
    esPrimerPago: boolean;
    fechaLimite: string;
    aseguradora: string;
    desglose: LineaDesglose[];
    altas: LineaDesglose[];
    bajas: LineaDesglose[];
    vencido: boolean;
  }): string {
    const colorTotal = d.vencido ? '#b91c1c' : '#0f172a';
    const fila = (l: LineaDesglose, color?: string, signo = '') =>
      `<tr>
        <td style="padding:6px 8px;border-top:1px solid #e2e8f0;">${l.etiqueta}${l.detalle ? `<div style="color:#64748b;font-size:12px;">${l.detalle}</div>` : ''}</td>
        <td style="padding:6px 8px;border-top:1px solid #e2e8f0;text-align:right;white-space:nowrap;${color ? `color:${color};` : ''}">${signo}${mxn(Math.abs(l.monto))}</td>
      </tr>`;

    const seccionAltas = d.altas.length
      ? `<tr><td colspan="2" style="padding:8px;color:#15803d;font-weight:bold;">Altas recientes</td></tr>${d.altas.map((l) => fila(l, '#15803d', '+')).join('')}`
      : '';
    const seccionBajas = d.bajas.length
      ? `<tr><td colspan="2" style="padding:8px;color:#b91c1c;font-weight:bold;">Bajas / cancelaciones</td></tr>${d.bajas.map((l) => fila(l, '#b91c1c', '-')).join('')}`
      : '';

    const cuerpo = `
      <p style="margin:0 0 12px;">${d.copy.saludo}</p>
      <p style="margin:0 0 16px;">${d.copy.cuerpo}</p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center;margin:0 0 16px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">Importe a pagar${d.vencido ? ' (vencido)' : ''}</div>
        <div style="font-size:28px;font-weight:bold;color:${colorTotal};margin:4px 0;">${mxn(d.total)}</div>
        <div style="font-size:13px;color:#475569;">
          Parcialidad ${d.numeroParcialidad} de ${d.numeroPagos}${d.esPrimerPago ? ' · primer pago' : ''} · vence ${d.fechaLimite} · ${d.aseguradora}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
        <thead>
          <tr><th style="text-align:left;padding:6px 8px;color:#64748b;font-weight:normal;">Desglose por póliza</th><th style="text-align:right;padding:6px 8px;color:#64748b;font-weight:normal;">Importe</th></tr>
        </thead>
        <tbody>
          ${d.desglose.map((l) => fila(l)).join('')}
          ${seccionAltas}
          ${seccionBajas}
          <tr>
            <td style="padding:8px;border-top:2px solid #cbd5e1;font-weight:bold;">Total</td>
            <td style="padding:8px;border-top:2px solid #cbd5e1;text-align:right;font-weight:bold;">${mxn(d.total)}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin:0;color:#475569;">${d.copy.cierre}</p>`;

    return plantillaCorreo('Recordatorio de cobranza', cuerpo);
  }

  private hoy(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
