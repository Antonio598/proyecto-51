import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EstadoPoliza, OrigenDocumento, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ExcelService } from '../generacion/excel.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AuditService } from '../audit/audit.service';

/**
 * Módulo 8 — Desglose de costos por unidad.
 * Es el "documento base de cobranza" del periodo: se genera del sistema,
 * se envía al cliente por WhatsApp y queda ligado al expediente.
 */
@Injectable()
export class DesgloseService {
  private readonly logger = new Logger(DesgloseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly excel: ExcelService,
    private readonly whatsapp: WhatsappService,
    private readonly audit: AuditService,
  ) {}

  /** Genera el Excel de desglose por unidad de todas las pólizas emitidas del cliente. */
  async generar(clienteId: string, actorUserId: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      include: {
        polizas: {
          where: { estado: EstadoPoliza.emitida },
          include: { unidad: true, aseguradora: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!cliente) throw new BadRequestException('Cliente no encontrado');
    if (cliente.polizas.length === 0) {
      throw new BadRequestException('El cliente no tiene pólizas emitidas para desglosar');
    }

    const filas = cliente.polizas.map((p) => {
      const primaAnual = p.prima ? Number(p.prima) : 0;
      return [
        p.unidad.tipo,
        [p.unidad.marca, p.unidad.modelo].filter(Boolean).join(' ') || '—',
        p.unidad.anio ?? '',
        p.unidad.vin ?? '—',
        p.aseguradora.nombre,
        p.folio ?? 'pendiente',
        primaAnual,
        Number((primaAnual / 12).toFixed(2)),
      ];
    });

    const totalAnual = filas.reduce((s, f) => s + Number(f[6]), 0);
    const totalMensual = filas.reduce((s, f) => s + Number(f[7]), 0);
    filas.push(['', '', '', '', '', 'TOTAL', totalAnual, totalMensual]);

    const buffer = await this.excel.generar([
      {
        nombre: 'Desglose',
        titulo: `Desglose de costos — ${cliente.razonSocial}`,
        encabezados: [
          'Tipo',
          'Marca / Modelo',
          'Año',
          'VIN',
          'Aseguradora',
          'Póliza',
          'Prima anual',
          'Pago mensual',
        ],
        filas,
        columnasMoneda: [6, 7],
      },
    ]);

    const nombre = `desglose-${cliente.razonSocial.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.xlsx`;
    const storageKey = await this.storage.subir(
      `clientes/${clienteId}/desgloses`,
      nombre,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const documento = await this.prisma.documento.create({
      data: {
        clienteId,
        expedienteId: cliente.polizas[0].expedienteId,
        tipo: TipoDocumento.desglose,
        origen: OrigenDocumento.generado,
        storageKey,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        nombreOriginal: nombre,
        procesado: true,
        metadata: { totalAnual, totalMensual, unidades: cliente.polizas.length },
      },
    });

    await this.audit.registrar({
      entidad: 'Documento',
      entidadId: documento.id,
      accion: 'generar_desglose',
      actorUserId,
      diff: { clienteId, totalMensual },
    });

    return { documento, totalAnual, totalMensual, unidades: cliente.polizas.length };
  }

  /**
   * Envía al cliente el desglose junto con los PDF de sus pólizas emitidas.
   * Este envío es el que queda como documento base de cobranza del periodo.
   */
  async enviar(clienteId: string, documentoId: string, actorUserId: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      include: {
        polizas: {
          where: { estado: EstadoPoliza.emitida, pdfDocId: { not: null } },
        },
      },
    });
    if (!cliente?.whatsappNumber) {
      throw new BadRequestException('El cliente no tiene número de WhatsApp registrado');
    }

    const desglose = await this.prisma.documento.findUnique({ where: { id: documentoId } });
    if (!desglose) throw new BadRequestException('Desglose no encontrado');

    // 1. El desglose.
    const contenido = await this.storage.descargar(desglose.storageKey);
    await this.whatsapp.enviarDocumento(
      cliente.whatsappNumber,
      contenido,
      desglose.nombreOriginal ?? 'desglose.xlsx',
      'Adjuntamos el desglose de costos por unidad correspondiente al periodo.',
    );

    // 2. Las pólizas emitidas que ya tengan PDF.
    const pdfIds = cliente.polizas.map((p) => p.pdfDocId!).filter(Boolean);
    const pdfs = await this.prisma.documento.findMany({ where: { id: { in: pdfIds } } });
    for (const pdf of pdfs) {
      const bin = await this.storage.descargar(pdf.storageKey);
      await this.whatsapp.enviarDocumento(
        cliente.whatsappNumber,
        bin,
        pdf.nombreOriginal ?? 'poliza.pdf',
      );
    }

    await this.audit.registrar({
      entidad: 'Documento',
      entidadId: documentoId,
      accion: 'enviar_desglose',
      actorUserId,
      diff: { numero: cliente.whatsappNumber, polizasAdjuntas: pdfs.length },
    });

    this.logger.log(`Desglose enviado a ${cliente.whatsappNumber} con ${pdfs.length} póliza(s)`);
    return { enviado: true, polizasAdjuntas: pdfs.length };
  }
}
