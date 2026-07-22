/** Etiquetas y colores de los estados del expediente, compartidos por las pantallas. */
export const ESTADOS: Record<string, { label: string; clase: string }> = {
  en_captura: { label: 'En captura', clase: 'bg-slate-100 text-slate-700' },
  en_analisis_tecnico: { label: 'En análisis técnico', clase: 'bg-blue-100 text-blue-800' },
  en_revision_comercial: { label: 'En revisión comercial', clase: 'bg-purple-100 text-purple-800' },
  ajustado: { label: 'Ajustado', clase: 'bg-amber-100 text-amber-800' },
  aprobado: { label: 'Aprobado', clase: 'bg-green-100 text-green-800' },
  enviado_a_cliente: { label: 'Enviado al cliente', clase: 'bg-emerald-100 text-emerald-800' },
};

export function estadoLabel(estado: string) {
  return ESTADOS[estado]?.label ?? estado;
}

export function estadoClase(estado: string) {
  return ESTADOS[estado]?.clase ?? 'bg-slate-100 text-slate-700';
}
