/**
 * Estructura canónica de coberturas y deducibles para flotas de transporte de carga.
 *
 * Que Técnico capture SIEMPRE estos mismos campos (y no texto libre) es lo que
 * permite generar el cuadro comparativo automáticamente, sin retrabajo.
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
  /** Asistencia jurídica y vial incluida. */
  asistenciaJuridica: boolean;
  /** Cualquier cobertura adicional que no encaje arriba. */
  extras: string | null;
}

export interface Deducibles {
  /** Deducible de daños materiales, en porcentaje. */
  danosMateriales: number | null;
  /** Deducible de robo total, en porcentaje. */
  roboTotal: number | null;
}

/** Etiquetas en español para los documentos generados. */
export const ETIQUETAS_COBERTURA: Record<keyof Coberturas, string> = {
  responsabilidadCivil: 'Responsabilidad civil (daños a terceros)',
  danosMateriales: 'Daños materiales',
  roboTotal: 'Robo total',
  gastosMedicosOcupantes: 'Gastos médicos ocupantes',
  responsabilidadCivilCarga: 'RC carga transportada',
  asistenciaJuridica: 'Asistencia jurídica y vial',
  extras: 'Coberturas adicionales',
};

export const ETIQUETAS_DEDUCIBLE: Record<keyof Deducibles, string> = {
  danosMateriales: 'Deducible daños materiales',
  roboTotal: 'Deducible robo total',
};

/** Orden fijo de las filas del comparativo. */
export const ORDEN_COBERTURAS: (keyof Coberturas)[] = [
  'responsabilidadCivil',
  'danosMateriales',
  'roboTotal',
  'gastosMedicosOcupantes',
  'responsabilidadCivilCarga',
  'asistenciaJuridica',
  'extras',
];

export const ORDEN_DEDUCIBLES: (keyof Deducibles)[] = ['danosMateriales', 'roboTotal'];

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
  if (campo === 'asistenciaJuridica') return valor ? 'Incluida' : 'No incluida';
  if (campo === 'extras') return (valor as string) || '—';
  return formatearMoneda(valor as number | null);
}

export function formatearDeducible(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return 'No aplica';
  return `${valor}%`;
}
