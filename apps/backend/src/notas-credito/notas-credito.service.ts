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
    const lectura = await this.claude.leerNotaCredito(archivo.buffer, archivo.mime);
    const rfc = normalizarRfc(lectura.rfc);
    if (!rfc) {
      throw new BadRequestException('No se pudo leer el RFC del receptor en la nota de crédito.');
    }

    const cliente = await this.prisma.cliente.findUnique({ where: { rfc } });
    if (!cliente) {
      throw new NotFoundException(`No hay un cliente registrado con el RFC ${rfc}.`);
    }

    // Si la nota trae el UUID de la factura relacionada, se busca esa factura.
    const factura = lectura.uuid_relacionado
      ? await this.prisma.factura.findFirst({
          where: { uuid: lectura.uuid_relacionado, clienteId: cliente.id },
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
        uuidRelacionado: lectura.uuid_relacionado ?? null,
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
      lectura,
    };
  }
}
