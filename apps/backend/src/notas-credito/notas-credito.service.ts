import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrigenDocumento, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ClaudeService } from '../ia/claude.service';
import { AuditService } from '../audit/audit.service';
import { normalizarRfc } from '../clientes/rfc.util';

/**
 * Notas de crédito: la IA lee el documento, lo liga por RFC al cliente y, si
 * trae el UUID de la factura relacionada, también a esa factura.
 */
@Injectable()
export class NotasCreditoService {
  private readonly logger = new Logger(NotasCreditoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly claude: ClaudeService,
    private readonly audit: AuditService,
  ) {}

  listar() {
    return this.prisma.notaCredito.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        cliente: { select: { razonSocial: true, rfc: true } },
        factura: { select: { uuid: true, tipo: true } },
      },
    });
  }

  async subir(archivo: { buffer: Buffer; nombre: string; mime: string }, actorUserId: string) {
    let lectura: Awaited<ReturnType<ClaudeService['leerNotaCredito']>>;
    try {
      lectura = await this.claude.leerNotaCredito(archivo.buffer, archivo.mime);
    } catch (err) {
      this.logger.error(`No se pudo leer la nota de crédito con IA: ${(err as Error).message}`);
      throw new BadRequestException(
        `No se pudo leer la nota de crédito con IA: ${(err as Error).message}. Verifica que el archivo sea legible (PDF o imagen).`,
      );
    }
    const rfc = normalizarRfc(lectura.rfc);
    if (!rfc) {
      throw new BadRequestException('No se pudo leer el RFC del receptor en la nota de crédito.');
    }

    const cliente = await this.prisma.cliente.findUnique({ where: { rfc } });
    if (!cliente) {
      throw new NotFoundException(`No hay un cliente registrado con el RFC ${rfc}.`);
    }

    // Si la nota trae el UUID de la factura relacionada, se busca esa factura por
    // su UUID (folio fiscal, único globalmente), sin importar mayúsculas/minúsculas.
    const uuidRel = lectura.uuid_relacionado?.trim() || null;
    const factura = uuidRel
      ? await this.prisma.factura.findFirst({
          where: { uuid: { equals: uuidRel, mode: 'insensitive' } },
        })
      : null;

    const storageKey = await this.storage.subir(
      `clientes/${cliente.id}/notas-credito`,
      archivo.nombre,
      archivo.buffer,
      archivo.mime,
    );
    const documento = await this.prisma.documento.create({
      data: {
        clienteId: cliente.id,
        tipo: TipoDocumento.factura,
        origen: OrigenDocumento.manual_upload,
        storageKey,
        mime: archivo.mime,
        nombreOriginal: archivo.nombre,
        procesado: true,
      },
    });

    const nota = await this.prisma.notaCredito.create({
      data: {
        clienteId: cliente.id,
        facturaId: factura?.id ?? null,
        uuidRelacionado: uuidRel,
        importe: lectura.total != null ? (lectura.total as never) : null,
        storageDocId: documento.id,
      },
    });

    await this.audit.registrar({
      entidad: 'NotaCredito',
      entidadId: nota.id,
      accion: 'subir',
      actorUserId,
      diff: { rfc, clienteId: cliente.id, facturaVinculada: !!factura },
    });

    this.logger.log(`Nota de crédito ${nota.id} ligada al cliente ${cliente.id}`);
    return {
      nota,
      cliente: { id: cliente.id, razonSocial: cliente.razonSocial, rfc: cliente.rfc },
      facturaVinculada: !!factura,
      // Para vincular a mano si no cayó sola: las facturas del cliente.
      facturasCliente: await this.facturasDelCliente(cliente.id),
      lectura,
    };
  }

  /** Vincula manualmente una nota de crédito a una factura. */
  async vincularFactura(notaId: string, facturaId: string, actorUserId: string) {
    const nota = await this.prisma.notaCredito.findUnique({ where: { id: notaId } });
    if (!nota) throw new NotFoundException('Nota de crédito no encontrada');
    const factura = await this.prisma.factura.findUnique({ where: { id: facturaId } });
    if (!factura) throw new NotFoundException('Factura no encontrada');

    const actualizada = await this.prisma.notaCredito.update({
      where: { id: notaId },
      data: { facturaId },
    });
    await this.audit.registrar({
      entidad: 'NotaCredito',
      entidadId: notaId,
      accion: 'vincular_factura',
      actorUserId,
      diff: { facturaId },
    });
    return actualizada;
  }

  /** Facturas del cliente (por RFC directo o vía sus pólizas) para vincular a mano. */
  private facturasDelCliente(clienteId: string) {
    return this.prisma.factura.findMany({
      where: { OR: [{ clienteId }, { poliza: { clienteId } }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        tipo: true,
        uuid: true,
        createdAt: true,
        poliza: { select: { folio: true } },
      },
    });
  }
}
