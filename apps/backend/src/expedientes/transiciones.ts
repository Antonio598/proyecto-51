import { EstadoExpediente } from '@prisma/client';

/**
 * Transiciones permitidas del expediente. Cualquier otra se rechaza,
 * para que el flujo no se salte pasos.
 *
 * Se mantiene como función pura para poder probarla sin base de datos.
 */
export const TRANSICIONES: Record<EstadoExpediente, EstadoExpediente[]> = {
  en_captura: [EstadoExpediente.en_analisis_tecnico],
  en_analisis_tecnico: [EstadoExpediente.en_revision_comercial],
  en_revision_comercial: [EstadoExpediente.ajustado, EstadoExpediente.aprobado],
  // "ajustado" regresa a Técnico para corregir y volver a comparar.
  ajustado: [EstadoExpediente.en_analisis_tecnico, EstadoExpediente.aprobado],
  aprobado: [EstadoExpediente.enviado_a_cliente],
  enviado_a_cliente: [],
};

export function transicionesValidas(desde: EstadoExpediente): EstadoExpediente[] {
  return TRANSICIONES[desde] ?? [];
}

export function puedeTransicionar(desde: EstadoExpediente, hacia: EstadoExpediente): boolean {
  return transicionesValidas(desde).includes(hacia);
}
