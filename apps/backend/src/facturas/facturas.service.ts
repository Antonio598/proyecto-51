import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrigenDocumento, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CorreoService, plantillaCorreo } from '../correo/correo.service';
import { ClaudeService } from '../ia/claude.service';
import { AuditService } from '../audit/audit.service';
import { normalizarRfc } from '../clientes/rfc.util';

/** Los dos únicos tipos de documento que maneja este módulo. */
export type TipoFactura = 'factura' | 'complemento';

/**
 * Módulo 11 — Facturas y complementos de pago.
 * Se descargan del portal de la aseguradora (manual, no hay API), se suben aquí
 * y el envío al cliente por correo es automático.
 */
@Injectable()
export class FacturasService {
  private readonly logger = new Logger(FacturasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly correo: CorreoService,
    private readonly claude: ClaudeService,
    private readonly audit: AuditService,
  ) {}

  listarPorPoliza(polizaId: string) {
    return this.prisma.factura.findMany({
      where: { polizaId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Facturas del cliente: las ligadas directo por RFC y las de sus pólizas. */
  listarPorCliente(clienteId: string) {
    return this.prisma.factura.findMany({
      where: { OR: [{ clienteId }, { poliza: { clienteId } }] },
      orderBy: { createdAt: 'desc' },
      include: { poliza: { select: { folio: true } } },
    });
  }

  /**
   * Sube una factura/complemento, extrae el RFC con IA y la liga al cliente
   * correspondiente (Factura → RFC → Cliente). Si el cliente tiene expediente,
   * el documento queda ligado a él.
   */
  async subirPorRfc(
    tipo: TipoFactura,
    archivo: { buffer: Buffer; nombre: string; mime: string },
    actorUserId: string,
  ) {
    const lectura = await this.claude.leerFactura(archivo.buffer, archivo.mime);
    const rfc = normalizarRfc(lectura.rfc);
    if (!rfc) {
      throw new BadRequestException(
        'No se pudo leer el RFC del receptor en la factura. Súbela desde la póliza del cliente.',
      );
    }

    const cliente = await this.prisma.cliente.findUnique({ where: { rfc } });
    if (!cliente) {
      throw new NotFoundException(
        `No hay un cliente registrado con el RFC ${rfc}. Verifica el RFC o crea el cliente.`,
      );
    }

    // Si el cliente tiene un expediente, se liga el documento a él.
    const expediente = await this.prisma.expediente.findFirst({
      where: { clienteId: cliente.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const storageKey = await this.storage.subir(
      `clientes/${cliente.id}/facturas`,
      archivo.nombre,
      archivo.buffer,
      archivo.mime,
    );
    const documento = await this.prisma.documento.create({
      data: {
        clienteId: cliente.id,
        expedienteId: expediente?.id ?? null,
        tipo,
        origen: OrigenDocumento.manual_upload,
        storageKey,
        mime: archivo.mime,
        nombreOriginal: archivo.nombre,
        procesado: true,
      },
    });

    const factura = await this.prisma.factura.create({
      data: { clienteId: cliente.id, tipo, storageDocId: documento.id },
    });

    await this.audit.registrar({
      entidad: 'Factura',
      entidadId: factura.id,
      accion: 'subir_por_rfc',
      actorUserId,
      diff: { rfc, clienteId: cliente.id, tipo },
    });

    return {
      factura,
      cliente: { id: cliente.id, razonSocial: cliente.razonSocial, rfc: cliente.rfc },
      lectura,
    };
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

  /** Envía la factura o complemento al cliente por correo. */
  async enviar(facturaId: string, actorUserId: string) {
    const factura = await this.prisma.factura.findUnique({
      where: { id: facturaId },
      include: { poliza: { include: { cliente: true } }, cliente: true },
    });
    if (!factura) throw new NotFoundException('Factura no encontrada');
    if (!factura.storageDocId) {
      throw new BadRequestException('Esta factura no tiene archivo asociado');
    }

    const cliente = factura.cliente ?? factura.poliza?.cliente;
    if (!cliente) throw new BadRequestException('La factura no está ligada a ningún cliente');
    if (!cliente.contactoEmail) {
      throw new BadRequestException('El cliente no tiene correo registrado');
    }

    const documento = await this.prisma.documento.findUnique({
      where: { id: factura.storageDocId },
    });
    if (!documento) throw new NotFoundException('No se encontró el archivo de la factura');

    const contenido = await this.storage.descargar(documento.storageKey);
    const etiqueta = factura.tipo === TipoDocumento.complemento ? 'complemento de pago' : 'factura';

    const html = plantillaCorreo(
      etiqueta === 'factura' ? 'Su factura' : 'Su complemento de pago',
      `<p>Estimado cliente de ${cliente.razonSocial}:</p>
       <p>Adjuntamos su ${etiqueta}${
         factura.poliza?.folio ? ` correspondiente a la póliza ${factura.poliza.folio}` : ''
       }.</p>
       <p>Quedamos a sus órdenes.</p>`,
    );

    await this.correo.enviar({
      para: cliente.contactoEmail,
      asunto: `Su ${etiqueta} — ${cliente.razonSocial}`,
      html,
      adjuntos: [
        {
          nombre: documento.nombreOriginal ?? `${etiqueta}.pdf`,
          contenido,
          tipo: documento.mime ?? 'application/pdf',
        },
      ],
    });

    const actualizada = await this.prisma.factura.update({
      where: { id: facturaId },
      data: { enviadoAlClienteEn: new Date() },
    });

    await this.audit.registrar({
      entidad: 'Factura',
      entidadId: facturaId,
      accion: 'enviar_correo',
      actorUserId,
      diff: { correo: cliente.contactoEmail },
    });

    this.logger.log(`${etiqueta} ${facturaId} enviada a ${cliente.contactoEmail}`);
    return actualizada;
  }
}
