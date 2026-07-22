import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Almacenamiento de documentos en Supabase Storage.
 * Todos los archivos (recibidos por WhatsApp y generados por el sistema)
 * viven aquí y se referencian desde la tabla Documento por `storageKey`.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const url = config.get<string>('SUPABASE_URL');
    const key = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.bucket = config.get<string>('SUPABASE_BUCKET') ?? 'documentos';

    if (!url || !key) {
      this.logger.warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados');
    }
    // La service_role key omite RLS: sólo debe vivir en el backend.
    this.client = createClient(url ?? '', key ?? '', {
      auth: { persistSession: false },
    });
  }

  /**
   * Sube un archivo y devuelve su clave de almacenamiento.
   * @param carpeta prefijo lógico, p. ej. `clientes/<id>/recibidos`
   */
  async subir(
    carpeta: string,
    nombreArchivo: string,
    contenido: Buffer,
    mime?: string,
  ): Promise<string> {
    const limpio = nombreArchivo.replace(/[^\w.\-]/g, '_');
    const storageKey = `${carpeta}/${Date.now()}-${limpio}`;

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(storageKey, contenido, {
        contentType: mime ?? 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      this.logger.error(`Error al subir ${storageKey}: ${error.message}`);
      throw new InternalServerErrorException('No se pudo guardar el documento');
    }
    return storageKey;
  }

  /** Descarga el contenido binario de un documento almacenado. */
  async descargar(storageKey: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(storageKey);
    if (error || !data) {
      this.logger.error(`Error al descargar ${storageKey}: ${error?.message}`);
      throw new InternalServerErrorException('No se pudo leer el documento');
    }
    return Buffer.from(await data.arrayBuffer());
  }

  /**
   * URL temporal para que el frontend muestre/descargue el archivo
   * sin exponer la service_role key.
   */
  async urlFirmada(storageKey: string, segundos = 3600): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(storageKey, segundos);
    if (error || !data) {
      throw new InternalServerErrorException('No se pudo generar el enlace');
    }
    return data.signedUrl;
  }
}
