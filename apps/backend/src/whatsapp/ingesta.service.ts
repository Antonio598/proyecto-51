import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { EstadoCobranza, OrigenDocumento, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ConciliacionService } from '../pagos/conciliacion.service';
import { WhatsappService } from './whatsapp.service';

/** Forma (parcial y defensiva) del webhook `messages.upsert` de Evolution API. */
interface EventoEvolution {
  event?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    messageType?: string;
    message?: Record<string, any>;
    base64?: string;
  };
}

const TIPOS_CON_ADJUNTO = ['documentMessage', 'imageMessage', 'audioMessage', 'videoMessage'];

/**
 * Convierte un mensaje entrante de WhatsApp en un Documento de la bandeja
 * "documentos por procesar", asociado automáticamente al cliente por su número.
 */
@Injectable()
export class IngestaService {
  private readonly logger = new Logger(IngestaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly whatsapp: WhatsappService,
    @Inject(forwardRef(() => ConciliacionService))
    private readonly conciliacion: ConciliacionService,
  ) {}

  async procesarEvento(evento: EventoEvolution): Promise<{ procesado: boolean; motivo?: string }> {
    const data = evento.data;
    if (!data?.key || data.key.fromMe) {
      return { procesado: false, motivo: 'mensaje propio o sin clave' };
    }

    const tipo = data.messageType ?? '';
    if (!TIPOS_CON_ADJUNTO.includes(tipo)) {
      return { procesado: false, motivo: 'mensaje sin adjunto' };
    }

    // 1. Identificar al cliente por su número de WhatsApp registrado.
    const numero = WhatsappService.jidANumero(data.key.remoteJid ?? '');
    const cliente = await this.prisma.cliente.findUnique({ where: { whatsappNumber: numero } });
    if (!cliente) {
      this.logger.warn(`Adjunto recibido de un número no registrado: ${numero}`);
    }

    // 2. Obtener el binario (viene en el webhook o se pide a Evolution).
    const contenido = data.base64
      ? Buffer.from(data.base64, 'base64')
      : await this.whatsapp.descargarMedia(data.key.id ?? '');
    if (!contenido) {
      this.logger.warn(`No se pudo obtener el adjunto del mensaje ${data.key.id}`);
      return { procesado: false, motivo: 'adjunto no descargable' };
    }

    // 3. Guardar en Supabase Storage.
    const detalle = data.message?.[tipo] ?? {};
    const nombreOriginal: string = detalle.fileName ?? `${tipo}-${data.key.id}`;
    const mime: string = detalle.mimetype ?? 'application/octet-stream';
    const carpeta = cliente ? `clientes/${cliente.id}/recibidos` : 'sin-asignar';
    const storageKey = await this.storage.subir(carpeta, nombreOriginal, contenido, mime);

    // 4. Registrar en la bandeja de documentos por procesar.
    const documento = await this.prisma.documento.create({
      data: {
        clienteId: cliente?.id ?? null,
        tipo: TipoDocumento.recibido,
        origen: OrigenDocumento.whatsapp,
        storageKey,
        mime,
        nombreOriginal,
        procesado: false,
        metadata: {
          numero,
          pushName: data.pushName ?? null,
          messageId: data.key.id ?? null,
          messageType: tipo,
        },
      },
    });

    this.logger.log(
      `Documento ${documento.id} recibido de ${numero}` +
        (cliente ? ` (${cliente.razonSocial})` : ' [cliente no identificado]'),
    );

    // Si el cliente tiene cobros abiertos, el adjunto puede ser un comprobante
    // de pago: se intenta conciliar solo, sin bloquear la respuesta al webhook.
    if (cliente) {
      void this.conciliarSiProcede(cliente.id, documento.id);
    }

    return { procesado: true };
  }

  /**
   * Conciliación oportunista en segundo plano. Si el documento no resulta ser
   * un comprobante, la conciliación simplemente no encuentra match y el
   * documento se queda en la bandeja de extracción como cualquier otro.
   */
  private async conciliarSiProcede(clienteId: string, documentoId: string) {
    try {
      const cobrosAbiertos = await this.prisma.corte.count({
        where: {
          estado: { not: EstadoCobranza.pagado },
          poliza: { clienteId },
        },
      });
      if (cobrosAbiertos === 0) return;

      await this.conciliacion.intentar(documentoId);
    } catch (err) {
      this.logger.warn(
        `No se pudo conciliar automáticamente el documento ${documentoId}: ${(err as Error).message}`,
      );
    }
  }
}
