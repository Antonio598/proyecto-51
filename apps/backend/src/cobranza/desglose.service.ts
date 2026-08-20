import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EstadoPoliza, OrigenDocumento, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ExcelService } from '../generacion/excel.service';
import { CorreoService, plantillaCorreo } from '../correo/correo.service';
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
    private readonly correo: CorreoService,
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
      const primaNeta = p.primaNeta ? Number(p.primaNeta) : 0;
      const gastos = p.gastosExpedicion ? Number(p.gastosExpedicion) : 0;
      const iva = p.iva ? Number(p.iva) : 0;
      // Total a cobrar: el capturado; si no, prima neta + gastos + IVA; si no, la prima.
      const total = p.primaTotal
        ? Number(p.primaTotal)
        : primaNeta + gastos + iva || (p.prima ? Number(p.prima) : 0);
      const pagos = p.numeroPagos ?? 12;
      const porPeriodo = total > 0 && pagos > 0 ? Number((total / pagos).toFixed(2)) : 0;
      return [
        [p.unidad.marca, p.unidad.modelo].filter(Boolean).join(' ') || p.unidad.tipo,
        p.folio ?? 'pendiente',
        p.unidad.folio ?? '—',
        p.aseguradora.nombre,
        primaNeta,
        gastos,
        total,
        pagos,
        porPeriodo,
      ];
    });

    const totalGeneral = filas.reduce((s, f) => s + Number(f[6]), 0);
    const totalPorPeriodo = filas.reduce((s, f) => s + Number(f[8]), 0);
    filas.push(['', '', '', 'TOTAL', '', '', totalGeneral, '', totalPorPeriodo]);

    const buffer = await this.excel.generar([
      {
        nombre: 'Desglose',
        titulo: `Desglose de cobranza — ${cliente.razonSocial}`,
        encabezados: [
          'Unidad',
          'No. Póliza',
          'Inciso',
          'Aseguradora',
          'Prima neta',
          'Gastos de expedición',
          'Total',
          'Pagos',
          'Importe por periodo',
        ],
        filas,
        columnasMoneda: [4, 5, 6, 8],
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
        metadata: {
          totalAnual: totalGeneral,
          totalMensual: totalPorPeriodo,
          unidades: cliente.polizas.length,
        },
      },
    });

    await this.audit.registrar({
      entidad: 'Documento',
      entidadId: documento.id,
      accion: 'generar_desglose',
      actorUserId,
      diff: { clienteId, totalPorPeriodo },
    });

    return {
      documento,
      totalAnual: totalGeneral,
      totalMensual: totalPorPeriodo,
      unidades: cliente.polizas.length,
    };
  }

  /**
   * Envía al cliente por correo el desglose junto con los PDF de sus pólizas
   * emitidas. Es el documento base de cobranza del periodo.
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
    if (!cliente?.contactoEmail) {
      throw new BadRequestException('El cliente no tiene correo registrado');
    }

    const desglose = await this.prisma.documento.findUnique({ where: { id: documentoId } });
    if (!desglose) throw new BadRequestException('Desglose no encontrado');

    // Adjuntos: el desglose (Excel) + las pólizas emitidas que ya tengan PDF.
    const adjuntos: { nombre: string; contenido: Buffer; tipo?: string }[] = [];
    const contenido = await this.storage.descargar(desglose.storageKey);
    adjuntos.push({
      nombre: desglose.nombreOriginal ?? 'desglose.xlsx',
      contenido,
      tipo: desglose.mime ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const pdfIds = cliente.polizas.map((p) => p.pdfDocId!).filter(Boolean);
    const pdfs = await this.prisma.documento.findMany({ where: { id: { in: pdfIds } } });
    for (const pdf of pdfs) {
      const bin = await this.storage.descargar(pdf.storageKey);
      adjuntos.push({
        nombre: pdf.nombreOriginal ?? 'poliza.pdf',
        contenido: bin,
        tipo: pdf.mime ?? 'application/pdf',
      });
    }

    const html = plantillaCorreo(
      'Desglose de cobranza',
      `<p>Estimado cliente de ${cliente.razonSocial}:</p>
       <p>Adjuntamos el desglose de costos por unidad correspondiente al periodo${
         pdfs.length ? `, junto con ${pdfs.length} póliza(s) en PDF` : ''
       }.</p>
       <p>Quedamos a sus órdenes.</p>`,
    );

    await this.correo.enviar({
      para: cliente.contactoEmail,
      asunto: `Desglose de cobranza — ${cliente.razonSocial}`,
      html,
      adjuntos,
    });

    await this.audit.registrar({
      entidad: 'Documento',
      entidadId: documentoId,
      accion: 'enviar_desglose',
      actorUserId,
      diff: { correo: cliente.contactoEmail, polizasAdjuntas: pdfs.length },
    });

    this.logger.log(`Desglose enviado a ${cliente.contactoEmail} con ${pdfs.length} póliza(s)`);
    return { enviado: true, polizasAdjuntas: pdfs.length };
  }
}
