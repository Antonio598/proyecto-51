import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../generacion/pdf.service';
import {
  Coberturas,
  Deducibles,
  ETIQUETAS_COBERTURA,
  ETIQUETAS_DEDUCIBLE,
  ORDEN_COBERTURAS,
  ORDEN_DEDUCIBLES,
  formatearCobertura,
  formatearDeducible,
  formatearMoneda,
} from '../expedientes/coberturas';

export interface CampoChecklist {
  orden: number;
  etiqueta: string;
  valor: string;
}

/**
 * Genera el checklist de captura para el portal de la aseguradora.
 *
 * Las aseguradoras no tienen API: alguien debe teclear estos datos a mano.
 * Este servicio deja todo pre-formateado y EN EL ORDEN EN QUE EL PORTAL LOS PIDE,
 * para minimizar el tiempo de captura y los errores de dedo.
 *
 * No automatiza el portal — eso queda explícitamente fuera del alcance.
 */
@Injectable()
export class ChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
  ) {}

  /** Checklist de emisión: una sección por póliza pendiente. */
  async emision(expedienteId: string) {
    const expediente = await this.prisma.expediente.findUnique({
      where: { id: expedienteId },
      include: {
        cliente: true,
        propuestasAseguradora: { include: { aseguradora: true } },
        polizas: {
          where: { estado: 'pendiente_emision' },
          include: { unidad: true, aseguradora: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!expediente) throw new NotFoundException('Expediente no encontrado');

    const polizas = expediente.polizas.map((poliza) => {
      const propuesta = expediente.propuestasAseguradora.find(
        (p) => p.aseguradoraId === poliza.aseguradoraId,
      );
      return {
        polizaId: poliza.id,
        aseguradora: poliza.aseguradora.nombre,
        notasPortal: poliza.aseguradora.notasPortal,
        unidad: {
          id: poliza.unidad.id,
          vin: poliza.unidad.vin,
          marca: poliza.unidad.marca,
          modelo: poliza.unidad.modelo,
        },
        campos: this.camposDeUnidad(expediente.cliente, poliza, propuesta),
      };
    });

    return {
      expedienteId,
      cliente: expediente.cliente.razonSocial,
      totalPolizas: polizas.length,
      polizas,
    };
  }

  /** El mismo checklist en PDF, para tenerlo al lado mientras se captura. */
  async emisionPdf(expedienteId: string): Promise<Buffer> {
    const checklist = await this.emision(expedienteId);

    return this.pdf.generar({
      titulo: 'Checklist de captura en portal',
      subtitulo: `${checklist.cliente} · ${checklist.totalPolizas} póliza(s) por emitir`,
      secciones: [
        {
          titulo: 'Cómo usar este documento',
          parrafos: [
            'Los campos están en el orden en que el portal de la aseguradora los solicita. ' +
              'Captura de arriba hacia abajo sin saltar renglones para reducir errores. ' +
              'Al terminar cada póliza, regresa al sistema, marca "emitida" y captura el folio ' +
              '(o adjunta el PDF y el sistema lo lee por ti).',
          ],
        },
        ...checklist.polizas.map((p, i) => ({
          titulo: `${i + 1}. ${p.aseguradora} — ${[p.unidad.marca, p.unidad.modelo]
            .filter(Boolean)
            .join(' ')} (${p.unidad.vin ?? 'sin VIN'})`,
          parrafos: p.notasPortal ? [`Notas del portal: ${p.notasPortal}`] : undefined,
          tabla: {
            encabezados: ['#', 'Campo', 'Valor a capturar'],
            filas: p.campos.map((c) => [String(c.orden), c.etiqueta, c.valor]),
          },
        })),
      ],
      piePagina: checklist.cliente,
    });
  }

  /** Checklist de aplicación de pago en el portal (módulo 10). */
  async aplicacionPago(pagoId: string) {
    const pago = await this.prisma.pago.findUnique({
      where: { id: pagoId },
      include: {
        poliza: { include: { aseguradora: true, cliente: true, unidad: true } },
        corte: true,
      },
    });
    if (!pago) throw new NotFoundException('Pago no encontrado');

    const campos: CampoChecklist[] = [
      { orden: 1, etiqueta: 'Aseguradora (portal)', valor: pago.poliza.aseguradora.nombre },
      { orden: 2, etiqueta: 'Número de póliza', valor: pago.poliza.folio ?? 'PENDIENTE' },
      { orden: 3, etiqueta: 'Cliente', valor: pago.poliza.cliente.razonSocial },
      { orden: 4, etiqueta: 'Periodo a aplicar', valor: pago.corte?.periodo ?? '—' },
      { orden: 5, etiqueta: 'Importe del pago', valor: formatearMoneda(Number(pago.monto)) },
      {
        orden: 6,
        etiqueta: 'Fecha del pago',
        valor: pago.fecha.toLocaleDateString('es-MX'),
      },
      { orden: 7, etiqueta: 'Forma de pago', valor: pago.forma },
    ];

    return {
      pagoId,
      aseguradora: pago.poliza.aseguradora.nombre,
      notasPortal: pago.poliza.aseguradora.notasPortal,
      campos,
    };
  }

  // ── Utilidades internas ──

  /**
   * Orden fijo de captura: primero identifica al contratante, luego la unidad,
   * luego coberturas y deducibles, y al final la prima. Es el flujo típico del portal.
   */
  private camposDeUnidad(
    cliente: { razonSocial: string; rfc: string | null; datosFiscales: unknown },
    poliza: { unidad: any; prima: unknown; vigenciaInicio: Date | null },
    propuesta?: { coberturas: unknown; deducibles: unknown; prima: unknown },
  ): CampoChecklist[] {
    const fiscales = (cliente.datosFiscales ?? {}) as Record<string, string>;
    const u = poliza.unidad;
    const coberturas = propuesta?.coberturas as Coberturas | null;
    const deducibles = propuesta?.deducibles as Deducibles | null;

    const campos: Omit<CampoChecklist, 'orden'>[] = [
      { etiqueta: 'Razón social del contratante', valor: cliente.razonSocial },
      { etiqueta: 'RFC', valor: cliente.rfc ?? 'FALTA — completar en la ficha del cliente' },
      { etiqueta: 'Domicilio fiscal', valor: fiscales.domicilio ?? '—' },
      { etiqueta: 'Código postal', valor: fiscales.codigoPostal ?? '—' },
      { etiqueta: 'Régimen fiscal', valor: fiscales.regimen ?? '—' },
      { etiqueta: 'Uso de CFDI', valor: fiscales.usoCfdi ?? '—' },
      { etiqueta: 'Número de serie (VIN)', valor: u.vin ?? 'FALTA' },
      { etiqueta: 'Tipo de unidad', valor: u.tipo },
      { etiqueta: 'Marca', valor: u.marca ?? '—' },
      { etiqueta: 'Modelo', valor: u.modelo ?? '—' },
      { etiqueta: 'Año', valor: u.anio ? String(u.anio) : '—' },
      { etiqueta: 'Descripción', valor: u.descripcion ?? '—' },
      { etiqueta: 'Tipo de carga que transporta', valor: u.tipoCarga ?? '—' },
      {
        etiqueta: 'Valor asegurado de la unidad',
        valor: formatearMoneda(u.valorAsegurado ? Number(u.valorAsegurado) : null),
      },
      ...ORDEN_COBERTURAS.map((c) => ({
        etiqueta: ETIQUETAS_COBERTURA[c],
        valor: formatearCobertura(c, coberturas?.[c]),
      })),
      ...ORDEN_DEDUCIBLES.map((d) => ({
        etiqueta: ETIQUETAS_DEDUCIBLE[d],
        valor: formatearDeducible(deducibles?.[d]),
      })),
      {
        etiqueta: 'Inicio de vigencia',
        valor: poliza.vigenciaInicio
          ? poliza.vigenciaInicio.toLocaleDateString('es-MX')
          : 'definir al emitir',
      },
      {
        etiqueta: 'Prima',
        valor: formatearMoneda(
          poliza.prima ? Number(poliza.prima) : propuesta?.prima ? Number(propuesta.prima) : null,
        ),
      },
    ];

    return campos.map((c, i) => ({ orden: i + 1, ...c }));
  }
}
