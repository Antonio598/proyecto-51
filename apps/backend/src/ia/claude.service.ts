import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';

/** Campos que el sistema intenta extraer de cada unidad del layout del despacho. */
export interface UnidadExtraida {
  tipo: 'camion' | 'tractocamion' | 'remolque' | 'otro';
  vin: string | null;
  anio: number | null;
  marca: string | null;
  modelo: string | null;
  descripcion: string | null;
  tipoCarga: string | null;
  valorAsegurado: number | null;
  /** Confianza 0–1 por campo; los campos bajos se marcan para revisión humana. */
  confianza: Record<string, number>;
}

export interface ResultadoExtraccion {
  unidades: UnidadExtraida[];
  notas: string;
  modeloUsado: string;
}

/** Esquema de salida estructurada — el modelo devuelve JSON validado, no texto a parsear. */
const ESQUEMA_UNIDADES = {
  type: 'object',
  properties: {
    unidades: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['camion', 'tractocamion', 'remolque', 'otro'] },
          vin: { type: ['string', 'null'], description: 'Número de serie / VIN' },
          anio: { type: ['integer', 'null'] },
          marca: { type: ['string', 'null'] },
          modelo: { type: ['string', 'null'] },
          descripcion: { type: ['string', 'null'] },
          tipoCarga: { type: ['string', 'null'], description: 'Tipo de carga que transporta' },
          valorAsegurado: { type: ['number', 'null'] },
          confianza: {
            type: 'object',
            description: 'Confianza de 0 a 1 por cada campo extraído',
            properties: {
              tipo: { type: 'number' },
              vin: { type: 'number' },
              anio: { type: 'number' },
              marca: { type: 'number' },
              modelo: { type: 'number' },
              descripcion: { type: 'number' },
              tipoCarga: { type: 'number' },
              valorAsegurado: { type: 'number' },
            },
            required: [
              'tipo',
              'vin',
              'anio',
              'marca',
              'modelo',
              'descripcion',
              'tipoCarga',
              'valorAsegurado',
            ],
            additionalProperties: false,
          },
        },
        required: [
          'tipo',
          'vin',
          'anio',
          'marca',
          'modelo',
          'descripcion',
          'tipoCarga',
          'valorAsegurado',
          'confianza',
        ],
        additionalProperties: false,
      },
    },
    notas: {
      type: 'string',
      description: 'Observaciones sobre ambigüedades o datos ilegibles del documento',
    },
  },
  required: ['unidades', 'notas'],
  additionalProperties: false,
} as const;

const SISTEMA_EXTRACCION = `Eres un asistente del área de captura de un despacho de seguros mexicano que administra pólizas para flotas de transporte de carga.

Tu tarea es extraer, del documento que te envían, los datos de cada unidad de transporte (camiones, tractocamiones, remolques y equipo similar).

Reglas:
- Extrae UNA entrada por unidad. Si el documento lista 12 unidades, devuelve 12 entradas.
- El VIN (número de serie) suele tener 17 caracteres alfanuméricos. Nunca inventes uno.
- Si un dato no aparece o no puedes leerlo con certeza, devuelve null en ese campo y una confianza baja (menor a 0.5). NO adivines.
- La confianza refleja qué tan seguro estás de CADA campo: 1.0 = el dato está escrito explícita y legiblemente; 0.5 = lo estás infiriendo; 0.0 = no está.
- Los valores asegurados vienen en pesos mexicanos; devuélvelos como número sin símbolos ni comas.
- "tipo" se infiere de la descripción: un tractocamión arrastra, un remolque/caja es arrastrado, un camión es rígido. Si no es claro, usa "otro".
- En "notas" reporta cualquier ambigüedad, columna que no entendiste o dato que el humano deba verificar.

Es preferible marcar un dato como incierto a capturarlo mal: un humano revisará tu extracción antes de que entre al sistema.`;

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly client: Anthropic;
  private readonly modelo: string;

  constructor(config: ConfigService) {
    this.client = new Anthropic({
      apiKey: config.get<string>('ANTHROPIC_API_KEY'),
    });
    this.modelo = config.get<string>('CLAUDE_MODEL') ?? 'claude-opus-4-8';
  }

  /**
   * Extrae las unidades de un documento (Excel, PDF o imagen).
   * Excel se convierte a CSV; PDF e imágenes se envían nativamente (visión).
   */
  async extraerUnidades(
    contenido: Buffer,
    mime: string,
    nombreArchivo: string,
  ): Promise<ResultadoExtraccion> {
    const bloque = this.construirBloqueDocumento(contenido, mime, nombreArchivo);

    const respuesta = await this.client.messages.create({
      model: this.modelo,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SISTEMA_EXTRACCION,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA_UNIDADES } },
      messages: [
        {
          role: 'user',
          content: [
            bloque,
            {
              type: 'text',
              text: `Extrae todas las unidades de transporte de este documento (${nombreArchivo}).`,
            },
          ],
        },
      ],
    });

    const datos = this.parsearJson<{ unidades: UnidadExtraida[]; notas: string }>(respuesta);
    return { ...datos, modeloUsado: this.modelo };
  }

  /**
   * Lee el folio y la vigencia de un PDF de póliza emitida, para no re-teclearlos.
   */
  async extraerFolioPoliza(
    contenido: Buffer,
    mime: string,
  ): Promise<{ folio: string | null; vigenciaInicio: string | null; vigenciaFin: string | null }> {
    const respuesta = await this.client.messages.create({
      model: this.modelo,
      max_tokens: 4000,
      system:
        'Extraes datos de carátulas de pólizas de seguro mexicanas. Si un dato no aparece, devuelve null. No inventes folios.',
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              folio: { type: ['string', 'null'], description: 'Número o folio de la póliza' },
              vigenciaInicio: { type: ['string', 'null'], description: 'Fecha ISO YYYY-MM-DD' },
              vigenciaFin: { type: ['string', 'null'], description: 'Fecha ISO YYYY-MM-DD' },
            },
            required: ['folio', 'vigenciaInicio', 'vigenciaFin'],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            this.construirBloqueDocumento(contenido, mime, 'poliza'),
            { type: 'text', text: 'Extrae el folio y la vigencia de esta póliza.' },
          ],
        },
      ],
    });

    return this.parsearJson(respuesta);
  }

  /**
   * Lee un comprobante de pago para conciliarlo automáticamente contra la póliza esperada.
   */
  async leerComprobantePago(
    contenido: Buffer,
    mime: string,
  ): Promise<{
    monto: number | null;
    fecha: string | null;
    referencia: string | null;
    beneficiario: string | null;
    confianza: number;
  }> {
    const respuesta = await this.client.messages.create({
      model: this.modelo,
      max_tokens: 4000,
      system:
        'Lees comprobantes de pago y transferencias bancarias mexicanas. Si un dato no aparece, devuelve null. No inventes montos ni referencias.',
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              monto: { type: ['number', 'null'], description: 'Importe pagado en MXN' },
              fecha: { type: ['string', 'null'], description: 'Fecha ISO YYYY-MM-DD' },
              referencia: { type: ['string', 'null'] },
              beneficiario: { type: ['string', 'null'] },
              confianza: { type: 'number', description: 'Confianza global de 0 a 1' },
            },
            required: ['monto', 'fecha', 'referencia', 'beneficiario', 'confianza'],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            this.construirBloqueDocumento(contenido, mime, 'comprobante'),
            { type: 'text', text: 'Extrae los datos de este comprobante de pago.' },
          ],
        },
      ],
    });

    return this.parsearJson(respuesta);
  }

  /**
   * Redacta los textos narrativos de la propuesta al cliente.
   * Sólo redacta: las cifras las inserta el sistema desde la base de datos,
   * para que el modelo no pueda inventar sumas aseguradas ni primas.
   */
  async redactarPropuesta(contexto: {
    cliente: string;
    aseguradora: string;
    unidades: number;
    tiposUnidad: string[];
    primaAnual: number | null;
    siniestralidad?: string | null;
    condicionesAseguradora?: string | null;
  }): Promise<{ resumen: string; alcance: string; condiciones: string }> {
    const respuesta = await this.client.messages.create({
      model: this.modelo,
      max_tokens: 4000,
      system: `Redactas propuestas de seguro para un despacho mexicano que coloca pólizas de flotas de transporte de carga.

Escribe en español de México, en tono profesional y directo, dirigido al dueño o gerente de la flota.

Reglas estrictas:
- NO inventes cifras, sumas aseguradas, primas, porcentajes ni fechas. El sistema inserta los números en tablas aparte.
- No uses lenguaje de venta exagerado ("la mejor opción del mercado", "increíble").
- Frases completas y claras; nada de listas con viñetas dentro de los párrafos.
- "resumen": 2 o 3 frases sobre qué se está proponiendo y para qué flota.
- "alcance": un párrafo que explique qué protege la póliza en términos prácticos para un transportista.
- "condiciones": un párrafo sobre condiciones de contratación, vigencia y forma de pago mensual. Si la aseguradora impuso condiciones particulares, menciónalas en sus propios términos.`,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              resumen: { type: 'string' },
              alcance: { type: 'string' },
              condiciones: { type: 'string' },
            },
            required: ['resumen', 'alcance', 'condiciones'],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: 'user',
          content: `Redacta la propuesta con estos datos:\n${JSON.stringify(contexto, null, 2)}`,
        },
      ],
    });

    return this.parsearJson(respuesta);
  }

  // ── Utilidades internas ──

  /**
   * Arma el bloque de contenido según el tipo de archivo:
   * Excel → texto CSV, PDF → document, imagen → image.
   */
  private construirBloqueDocumento(
    contenido: Buffer,
    mime: string,
    nombreArchivo: string,
  ): Anthropic.ContentBlockParam {
    if (this.esExcel(mime, nombreArchivo)) {
      return { type: 'text', text: this.excelATexto(contenido) };
    }
    if (mime === 'application/pdf') {
      return {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: contenido.toString('base64'),
        },
      };
    }
    if (mime.startsWith('image/')) {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mime as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
          data: contenido.toString('base64'),
        },
      };
    }
    // CSV o texto plano
    return { type: 'text', text: contenido.toString('utf-8') };
  }

  private esExcel(mime: string, nombreArchivo: string): boolean {
    return (
      mime.includes('spreadsheet') ||
      mime === 'application/vnd.ms-excel' ||
      /\.(xlsx|xls)$/i.test(nombreArchivo)
    );
  }

  /** Convierte cada hoja del libro a CSV para que el modelo lea la tabla completa. */
  private excelATexto(contenido: Buffer): string {
    const libro = XLSX.read(contenido, { type: 'buffer' });
    return libro.SheetNames.map((nombre) => {
      const csv = XLSX.utils.sheet_to_csv(libro.Sheets[nombre]);
      return `--- Hoja: ${nombre} ---\n${csv}`;
    }).join('\n\n');
  }

  /** Extrae el JSON estructurado del primer bloque de texto de la respuesta. */
  private parsearJson<T>(respuesta: Anthropic.Message): T {
    const bloque = respuesta.content.find((b) => b.type === 'text');
    if (!bloque || bloque.type !== 'text') {
      this.logger.error(`Respuesta sin texto (stop_reason: ${respuesta.stop_reason})`);
      throw new Error('El modelo no devolvió datos estructurados');
    }
    return JSON.parse(bloque.text) as T;
  }
}
