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

/** Un vehículo tal como lo devuelve el modelo (esquema por bloque de póliza). */
interface VehiculoCrudo {
  inciso: string | null;
  endoso: string | null;
  movimiento: string | null;
  descripcion_vehiculo: string | null;
  tipo: string | null;
  modelo: number | null;
  no_economico: string | null;
  serie: string | null;
  motor: string | null;
  placas: string | null;
  placas_en_tramite: boolean;
  cobertura: string | null;
  tipo_carga: string | null;
  uso: string | null;
  servicio: string | null;
  doble_remolque: boolean | null;
  daños_materiales: number | 'AMPARADO' | null;
  robo_total: number | 'AMPARADO' | null;
  rc_terceros: number | 'AMPARADO' | null;
  adaptacion_descripcion: string | null;
  adaptacion_suma: number | null;
  evidencia?: Record<string, string | null>;
}

/** Extracción completa de UN documento, tal como la devuelve el modelo. */
interface ExtraccionCruda {
  tipo_documento: 'poliza' | 'recibo' | 'endoso' | 'listado' | 'otro';
  aseguradora: string | null;
  asegurado: string | null;
  rfc: string | null;
  no_poliza: string | null;
  vigencia_inicio: string | null;
  vigencia_fin: string | null;
  vehiculos: VehiculoCrudo[];
  conflictos?: Array<{ campo: string; valores: string[]; nota?: string }>;
  notas?: string[];
}

export interface ResultadoExtraccion {
  unidades: UnidadExtraida[];
  /** Datos fiscales del cliente/contratante que aparezcan en el documento. */
  cliente: { rfc: string; razonSocial: string };
  notas: string;
  /** Clasificación del documento: poliza | recibo | endoso | otro. */
  tipoDocumento: string;
  /** JSON crudo del modelo, para auditoría (no se pierde ningún dato). */
  crudo: ExtraccionCruda;
  modeloUsado: string;
}

const SISTEMA_EXTRACCION = `Eres un extractor de datos de documentos de seguros vehiculares mexicanos.
Devuelves EXCLUSIVAMENTE JSON válido, sin markdown, sin preámbulo.

PASO 1 — CLASIFICA el documento antes de extraer:
- "poliza": carátula o inciso de póliza. Contiene "DESCRIPCIÓN DEL VEHÍCULO
  ASEGURADO" o "VEHÍCULO ASEGURADO" + desglose de coberturas con sumas.
- "recibo": comprobante de pago. Contiene "TOTAL A PAGAR", el importe en letra,
  o descripción en formato "<DESCRIPCIÓN> MOD. AAAA AMIS #####".
- "endoso": contiene "Movimiento:" con valor A-ADICIONAL, B-DESCRIPTIVO,
  D-DEVOLUCION, BAJA o similar.
- "listado": una TABLA u hoja de cálculo (Excel/CSV) con varios vehículos en
  filas: control de flota, vaciado, cotización o el layout del despacho. Trae
  columnas como descripción, serie/VIN, placas, no. económico, año/modelo y
  suma asegurada. Si el contenido es una tabla con filas de vehículos, es
  "listado" (NUNCA "otro").
- "otro": cualquier otra cosa (p. ej. la tarjeta de circulación, una factura o
  una foto de UN solo vehículo). Aun así, extrae lo que traiga (ver PASO 2).

REGLA CRÍTICA: si tipo_documento es "recibo", devuelve vehiculos: [] SIEMPRE.
Un recibo nunca genera un registro de unidad, aunque describa un vehículo.
La cadena "AMIS #####" es marca de recibo, no de póliza.

PASO 2 — EXTRAE los vehículos SIEMPRE, salvo que sea "recibo" (ahí vehiculos: []).
Devuelve UN OBJETO POR CADA vehículo, tal como aparezca en el documento:
- En "poliza"/"endoso": un objeto por bloque "DESCRIPCIÓN DEL VEHÍCULO ASEGURADO".
- En "listado" (tabla/Excel/CSV): un objeto por cada FILA de vehículo; ignora los
  encabezados, las filas de totales y las filas vacías. Usa las columnas de esa
  misma fila.
- En "otro" con un solo vehículo (tarjeta, factura, foto): un objeto con lo que
  traiga.
Un archivo puede tener decenas. Nunca combines campos de vehículos distintos:
cada objeto se llena únicamente con los datos de su propio bloque, fila o
documento (y el encabezado de página inmediato: PÓLIZA / ENDOSO / INCISO).

PASO 3 — Reglas de llenado:
- Si un campo no aparece literalmente, usa null. NUNCA infieras, deduzcas,
  completes ni copies de otro vehículo.
- Placas: si dice "TRAMITE", "EN TRAMITE" o está vacío, usa null y marca
  placas_en_tramite. Si el valor coincide con el No. económico (ej. "ECO 302"),
  es un error de captura de la aseguradora: placas = null.
- Serie/VIN: exactamente 17 caracteres alfanuméricos. Si lees menos o más,
  devuelve null y agrega una nota. No "corrijas" caracteres.
- Sumas: captura por separado daños_materiales, robo_total, rc_terceros y
  la suma de adaptación/conversión. No las sumes ni promedies. Valores
  numéricos sin símbolo ni comas. "Amparado"/"Amparada" → string "AMPARADO".
- Copia descripcion_vehiculo textual, incluyendo la clave AMIS inicial si viene.

PASO 4 — Evidencia. Para serie, placas, no_economico y daños_materiales
incluye en "evidencia" el fragmento literal (máx. 80 caracteres) del que
tomaste el dato.

PASO 5 — Conflictos. Si el mismo campo aparece con dos valores distintos
dentro del documento, NO elijas: reporta ambos en "conflictos" y deja el
campo con el valor del bloque del inciso.

También extrae, cuando aparezca, el RFC del contratante/asegurado en "rfc"
(persona moral: 12 caracteres; persona física: 13). No lo inventes ni lo
confundas con folios o números de póliza. Si no aparece, null.

Esquema de salida:
{
  "tipo_documento": "poliza|recibo|endoso|otro",
  "aseguradora": string|null,
  "asegurado": string|null,
  "rfc": string|null,
  "no_poliza": string|null,
  "vigencia_inicio": "YYYY-MM-DD"|null,
  "vigencia_fin": "YYYY-MM-DD"|null,
  "vehiculos": [{
    "inciso": string|null,
    "endoso": string|null,
    "movimiento": string|null,
    "descripcion_vehiculo": string|null,
    "tipo": string|null,
    "modelo": integer|null,
    "no_economico": string|null,
    "serie": string|null,
    "motor": string|null,
    "placas": string|null,
    "placas_en_tramite": boolean,
    "cobertura": string|null,
    "tipo_carga": string|null,
    "uso": string|null,
    "servicio": string|null,
    "doble_remolque": boolean|null,
    "daños_materiales": number|"AMPARADO"|null,
    "robo_total": number|"AMPARADO"|null,
    "rc_terceros": number|"AMPARADO"|null,
    "adaptacion_descripcion": string|null,
    "adaptacion_suma": number|null,
    "evidencia": {"serie": string|null, "placas": string|null,
                  "no_economico": string|null, "daños_materiales": string|null}
  }],
  "conflictos": [{"campo": string, "valores": [string], "nota": string}],
  "notas": [string]
}`;

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
   * Extrae de un documento (Excel, PDF o imagen) siguiendo el proceso de
   * clasificación + un objeto por bloque de vehículo. Devuelve JSON libre (no
   * salida estructurada) para admitir el esquema completo con uniones y nulos.
   * Se usa streaming por si la póliza trae decenas de incisos.
   */
  async extraerUnidades(
    contenido: Buffer,
    mime: string,
    nombreArchivo: string,
  ): Promise<ResultadoExtraccion> {
    const bloque = this.construirBloqueDocumento(contenido, mime, nombreArchivo);
    // Pista fuerte: un Excel/CSV es casi siempre el listado de flota (filas de
    // unidades), no una carátula de póliza. Evita que se clasifique como "otro".
    const esTabla =
      this.esExcel(mime, nombreArchivo) || mime.includes('csv') || /\.csv$/i.test(nombreArchivo);
    const pista = esTabla
      ? ' Es una hoja de cálculo con la flota en filas: clasifícalo como "listado" y extrae UNA unidad por fila (ignora encabezados, totales y filas vacías). En un listado NO incluyas "evidencia": deja cada campo de evidencia en null para que la respuesta sea compacta.'
      : '';

    const stream = this.client.messages.stream({
      model: this.modelo,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      system: SISTEMA_EXTRACCION,
      messages: [
        {
          role: 'user',
          content: [
            bloque,
            {
              type: 'text',
              text: `Clasifica este documento (${nombreArchivo}) y extrae los datos según las reglas.${pista} Devuelve solo el JSON.`,
            },
          ],
        },
      ],
    });
    const respuesta = await stream.finalMessage();

    const crudo = this.parsearExtraccion(respuesta);
    const tipoDocumento = crudo.tipo_documento ?? 'otro';

    // Un recibo nunca genera unidades, aunque describa un vehículo.
    const vehiculos = tipoDocumento === 'recibo' ? [] : crudo.vehiculos ?? [];
    const unidades = vehiculos.map((v) => this.aUnidad(v, crudo.asegurado));

    // Notas: las del modelo + los conflictos, en texto legible para la revisión.
    const notas: string[] = Array.isArray(crudo.notas)
      ? crudo.notas.filter((n): n is string => typeof n === 'string')
      : [];
    if (tipoDocumento === 'recibo') {
      notas.unshift('Documento clasificado como recibo de pago: no genera unidades.');
    }
    for (const c of crudo.conflictos ?? []) {
      notas.push(
        `Conflicto en ${c.campo}: ${(c.valores ?? []).join(' vs ')}${c.nota ? ` — ${c.nota}` : ''}`,
      );
    }

    return {
      unidades,
      cliente: { rfc: crudo.rfc ?? '', razonSocial: crudo.asegurado ?? '' },
      notas: notas.join('\n'),
      tipoDocumento,
      crudo,
      modeloUsado: this.modelo,
    };
  }

  /** Mapea un vehículo del esquema de póliza a la unidad interna del sistema. */
  private aUnidad(v: VehiculoCrudo, asegurado: string | null): UnidadExtraida {
    const num = (x: unknown): number | null => (typeof x === 'number' ? x : null);
    return {
      // La flota la resuelve el servicio (nombre del archivo) si no hay otra pista.
      flotaNombre: '',
      folio: v.inciso ?? '',
      aseguradoNombre: asegurado ?? '',
      tipo: this.normalizarTipo(v.tipo),
      marca: '', // el layout nuevo lo trae dentro de descripcion_vehiculo
      descripcion: v.descripcion_vehiculo ?? '',
      anio: num(v.modelo),
      vin: v.serie ?? '',
      numeroEconomico: v.no_economico ?? '',
      // La suma asegurada de la unidad es la de daños materiales; robo/RC se
      // guardan aparte en el JSON crudo (nunca se suman ni promedian).
      valorAsegurado: num(v.daños_materiales),
      placas: v.placas ?? '',
      numeroMotor: v.motor ?? '',
      tipoCobertura: v.cobertura ?? '',
      tipoCarga: v.tipo_carga ?? '',
      tipoAdaptacion: v.adaptacion_descripcion ?? '',
      coberturaAdaptacion: '',
      sumaAseguradaAdaptacion: num(v.adaptacion_suma),
      usoUnidad: [v.uso, v.servicio].filter(Boolean).join(' · ') || '',
      dobleRemolque: v.doble_remolque === true,
      confianza: {},
    };
  }

  /** Normaliza el tipo libre del documento a uno de los del sistema. */
  private normalizarTipo(t?: string | null): 'camion' | 'tractocamion' | 'remolque' | 'otro' {
    const s = (t ?? '').toLowerCase();
    if (/tracto/.test(s)) return 'tractocamion';
    if (/remolque|caja|plataforma|tanque|tolva|dolly|semi|g[oó]ndola/.test(s)) return 'remolque';
    if (/cami[oó]n|torton|rab[oó]n|chasis|pick|camioneta|veh[ií]culo/.test(s)) return 'camion';
    return 'otro';
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

  /** Extrae el JSON del primer bloque de texto de la respuesta (tolera fences). */
  private parsearJson<T>(respuesta: Anthropic.Message): T {
    const bloque = respuesta.content.find((b) => b.type === 'text');
    if (!bloque || bloque.type !== 'text') {
      this.logger.error(`Respuesta sin texto (stop_reason: ${respuesta.stop_reason})`);
      throw new Error('El modelo no devolvió datos estructurados');
    }
    return JSON.parse(this.limpiarJson(bloque.text)) as T;
  }

  /**
   * Parsea la extracción del modelo tolerando respuestas recortadas. Si el JSON
   * llegó completo, se parsea normal; si se truncó (listados enormes que se
   * pasan del límite), se recuperan las unidades completas en vez de perder todo.
   */
  private parsearExtraccion(respuesta: Anthropic.Message): ExtraccionCruda {
    const bloque = respuesta.content.find((b) => b.type === 'text');
    if (!bloque || bloque.type !== 'text') {
      this.logger.error(`Respuesta sin texto (stop_reason: ${respuesta.stop_reason})`);
      throw new Error('El modelo no devolvió datos');
    }
    try {
      return JSON.parse(this.limpiarJson(bloque.text)) as ExtraccionCruda;
    } catch (e) {
      this.logger.warn(
        `JSON de extracción inválido (${(e as Error).message}); intentando recuperar unidades`,
      );
      return this.recuperarExtraccion(bloque.text);
    }
  }

  /** Rescata la cabecera y los objetos COMPLETOS del arreglo "vehiculos" de un JSON truncado. */
  private recuperarExtraccion(texto: string): ExtraccionCruda {
    const t = texto.trim();
    const marca = t.search(/"vehiculos"\s*:\s*\[/);
    if (marca < 0) throw new Error('El modelo no devolvió un JSON reconocible');

    let cab: Partial<ExtraccionCruda> = {};
    try {
      cab = JSON.parse(t.slice(0, marca) + '"vehiculos":[]}') as Partial<ExtraccionCruda>;
    } catch {
      /* sin cabecera: seguimos solo con las unidades */
    }

    const vehiculos: VehiculoCrudo[] = [];
    for (const obj of this.objetosDeArreglo(t, t.indexOf('[', marca))) {
      try {
        vehiculos.push(JSON.parse(obj) as VehiculoCrudo);
      } catch {
        /* objeto incompleto (el corte): se descarta */
      }
    }

    const notas = Array.isArray(cab.notas) ? [...cab.notas] : [];
    notas.push(
      `La respuesta de la IA se recortó por tamaño; se recuperaron ${vehiculos.length} unidad(es). Si faltan, divide el archivo en partes o vuelve a extraer.`,
    );
    return {
      tipo_documento: cab.tipo_documento ?? 'listado',
      aseguradora: cab.aseguradora ?? null,
      asegurado: cab.asegurado ?? null,
      rfc: cab.rfc ?? null,
      no_poliza: cab.no_poliza ?? null,
      vigencia_inicio: cab.vigencia_inicio ?? null,
      vigencia_fin: cab.vigencia_fin ?? null,
      vehiculos,
      conflictos: cab.conflictos ?? [],
      notas,
    };
  }

  /** Devuelve los objetos JSON completos ({...}) de nivel superior dentro de un arreglo. */
  private objetosDeArreglo(texto: string, inicioCorchete: number): string[] {
    const objetos: string[] = [];
    if (inicioCorchete < 0) return objetos;
    let depth = 0;
    let start = -1;
    let inStr = false;
    let esc = false;
    for (let i = inicioCorchete + 1; i < texto.length; i++) {
      const ch = texto[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          objetos.push(texto.slice(start, i + 1));
          start = -1;
        }
      } else if (ch === ']' && depth === 0) {
        break; // fin del arreglo
      }
    }
    return objetos;
  }

  /** Quita ```json ... ``` y cualquier texto alrededor, dejando solo el objeto JSON. */
  private limpiarJson(texto: string): string {
    let t = texto.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const ini = t.indexOf('{');
    const fin = t.lastIndexOf('}');
    if (ini >= 0 && fin > ini) t = t.slice(ini, fin + 1);
    return t;
  }
}
