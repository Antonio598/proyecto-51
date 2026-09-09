/**
 * Estructura canónica de coberturas y deducibles para flotas de transporte de carga.
 *
 * Que Técnico capture SIEMPRE estos mismos campos (y no texto libre) es lo que
 * permite generar el cuadro comparativo automáticamente, sin retrabajo. El modelo
 * incluye deducibles separados para camión/tracto y remolque (como en el layout
 * del despacho) y coberturas "amparadas" (asistencias, daños a la carga, etc.).
 */

export interface Coberturas {
  /** Responsabilidad civil por daños a terceros (límite único combinado). */
  responsabilidadCivil: number | null;
  /** Daños materiales a la unidad (suma asegurada). */
  danosMateriales: number | null;
  /** Robo total (suma asegurada). */
  roboTotal: number | null;
  /** Gastos médicos a ocupantes. */
  gastosMedicosOcupantes: number | null;
  /** Responsabilidad civil sobre la carga transportada. */
  responsabilidadCivilCarga: number | null;
  /** Accidentes al conductor (suma asegurada). */
  accidentesConductor: number | null;
  /** Asistencia vial plus incluida. */
  asistenciaVial: boolean;
  /** Daños a la carga amparados. */
  danosCarga: boolean;
  /** RC cruzada amparada. */
  rcCruzada: boolean;
  /** Asistencia legal amparada. */
  asistenciaLegal: boolean;
  /** (Legado) asistencia jurídica y vial; se conserva para datos antiguos. */
  asistenciaJuridica: boolean;
  /** Cualquier cobertura adicional que no encaje arriba. */
  extras: string | null;
}

/** Deducible separado por tipo de unidad (en porcentaje). */
export interface DeduciblePar {
  camion: number | null;
  remolque: number | null;
}

export interface Deducibles {
  /** Deducible de daños materiales. */
  danosMateriales: DeduciblePar;
  /** Deducible de robo total. */
  roboTotal: DeduciblePar;
  /** Reducción de deducible por asistencia/dispositivo. */
  reduccionAsistencia: DeduciblePar;
}

/** Etiquetas en español para los documentos generados. */
export const ETIQUETAS_COBERTURA: Record<keyof Coberturas, string> = {
  responsabilidadCivil: 'Responsabilidad civil (daños a terceros)',
  danosMateriales: 'Daños materiales',
  roboTotal: 'Robo total',
  gastosMedicosOcupantes: 'Gastos médicos ocupantes',
  responsabilidadCivilCarga: 'RC carga transportada',
  accidentesConductor: 'Accidentes al conductor',
  asistenciaVial: 'Asistencia vial plus',
  danosCarga: 'Daños a la carga',
  rcCruzada: 'RC cruzada',
  asistenciaLegal: 'Asistencia legal',
  asistenciaJuridica: 'Asistencia jurídica y vial',
  extras: 'Coberturas adicionales',
};

export const ETIQUETAS_DEDUCIBLE: Record<keyof Deducibles, string> = {
  danosMateriales: 'Deducible daños materiales',
  roboTotal: 'Deducible robo total',
  reduccionAsistencia: 'Reducción de deducible por asistencia',
};

/** Orden fijo de las filas del comparativo. */
export const ORDEN_COBERTURAS: (keyof Coberturas)[] = [
  'responsabilidadCivil',
  'danosMateriales',
  'roboTotal',
  'gastosMedicosOcupantes',
  'responsabilidadCivilCarga',
  'accidentesConductor',
  'asistenciaVial',
  'danosCarga',
  'rcCruzada',
  'asistenciaLegal',
  'extras',
];

/** Coberturas que se capturan/expresan como "amparada" (sí/no). */
export const COBERTURAS_BOOLEANAS: (keyof Coberturas)[] = [
  'asistenciaVial',
  'danosCarga',
  'rcCruzada',
  'asistenciaLegal',
  'asistenciaJuridica',
];

export const ORDEN_DEDUCIBLES: (keyof Deducibles)[] = [
  'danosMateriales',
  'roboTotal',
  'reduccionAsistencia',
];

export function formatearMoneda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return 'No aplica';
  return valor.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  });
}

/** Convierte el valor de una cobertura a texto legible para el comparativo. */
export function formatearCobertura(campo: keyof Coberturas, valor: unknown): string {
  if (COBERTURAS_BOOLEANAS.includes(campo)) return valor ? 'Amparada' : 'No incluida';
  if (campo === 'extras') return (valor as string) || '—';
  return formatearMoneda(valor as number | null);
}

/** Lee un deducible que puede venir como par {camión,remolque} o como número (legado). */
export function normalizarDeduciblePar(valor: unknown): DeduciblePar {
  if (valor && typeof valor === 'object') {
    const v = valor as Partial<DeduciblePar>;
    return { camion: v.camion ?? null, remolque: v.remolque ?? null };
  }
  const n = typeof valor === 'number' ? valor : null;
  return { camion: n, remolque: n };
}

function pct(v: number | null): string {
  return v === null || v === undefined ? '—' : `${v}%`;
}

/** Texto de un deducible camión/remolque para las tablas simples (PDF/propuesta). */
export function formatearDeducible(valor: unknown): string {
  const par = normalizarDeduciblePar(valor);
  if (par.camion === null && par.remolque === null) return 'No aplica';
  return `Camión ${pct(par.camion)} · Remolque ${pct(par.remolque)}`;
}

/** Porcentaje suelto (para las celdas separadas camión/remolque del Excel). */
export function formatearPorcentaje(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : `${valor}%`;
}
