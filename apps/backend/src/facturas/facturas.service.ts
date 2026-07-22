import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrigenDocumento, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AuditService } from '../audit/audit.service';

/** Los dos únicos tipos de documento que maneja este módulo. */
export type TipoFactura = 'factura' | 'complemento';

/**
 * Módulo 11 — Facturas y complementos de pago.
 * Se descargan del portal de la aseguradora (manual, no hay API), se suben aquí
 * y el envío al cliente por WhatsApp es automático.
 */
@Injectable()
export class FacturasService {
  private readonly logger = new Logger(FacturasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly whatsapp: WhatsappService,
    private readonly audit: AuditService,
  ) {}

  listarPorPoliza(polizaId: string) {
    return this.prisma.factura.findMany({
      where: { polizaId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Sube una factura o complemento y lo asocia a la póliza y al expediente. */
  async subir(
    polizaId: string,
    tipo: TipoFactura,
    archivo: { buffer: Buffer; nombre: string; mime: string },
    actorUserId: string,
  ) {
    const poliza = await this.prisma.poliza.findUnique({ where: { id: polizaId } });
    if (!poliza) throw new NotFoundException('Póliza no encontrada');

    const storageKey = await this.storage.subir(
      `clientes/${poliza.clienteId}/facturas`,
      archivo.nombre,
      archivo.buffer,
      archivo.mime,
    );

    const documento = await this.prisma.documento.create({
      data: {
        clienteId: poliza.clienteId,
        expedienteId: poliza.expedienteId,
        polizaId,
        tipo,
        origen: OrigenDocumento.manual_upload,
        storageKey,
        mime: archivo.mime,
        nombreOriginal: archivo.nombre,
        procesado: true,
      },
    });

    const factura = await this.prisma.factura.create({
      data: { polizaId, tipo, storageDocId: documento.id },
    });

    await this.audit.registrar({
      entidad: 'Factura',
      entidadId: factura.id,
      accion: 'subir',
      actorUserId,
      diff: { polizaId, tipo },
    });

    return { factura, documento };
  }

  /** Envía la factura o complemento al cliente por WhatsApp. */
  async enviar(facturaId: string, actorUserId: string) {
    const factura = await this.prisma.factura.findUnique({
      where: { id: facturaId },
      include: { poliza: { include: { cliente: true } } },
    });
    if (!factura) throw new NotFoundException('Factura no encontrada');
    if (!factura.storageDocId) {
      throw new BadRequestException('Esta factura no tiene archivo asociado');
    }

    const cliente = factura.poliza.cliente;
    if (!cliente.whatsappNumber) {
      throw new BadRequestException('El cliente no tiene número de WhatsApp registrado');
    }

    const documento = await this.prisma.documento.findUnique({
      where: { id: factura.storageDocId },
    });
    if (!documento) throw new NotFoundException('No se encontró el archivo de la factura');

    const contenido = await this.storage.descargar(documento.storageKey);
    const etiqueta = factura.tipo === TipoDocumento.complemento ? 'complemento de pago' : 'factura';

    await this.whatsapp.enviarDocumento(
      cliente.whatsappNumber,
      contenido,
      documento.nombreOriginal ?? `${etiqueta}.pdf`,
      `Adjuntamos su ${etiqueta} correspondiente a la póliza ${factura.poliza.folio ?? ''}.`.trim(),
    );

    const actualizada = await this.prisma.factura.update({
      where: { id: facturaId },
      data: { enviadoAlClienteEn: new Date() },
    });

    await this.audit.registrar({
      entidad: 'Factura',
      entidadId: facturaId,
      accion: 'enviar_whatsapp',
      actorUserId,
      diff: { numero: cliente.whatsappNumber },
    });

    this.logger.log(`${etiqueta} ${facturaId} enviada a ${cliente.whatsappNumber}`);
    return actualizada;
  }
}
