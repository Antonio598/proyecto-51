/**
 * Normaliza un RFC para usarlo como llave del cliente: mayúsculas, sin espacios.
 * Devuelve null si queda vacío, para que Postgres admita varios clientes sin RFC.
 */
export function normalizarRfc(rfc?: string | null): string | null {
  if (!rfc) return null;
  const limpio = rfc.replace(/\s+/g, '').toUpperCase();
  return limpio.length > 0 ? limpio : null;
}
