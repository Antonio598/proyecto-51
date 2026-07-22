import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cliente de Evolution API: envío de mensajes/adjuntos y descarga de media entrante.
 * Es el único canal externo de comunicación del sistema.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instancia: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (config.get<string>('EVOLUTION_API_URL') ?? '').replace(/\/$/, '');
    this.apiKey = config.get<string>('EVOLUTION_API_KEY') ?? '';
    this.instancia = config.get<string>('EVOLUTION_INSTANCE') ?? 'despacho';
  }

  private headers() {
    return { 'Content-Type': 'application/json', apikey: this.apiKey };
  }

  /** Normaliza un número de WhatsApp a E.164 (+52...). */
  static normalizarNumero(valor: string): string {
    const soloDigitos = valor.replace(/\D/g, '');
    return `+${soloDigitos}`;
  }

  /** Convierte un JID de Evolution (`5215512345678@s.whatsapp.net`) a E.164. */
  static jidANumero(jid: string): string {
    const base = jid.split('@')[0].split(':')[0];
    // México inserta un "1" tras el 52 en algunos JIDs; se descarta para empatar con el alta.
    const limpio = base.replace(/^521(\d{10})$/, '52$1');
    return `+${limpio}`;
  }

  async enviarTexto(numero: string, texto: string): Promise<void> {
    const destino = numero.replace(/\D/g, '');
    const res = await fetch(`${this.baseUrl}/message/sendText/${this.instancia}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ number: destino, text: texto }),
    });
    if (!res.ok) {
      this.logger.error(`Error al enviar texto a ${numero}: ${res.status} ${await res.text()}`);
      throw new Error('No se pudo enviar el mensaje de WhatsApp');
    }
  }

  /** Envía un documento adjunto (propuesta, desglose, póliza, factura…). */
  async enviarDocumento(
    numero: string,
    archivo: Buffer,
    nombreArchivo: string,
    descripcion?: string,
  ): Promise<void> {
    const destino = numero.replace(/\D/g, '');
    const res = await fetch(`${this.baseUrl}/message/sendMedia/${this.instancia}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        number: destino,
        mediatype: 'document',
        fileName: nombreArchivo,
        media: archivo.toString('base64'),
        caption: descripcion,
      }),
    });
    if (!res.ok) {
      this.logger.error(`Error al enviar documento a ${numero}: ${res.status}`);
      throw new Error('No se pudo enviar el documento por WhatsApp');
    }
  }

  /**
   * Descarga el binario de un mensaje con adjunto.
   * Evolution puede entregar el base64 en el propio webhook o exponerlo por este endpoint.
   */
  async descargarMedia(messageId: string): Promise<Buffer | null> {
    const res = await fetch(`${this.baseUrl}/chat/getBase64FromMediaMessage/${this.instancia}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
    });
    if (!res.ok) {
      this.logger.warn(`No se pudo descargar media ${messageId}: ${res.status}`);
      return null;
    }
    const cuerpo = (await res.json()) as { base64?: string };
    return cuerpo.base64 ? Buffer.from(cuerpo.base64, 'base64') : null;
  }
}
