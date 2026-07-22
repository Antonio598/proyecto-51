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
  private readonly bucket: string;
  private readonly url?: string;
  private readonly key?: string;
  private clienteCache?: SupabaseClient;

  constructor(config: ConfigService) {
    this.url = config.get<string>('SUPABASE_URL');
    this.key = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.bucket = config.get<string>('SUPABASE_BUCKET') ?? 'documentos';

    if (!this.url || !this.key) {
      this.logger.warn(
        'SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas: la subida y ' +
          'descarga de documentos fallará hasta que se definan.',
      );
    }
  }

  /**
   * El cliente se crea al primer uso, no en el constructor: `createClient`
   * lanza si la URL está vacía, y eso tumbaría toda la aplicación al arrancar
   * en vez de fallar sólo la función que necesita almacenamiento.
   */
  private get client(): SupabaseClient {
    if (!this.clienteCache) {
      if (!this.url || !this.key) {
        throw new InternalServerErrorException(
          'El almacenamiento de documentos no está configurado (faltan SUPABASE_URL ' +
            'y/o SUPABASE_SERVICE_ROLE_KEY).',
        );
      }
      // La service_role key omite RLS: sólo debe vivir en el backend.
      this.clienteCache = createClient(this.url, this.key, {
        auth: { persistSession: false },
      });
    }
    return this.clienteCache;
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
