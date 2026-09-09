/** Normaliza un VIN/serie para comparar: mayúsculas, sin espacios ni guiones. */
export function normalizarSerie(s: string | null | undefined): string {
  return (s ?? '').replace(/[\s-]/g, '').toUpperCase();
}
