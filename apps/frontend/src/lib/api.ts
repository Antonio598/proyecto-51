// Cliente de API sencillo hacia el backend NestJS.
// Guarda el token JWT en localStorage y lo adjunta en cada petición.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const TOKEN_KEY = 'crm_token';
const USER_KEY = 'crm_user';

export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

export function guardarSesion(token: string, user: UsuarioSesion) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function cerrarSesion() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsuario(): UsuarioSesion | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as UsuarioSesion) : null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    let mensaje = `Error ${res.status}`;
    try {
      const body = await res.json();
      mensaje = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? mensaje;
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(mensaje);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Subida de archivos (multipart). No fija Content-Type: el navegador debe
 * generar el boundary por su cuenta.
 */
async function upload<T>(path: string, archivo: File, campos: Record<string, string> = {}) {
  const token = getToken();
  const datos = new FormData();
  datos.append('archivo', archivo);
  for (const [clave, valor] of Object.entries(campos)) datos.append(clave, valor);

  const res = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: datos,
  });
  if (!res.ok) {
    let mensaje = `Error ${res.status}`;
    try {
      const body = await res.json();
      mensaje = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? mensaje;
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(mensaje);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: UsuarioSesion }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  listarClientes: (buscar?: string) =>
    request<any[]>(`/clientes${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''}`),
  obtenerCliente: (id: string) => request<any>(`/clientes/${id}`),
  crearCliente: (data: Record<string, unknown>) =>
    request<any>('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  actualizarCliente: (id: string, data: Record<string, unknown>) =>
    request<any>(`/clientes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  listarUnidades: (clienteId: string) => request<any[]>(`/clientes/${clienteId}/unidades`),
  crearUnidad: (clienteId: string, data: Record<string, unknown>) =>
    request<any>(`/clientes/${clienteId}/unidades`, { method: 'POST', body: JSON.stringify(data) }),
  historialAseguramiento: (clienteId: string) =>
    request<any[]>(`/clientes/${clienteId}/historial-aseguramiento`),
  auditoriaCliente: (clienteId: string) => request<any[]>(`/clientes/${clienteId}/auditoria`),

  // ── Documentos por procesar y extracción IA ──
  bandejaDocumentos: () => request<any[]>('/documentos/bandeja'),
  obtenerDocumento: (id: string) => request<any>(`/documentos/${id}`),
  enlaceDocumento: (id: string) => request<{ url: string }>(`/documentos/${id}/enlace`),
  extraerDocumento: (id: string) => request<any>(`/documentos/${id}/extraer`, { method: 'POST' }),
  revisionDocumento: (id: string) => request<any>(`/documentos/${id}/revision`),
  aprobarExtraccion: (id: string, data: { clienteId?: string; unidades: unknown[] }) =>
    request<any>(`/documentos/${id}/aprobar`, { method: 'POST', body: JSON.stringify(data) }),
  descartarDocumento: (id: string) =>
    request<any>(`/documentos/${id}/descartar`, { method: 'POST' }),

  // ── Aseguradoras ──
  listarAseguradoras: () => request<any[]>('/aseguradoras'),

  // ── Expedientes (Fase C) ──
  listarExpedientes: (estado?: string) =>
    request<any[]>(`/expedientes${estado ? `?estado=${estado}` : ''}`),
  obtenerExpediente: (id: string) => request<any>(`/expedientes/${id}`),
  crearExpediente: (data: Record<string, unknown>) =>
    request<any>('/expedientes', { method: 'POST', body: JSON.stringify(data) }),
  actualizarExpediente: (id: string, data: Record<string, unknown>) =>
    request<any>(`/expedientes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  capturarPropuesta: (id: string, data: Record<string, unknown>) =>
    request<any>(`/expedientes/${id}/propuestas`, { method: 'POST', body: JSON.stringify(data) }),
  generarComparativo: (id: string) =>
    request<any>(`/expedientes/${id}/comparativo`, { method: 'POST' }),
  cambiarEstadoExpediente: (id: string, estado: string) =>
    request<any>(`/expedientes/${id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ estado }),
    }),
  auditoriaExpediente: (id: string) => request<any[]>(`/expedientes/${id}/auditoria`),
  comentarExpediente: (id: string, contenido: string) =>
    request<any>(`/expedientes/${id}/comentarios`, {
      method: 'POST',
      body: JSON.stringify({ contenido }),
    }),
  generarPropuestaCliente: (id: string, aseguradoraId: string) =>
    request<any>(`/expedientes/${id}/propuesta-cliente`, {
      method: 'POST',
      body: JSON.stringify({ aseguradoraId }),
    }),
  enviarPropuestaCliente: (id: string) =>
    request<any>(`/expedientes/${id}/propuesta-cliente/enviar`, { method: 'POST' }),

  // ── Pólizas y emisión (Fase D) ──
  listarPolizas: (params: { estado?: string; clienteId?: string; expedienteId?: string } = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][],
    ).toString();
    return request<any[]>(`/polizas${q ? `?${q}` : ''}`);
  },
  obtenerPoliza: (id: string) => request<any>(`/polizas/${id}`),
  prepararEmision: (expedienteId: string, data: Record<string, unknown>) =>
    request<any>(`/polizas/expediente/${expedienteId}/emitir`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  checklistEmision: (expedienteId: string) =>
    request<any>(`/polizas/expediente/${expedienteId}/checklist`),
  marcarPolizaEmitida: (id: string, data: Record<string, unknown>) =>
    request<any>(`/polizas/${id}/emitida`, { method: 'POST', body: JSON.stringify(data) }),
  /** Sube el PDF de la póliza; devuelve la sugerencia de folio leída por Claude. */
  subirPdfPoliza: (id: string, archivo: File) =>
    upload<{ documentoId: string; sugerencia: { folio: string | null } }>(
      `/polizas/${id}/pdf`,
      archivo,
    ),

  // ── Facturas y complementos (módulo 11) ──
  listarFacturas: (polizaId: string) => request<any[]>(`/facturas?polizaId=${polizaId}`),
  subirFactura: (polizaId: string, archivo: File, tipo: 'factura' | 'complemento') =>
    upload<any>(`/facturas/poliza/${polizaId}`, archivo, { tipo }),
  enviarFactura: (id: string) => request<any>(`/facturas/${id}/enviar`, { method: 'POST' }),

  // ── Cobranza ──
  dashboardCobranza: () => request<any>('/cobranza/dashboard'),
  generarDesglose: (clienteId: string) =>
    request<any>(`/cobranza/desglose/${clienteId}`, { method: 'POST' }),
  enviarDesglose: (clienteId: string, documentoId: string) =>
    request<any>(`/cobranza/desglose/${clienteId}/enviar`, {
      method: 'POST',
      body: JSON.stringify({ documentoId }),
    }),

  // ── Pagos y conciliación ──
  comprobantesPendientes: () => request<any[]>('/pagos/comprobantes'),
  detalleComprobante: (documentoId: string) => request<any>(`/pagos/comprobantes/${documentoId}`),
  conciliarComprobante: (documentoId: string) =>
    request<any>(`/pagos/comprobantes/${documentoId}/conciliar`, { method: 'POST' }),
  pagosPendientes: () => request<any[]>('/pagos/pendientes'),
  checklistPago: (pagoId: string) => request<any>(`/pagos/${pagoId}/checklist`),
  registrarPago: (data: Record<string, unknown>) =>
    request<any>('/pagos', { method: 'POST', body: JSON.stringify(data) }),
  confirmarPagoAplicado: (id: string) =>
    request<any>(`/pagos/${id}/aplicado`, { method: 'POST' }),

  // ── Notificaciones ──
  listarNotificaciones: () => request<any[]>('/notificaciones'),
  conteoNotificaciones: () => request<{ noLeidas: number }>('/notificaciones/conteo'),
  marcarNotificacionLeida: (id: string) =>
    request<any>(`/notificaciones/${id}/leida`, { method: 'POST' }),
};
