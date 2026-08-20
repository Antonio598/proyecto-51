import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AdjuntoCorreo {
  nombre: string;
  contenido: Buffer;
  tipo?: string;
}

export interface EnviarCorreo {
  para: string;
  asunto: string;
  html: string;
  texto?: string;
  adjuntos?: AdjuntoCorreo[];
}

/**
 * Envío de correo transaccional. Reemplaza a WhatsApp como canal de salida.
 * Proveedor seleccionable por env (`CORREO_PROVIDER`: resend | sendgrid).
 *
 * Variables de entorno:
 *  - CORREO_PROVIDER  (por defecto "resend")
 *  - RESEND_API_KEY   (o SENDGRID_API_KEY según proveedor)
 *  - CORREO_REMITENTE ("Despacho Seguros <cobranza@tudominio.mx>")
 */
@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);
  private readonly proveedor: string;
  private readonly apiKey: string;
  private readonly remitente: string;

  constructor(config: ConfigService) {
    this.proveedor = (config.get<string>('CORREO_PROVIDER') ?? 'resend').toLowerCase();
    this.remitente = config.get<string>('CORREO_REMITENTE') ?? '';
    this.apiKey =
      this.proveedor === 'sendgrid'
        ? (config.get<string>('SENDGRID_API_KEY') ?? '')
        : (config.get<string>('RESEND_API_KEY') ?? '');
  }

  /** ¿Hay credenciales y remitente configurados para poder enviar? */
  estaConfigurado(): boolean {
    return Boolean(this.apiKey && this.remitente);
  }

  async enviar(correo: EnviarCorreo): Promise<{ enviado: boolean; id?: string }> {
    if (!this.estaConfigurado()) {
      throw new Error(
        'Correo no configurado: falta CORREO_REMITENTE y/o la API key del proveedor.',
      );
    }
    if (!correo.para) {
      throw new Error('El destinatario no tiene correo registrado.');
    }
    return this.proveedor === 'sendgrid' ? this.enviarSendgrid(correo) : this.enviarResend(correo);
  }

  private async enviarResend(correo: EnviarCorreo) {
    const body: Record<string, unknown> = {
      from: this.remitente,
      to: [correo.para],
      subject: correo.asunto,
      html: correo.html,
      ...(correo.texto ? { text: correo.texto } : {}),
      ...(correo.adjuntos?.length
        ? {
            attachments: correo.adjuntos.map((a) => ({
              filename: a.nombre,
              content: a.contenido.toString('base64'),
            })),
          }
        : {}),
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detalle = await res.text();
      this.logger.error(`Resend falló (${res.status}): ${detalle}`);
      throw new Error('No se pudo enviar el correo (Resend).');
    }
    const data = (await res.json()) as { id?: string };
    return { enviado: true, id: data.id };
  }

  private async enviarSendgrid(correo: EnviarCorreo) {
    const { email, name } = this.parseRemitente(this.remitente);
    const body: Record<string, unknown> = {
      personalizations: [{ to: [{ email: correo.para }] }],
      from: name ? { email, name } : { email },
      subject: correo.asunto,
      content: [
        ...(correo.texto ? [{ type: 'text/plain', value: correo.texto }] : []),
        { type: 'text/html', value: correo.html },
      ],
      ...(correo.adjuntos?.length
        ? {
            attachments: correo.adjuntos.map((a) => ({
              content: a.contenido.toString('base64'),
              filename: a.nombre,
              type: a.tipo ?? 'application/octet-stream',
              disposition: 'attachment',
            })),
          }
        : {}),
    };

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detalle = await res.text();
      this.logger.error(`SendGrid falló (${res.status}): ${detalle}`);
      throw new Error('No se pudo enviar el correo (SendGrid).');
    }
    // SendGrid devuelve 202 sin cuerpo; el id viaja en el header.
    return { enviado: true, id: res.headers.get('x-message-id') ?? undefined };
  }

  /** "Despacho Seguros <correo@dominio.mx>" → { name, email }. */
  private parseRemitente(valor: string): { email: string; name?: string } {
    const match = valor.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (match) return { name: match[1] || undefined, email: match[2].trim() };
    return { email: valor.trim() };
  }
}

/** Envuelve un cuerpo HTML en una plantilla simple y consistente. */
export function plantillaCorreo(titulo: string, cuerpoHtml: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f1f5f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;padding:16px 24px;color:#ffffff;font-size:16px;font-weight:bold;">${titulo}</div>
    <div style="padding:24px;font-size:14px;line-height:1.6;">${cuerpoHtml}</div>
    <div style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;">
      Este es un mensaje automático de su despacho de seguros. Si ya realizó el pago, ignore este correo.
    </div>
  </div>
</body></html>`;
}
