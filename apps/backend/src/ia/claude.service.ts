import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';

/** Campos que el sistema intenta extraer de cada unidad del layout del despacho. */
export interface UnidadExtraida {
  flotaNombre: string | null;
  folio: string | null;
  aseguradoNombre: string | null;
  tipo: 'camion' | 'tractocamion' | 'remolque' | 'otro';
  marca: string | null;
  descripcion: string | null;
  anio: number | null;
  vin: string | null;
  numeroEconomico: string | null;
  valorAsegurado: number | null;
  placas: string | null;
  numeroMotor: string | null;
  tipoCobertura: string | null;
  tipoCarga: string | null;
  tipoAdaptacion: string | null;
  coberturaAdaptacion: string | null;
  sumaAseguradaAdaptacion: number | null;
  usoUnidad: string | null;
  dobleRemolque: boolean;
  /** Confianza 0–1 por campo; los campos bajos se marcan para revisión humana. */
  confianza: Record<string, number>;
}

/** Campos de la unidad, en el orden del layout, para armar los esquemas y el prompt. */
const CAMPOS_UNIDAD = [
  'flotaNombre',
  'folio',
  'aseguradoNombre',
  'tipo',
  'marca',
  'descripcion',
  'anio',
  'vin',
  'numeroEconomico',
  'valorAsegurado',
  'placas',
  'numeroMotor',
  'tipoCobertura',
  'tipoCarga',
  'tipoAdaptacion',
  'coberturaAdaptacion',
  'sumaAseguradaAdaptacion',
  'usoUnidad',
  'dobleRemolque',
] as const;

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
          flotaNombre: {
            type: 'string',
            description:
              'Nombre o identificador de la flota a la que pertenece la unidad, si el documento lo indica (título, encabezado, hoja, agrupación o folio de flota). Si no aparece, cadena vacía "".',
          },
          folio: {
            type: 'string',
            description:
              'Folio o número de la unidad/inciso, el que se liga a su póliza. Si no aparece, cadena vacía "".',
          },
          aseguradoNombre: { type: 'string', description: 'Nombre del asegurado' },
          tipo: {
            type: 'string',
            enum: ['camion', 'tractocamion', 'remolque', 'otro'],
            description: 'Tipo de unidad normalizado',
          },
          marca: { type: 'string' },
          descripcion: { type: 'string', description: 'Descripción completa de la unidad' },
          anio: { type: ['integer', 'null'] },
          vin: { type: 'string', description: 'Número de serie / VIN (17 caracteres)' },
          numeroEconomico: { type: 'string' },
          valorAsegurado: { type: ['number', 'null'], description: 'Suma asegurada de la unidad' },
          placas: { type: 'string' },
          numeroMotor: { type: 'string' },
          tipoCobertura: {
            type: 'string',
            description: 'Amplia, limitada, RC, etc.',
          },
          tipoCarga: {
            type: 'string',
            description: 'Tipo de carga / descripción de la mercancía',
          },
          tipoAdaptacion: {
            type: 'string',
            description: 'Adaptación o equipo especial montado sobre la unidad, si lo hay',
          },
          coberturaAdaptacion: {
            type: 'string',
            description: 'Cobertura de la adaptación; suele ligarse a la cobertura de la unidad',
          },
          sumaAseguradaAdaptacion: { type: ['number', 'null'] },
          usoUnidad: {
            type: 'string',
            description: 'Particular, carga privada o carga federal',
          },
          dobleRemolque: {
            type: 'boolean',
            description: 'true si la unidad opera con doble remolque',
          },
          confianza: {
            type: 'object',
            description: 'Confianza de 0 a 1 por cada campo extraído',
            properties: Object.fromEntries(CAMPOS_UNIDAD.map((c) => [c, { type: 'number' }])),
            required: [...CAMPOS_UNIDAD],
            additionalProperties: false,
          },
        },
        required: [...CAMPOS_UNIDAD, 'confianza'],
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

Tu tarea es extraer, del documento que te envían, los datos de cada unidad de transporte. Estos son los campos del layout del despacho, con lo que significa cada uno:
- flotaNombre: nombre o identificador de la FLOTA a la que pertenece la unidad. Un cliente puede tener varias flotas. Búscalo en títulos, encabezados, el nombre de la hoja, agrupaciones visibles o un folio/clave de flota. Si el documento entero es una sola flota, usa ese nombre para todas. Si no hay forma de saberlo, devuelve null (el sistema usará el nombre del archivo).
- folio: folio o número de la unidad (inciso), el que se liga a su póliza. Si no aparece, null.
- aseguradoNombre: el nombre del asegurado (contratante) que aparezca en el renglón o en el encabezado del documento.
- tipo: tipo de unidad NORMALIZADO a uno de: camion, tractocamion, remolque, otro.
- marca: marca de la unidad (Kenworth, Volvo, Freightliner…).
- descripcion: descripción completa de la unidad tal como viene en el documento.
- anio: año/modelo de la unidad (número).
- vin: número de serie (VIN). Suele tener 17 caracteres alfanuméricos.
- numeroEconomico: número económico interno de la unidad.
- valorAsegurado: suma asegurada de la unidad, en pesos, como número sin símbolos ni comas.
- placas: placas de la unidad.
- numeroMotor: número de motor.
- tipoCobertura: tipo de cobertura de la unidad (amplia, limitada, RC, etc.). Cópialo tal cual.
- tipoCarga: tipo de carga o descripción de la mercancía que transporta.
- tipoAdaptacion: si la unidad trae una adaptación o equipo especial (grúa, tanque, plataforma, refrigeración…), descríbela; si no hay, null.
- coberturaAdaptacion: cobertura de esa adaptación (suele ser la misma que la de la unidad); si no hay adaptación, null.
- sumaAseguradaAdaptacion: suma asegurada de la adaptación, como número; si no hay, null.
- usoUnidad: uso de la unidad, uno de: particular, carga privada, carga federal (u otro texto si el documento dice algo distinto).
- dobleRemolque: true si la unidad opera con doble remolque (full/dolly), false si no.

Reglas:
- Extrae UNA entrada por unidad. Si el documento lista 12 unidades, devuelve 12 entradas.
- Nunca inventes un VIN, unas placas ni un número de motor.
- Si un dato de texto no aparece o no puedes leerlo con certeza, devuelve cadena vacía "" en ese campo; en los numéricos (anio, valorAsegurado, sumaAseguradaAdaptacion) devuelve null; en dobleRemolque, false. En todos los casos marca una confianza baja (menor a 0.5). NO adivines.
- La confianza refleja qué tan seguro estás de CADA campo: 1.0 = el dato está escrito explícita y legiblemente; 0.5 = lo estás infiriendo; 0.0 = no está. Incluye una confianza para TODOS los campos, incluido dobleRemolque.
- Los importes vienen en pesos mexicanos; devuélvelos como número sin símbolos ni comas.
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
              folio: { type: 'string', description: 'Número o folio de la póliza' },
              vigenciaInicio: { type: 'string', description: 'Fecha ISO YYYY-MM-DD' },
              vigenciaFin: { type: 'string', description: 'Fecha ISO YYYY-MM-DD' },
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
              fecha: { type: 'string', description: 'Fecha ISO YYYY-MM-DD' },
              referencia: { type: 'string' },
              beneficiario: { type: 'string' },
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
    return { type: 'text', text: this.limitarTexto(contenido.toString('utf-8')) };
  }

  /**
   * Recorta el texto que se manda al modelo. Algunos Excel maestros tienen
   * rangos enormes y superan el contexto (o el tamaño máximo de la petición);
   * en vez de fallar, se envía la parte inicial y se avisa del recorte.
   */
  private limitarTexto(texto: string): string {
    const MAX = 600_000; // ~180k tokens; deja margen para el prompt y la salida
    if (texto.length <= MAX) return texto;
    return (
      texto.slice(0, MAX) +
      '\n\n[... documento recortado por ser demasiado grande; puede faltar información al final ...]'
    );
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
    const texto = libro.SheetNames.map((nombre) => {
      // blankrows: false descarta filas vacías (los maestros suelen traer rangos enormes en blanco).
      const csv = XLSX.utils.sheet_to_csv(libro.Sheets[nombre], { blankrows: false });
      return `--- Hoja: ${nombre} ---\n${csv}`;
    }).join('\n\n');
    return this.limitarTexto(texto);
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
