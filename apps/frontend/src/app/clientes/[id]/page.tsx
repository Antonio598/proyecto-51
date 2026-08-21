'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getUsuario } from '@/lib/api';

const TIPOS = ['camion', 'tractocamion', 'remolque', 'otro'];

const ORIGEN: Record<string, string> = {
  whatsapp: 'WhatsApp',
  portal: 'Portal',
  manual_upload: 'Subido a mano',
};

type Fmt = 'texto' | 'moneda' | 'bool';

/** Campos que se muestran en cada unidad (todo lo que extrae la IA). */
const CAMPOS_UNIDAD: Array<{ key: string; label: string; fmt?: Fmt }> = [
  { key: 'folio', label: 'Folio' },
  { key: 'aseguradoNombre', label: 'Asegurado' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'anio', label: 'Año' },
  { key: 'vin', label: 'Serie / VIN' },
  { key: 'numeroEconomico', label: 'No. económico' },
  { key: 'placas', label: 'Placas' },
  { key: 'numeroMotor', label: 'No. de motor' },
  { key: 'tipoCobertura', label: 'Cobertura' },
  { key: 'tipoCarga', label: 'Tipo de carga' },
  { key: 'usoUnidad', label: 'Uso' },
  { key: 'dobleRemolque', label: 'Doble remolque', fmt: 'bool' },
  { key: 'valorAsegurado', label: 'Suma asegurada', fmt: 'moneda' },
  { key: 'tipoAdaptacion', label: 'Adaptación' },
  { key: 'coberturaAdaptacion', label: 'Cobertura adaptación' },
  { key: 'sumaAseguradaAdaptacion', label: 'Suma adaptación', fmt: 'moneda' },
];

function moneda(v: unknown) {
  if (v == null || v === '') return null;
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

/** Agrupa las unidades por el nombre de su flota; las sin flota van al final. */
function agruparPorFlota(unidades: any[]): Array<[string, any[]]> {
  const grupos = new Map<string, any[]>();
  for (const u of unidades) {
    const nombre = u.flota?.nombre ?? 'Sin flota asignada';
    if (!grupos.has(nombre)) grupos.set(nombre, []);
    grupos.get(nombre)!.push(u);
  }
  return Array.from(grupos.entries()).sort(([a], [b]) => {
    if (a === 'Sin flota asignada') return 1;
    if (b === 'Sin flota asignada') return -1;
    return a.localeCompare(b);
  });
}

function valorMostrable(u: Record<string, unknown>, campo: { key: string; fmt?: Fmt }) {
  const v = u[campo.key];
  if (campo.fmt === 'bool') return v ? 'Sí' : null; // solo mostramos si aplica
  if (campo.fmt === 'moneda') return moneda(v);
  return v != null && v !== '' ? String(v) : null;
}

/** Valor SIEMPRE mostrable: devuelve "—" cuando el dato no existe (nunca se oculta). */
function valorTexto(u: Record<string, unknown>, campo: { key: string; fmt?: Fmt }) {
  const v = u[campo.key];
  if (campo.fmt === 'bool') return v ? 'Sí' : 'No';
  if (campo.fmt === 'moneda') return moneda(v) ?? '—';
  return v != null && v !== '' ? String(v) : '—';
}

/** Lista completa de campos para la vista de tabla (todos, aunque estén vacíos). */
const CAMPOS_TABLA: Array<{ key: string; label: string; fmt?: Fmt }> = [
  { key: 'tipo', label: 'Tipo' },
  { key: 'marca', label: 'Marca' },
  { key: 'modelo', label: 'Modelo' },
  ...CAMPOS_UNIDAD,
];

export default function ClienteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const puedeEliminar = ['administracion', 'admin'].includes(
    (typeof window !== 'undefined' ? getUsuario()?.rol : '') ?? '',
  );
  const [cliente, setCliente] = useState<any>(null);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [docAbierto, setDocAbierto] = useState<string | null>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [auditoria, setAuditoria] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [desglose, setDesglose] = useState<any>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [vista, setVista] = useState<'tarjetas' | 'tabla'>('tarjetas');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [nuevaFlota, setNuevaFlota] = useState('');
  const [flotaDestino, setFlotaDestino] = useState('');
  const [flotasAbiertas, setFlotasAbiertas] = useState<Set<string>>(new Set());
  const [avisoFlota, setAvisoFlota] = useState('');
  const [exportando, setExportando] = useState(false);
  const [nuevaUnidad, setNuevaUnidad] = useState({
    tipo: 'tractocamion',
    vin: '',
    anio: '',
    marca: '',
    modelo: '',
    tipoCarga: '',
    valorAsegurado: '',
  });

  async function cargar() {
    try {
      const [c, u, d, h, a] = await Promise.all([
        api.obtenerCliente(id),
        api.listarUnidades(id),
        api.documentosCliente(id).catch(() => []),
        api.historialAseguramiento(id),
        api.auditoriaCliente(id),
      ]);
      setCliente(c);
      setUnidades(u);
      setDocumentos(d);
      setHistorial(h);
      setAuditoria(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function agregarUnidad(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.crearUnidad(id, {
        tipo: nuevaUnidad.tipo,
        vin: nuevaUnidad.vin || undefined,
        anio: nuevaUnidad.anio ? Number(nuevaUnidad.anio) : undefined,
        marca: nuevaUnidad.marca || undefined,
        modelo: nuevaUnidad.modelo || undefined,
        tipoCarga: nuevaUnidad.tipoCarga || undefined,
        valorAsegurado: nuevaUnidad.valorAsegurado ? Number(nuevaUnidad.valorAsegurado) : undefined,
      });
      setNuevaUnidad({
        tipo: 'tractocamion',
        vin: '',
        anio: '',
        marca: '',
        modelo: '',
        tipoCarga: '',
        valorAsegurado: '',
      });
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear unidad');
    }
  }

  async function eliminarCliente() {
    if (!confirm(`¿Eliminar el cliente "${cliente.razonSocial}" y toda su información? Esta acción no se puede deshacer.`)) {
      return;
    }
    setError('');
    try {
      await api.eliminarCliente(id);
      router.push('/clientes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el cliente');
    }
  }

  async function abrirArchivo(docId: string, indice: number) {
    try {
      const { url } = await api.enlaceArchivoDocumento(docId, indice);
      window.open(url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el archivo');
    }
  }

  async function eliminarUnidad(unidadId: string) {
    if (!confirm('¿Eliminar esta unidad? Esta acción no se puede deshacer.')) return;
    setError('');
    try {
      await api.eliminarUnidad(unidadId);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la unidad');
    }
  }

  async function eliminarFlota(flotaId: string, nombre: string) {
    if (!confirm(`¿Eliminar la flota "${nombre}"? Sus unidades no se borran, quedan sin flota asignada.`)) {
      return;
    }
    setError('');
    try {
      await api.eliminarFlota(flotaId);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la flota');
    }
  }

  function toggleFlota(nombre: string) {
    setFlotasAbiertas((prev) => {
      const n = new Set(prev);
      if (n.has(nombre)) n.delete(nombre);
      else n.add(nombre);
      return n;
    });
  }

  function toggleUnidad(unidadId: string) {
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(unidadId)) n.delete(unidadId);
      else n.add(unidadId);
      return n;
    });
  }

  async function crearFlotaCliente() {
    if (!nuevaFlota.trim()) return;
    setAvisoFlota('');
    try {
      await api.crearFlota(id, nuevaFlota.trim());
      setNuevaFlota('');
      await cargar();
      setAvisoFlota('Flota creada.');
    } catch (err) {
      setAvisoFlota(err instanceof Error ? err.message : 'No se pudo crear la flota');
    }
  }

  async function moverSeleccion() {
    if (seleccion.size === 0) return;
    setAvisoFlota('');
    try {
      const flotaId = flotaDestino === '__none__' || flotaDestino === '' ? null : flotaDestino;
      await api.moverUnidades(id, flotaId, [...seleccion]);
      setSeleccion(new Set());
      await cargar();
      setAvisoFlota('Unidades movidas.');
    } catch (err) {
      setAvisoFlota(err instanceof Error ? err.message : 'No se pudieron mover las unidades');
    }
  }

  async function exportarUnidades() {
    setExportando(true);
    setAvisoFlota('');
    try {
      await api.exportarClienteExcel(id);
    } catch (err) {
      setAvisoFlota(err instanceof Error ? err.message : 'No se pudo exportar');
    } finally {
      setExportando(false);
    }
  }

  if (error) return <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</div>;
  if (!cliente) return <div className="text-slate-400">Cargando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clientes" className="text-sm text-marca hover:underline">
          ← Clientes
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-800">{cliente.razonSocial}</h1>
          {!cliente.activo && (
            <span className="badge bg-red-100 text-red-600">Inactivo</span>
          )}
          {puedeEliminar && (
            <button
              onClick={eliminarCliente}
              className="ml-auto rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Eliminar cliente
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {cliente.rfc ?? 'Sin RFC'} · WhatsApp: {cliente.whatsappNumber ?? '—'}
          {cliente.contactoEmail ? ` · ${cliente.contactoEmail}` : ''}
        </p>
      </div>

      {/* Flota */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-800">Flota ({unidades.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
              <button
                onClick={() => setVista('tarjetas')}
                className={`px-3 py-1.5 ${vista === 'tarjetas' ? 'bg-marca text-white' : 'bg-white text-slate-600'}`}
              >
                Tarjetas
              </button>
              <button
                onClick={() => setVista('tabla')}
                className={`px-3 py-1.5 ${vista === 'tabla' ? 'bg-marca text-white' : 'bg-white text-slate-600'}`}
              >
                Tabla
              </button>
            </div>
            <button onClick={exportarUnidades} disabled={exportando} className="btn-ghost py-1.5">
              {exportando ? 'Generando…' : 'Descargar Excel'}
            </button>
            <button onClick={() => setMostrarForm((v) => !v)} className="btn-ghost py-1.5">
              {mostrarForm ? 'Cancelar' : '+ Agregar unidad'}
            </button>
          </div>
        </div>

        {/* Gestión de flotas: crear flota y traspasar unidades seleccionadas */}
        {unidades.length > 0 && (
          <div className="space-y-2 rounded-2xl bg-white p-4 text-sm shadow-tarjeta">
            {avisoFlota && (
              <div className="rounded bg-slate-50 px-3 py-1.5 text-slate-700">{avisoFlota}</div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600">Crear flota:</span>
              <input
                value={nuevaFlota}
                onChange={(e) => setNuevaFlota(e.target.value)}
                placeholder="Nombre de la flota"
                className="input w-48"
              />
              <button onClick={crearFlotaCliente} disabled={!nuevaFlota.trim()} className="btn-primary py-1.5">
                Crear
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
              <span className="text-slate-600">
                Mover {seleccion.size} seleccionada(s) a:
              </span>
              <select
                value={flotaDestino}
                onChange={(e) => setFlotaDestino(e.target.value)}
                className="input w-48"
              >
                <option value="">— elige flota —</option>
                {(cliente.flotas ?? []).map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
                <option value="__none__">Sin flota</option>
              </select>
              <button
                onClick={moverSeleccion}
                disabled={seleccion.size === 0 || flotaDestino === ''}
                className="btn-primary py-1.5"
              >
                Mover
              </button>
              {seleccion.size > 0 && (
                <button onClick={() => setSeleccion(new Set())} className="btn-ghost py-1.5">
                  Limpiar selección
                </button>
              )}
            </div>
          </div>
        )}

        {mostrarForm && (
          <form onSubmit={agregarUnidad} className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow-tarjeta">
            <select
              value={nuevaUnidad.tipo}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, tipo: e.target.value })}
              className="input w-40 capitalize"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              placeholder="VIN"
              value={nuevaUnidad.vin}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, vin: e.target.value })}
              className="input w-44"
            />
            <input
              placeholder="Año"
              value={nuevaUnidad.anio}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, anio: e.target.value })}
              className="input w-24"
            />
            <input
              placeholder="Marca"
              value={nuevaUnidad.marca}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, marca: e.target.value })}
              className="input w-32"
            />
            <input
              placeholder="Modelo"
              value={nuevaUnidad.modelo}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, modelo: e.target.value })}
              className="input w-32"
            />
            <input
              placeholder="Tipo de carga"
              value={nuevaUnidad.tipoCarga}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, tipoCarga: e.target.value })}
              className="input w-40"
            />
            <input
              placeholder="Valor asegurado"
              value={nuevaUnidad.valorAsegurado}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, valorAsegurado: e.target.value })}
              className="input w-40"
            />
            <button className="btn-primary">Guardar</button>
          </form>
        )}

        {unidades.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 shadow-tarjeta">
            Sin unidades registradas. Los documentos aprobados desde la bandeja agregan unidades
            (y sus flotas) aquí automáticamente.
          </div>
        ) : vista === 'tabla' ? (
          <div className="space-y-5">
            {agruparPorFlota(unidades).map(([flota, delGrupo]) => {
              const flotaId = delGrupo[0]?.flota?.id as string | undefined;
              return (
                <div key={flota}>
                  <div className="mb-2 flex items-center gap-2">
                    <button
                      onClick={() => toggleFlota(flota)}
                      className="flex items-center gap-2 text-sm font-semibold text-slate-700"
                    >
                      <span className="text-slate-400">
                        {flotasAbiertas.has(flota) ? '▾' : '▸'}
                      </span>
                      {flota}
                      <span className="badge bg-marca-suave text-marca">{delGrupo.length}</span>
                    </button>
                    {puedeEliminar && flotaId && (
                      <button
                        onClick={() => eliminarFlota(flotaId, flota)}
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        Eliminar flota
                      </button>
                    )}
                  </div>
                  {flotasAbiertas.has(flota) && (
                  <div className="overflow-x-auto rounded-2xl bg-white shadow-tarjeta">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                        <tr>
                          <th className="px-3 py-2"></th>
                          {CAMPOS_TABLA.map((c) => (
                            <th key={c.key} className="whitespace-nowrap px-3 py-2">
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {delGrupo.map((u) => (
                          <tr key={u.id}>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={seleccion.has(u.id)}
                                onChange={() => toggleUnidad(u.id)}
                              />
                            </td>
                            {CAMPOS_TABLA.map((c) => (
                              <td key={c.key} className="whitespace-nowrap px-3 py-2">
                                {valorTexto(u, c)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-5">
            {agruparPorFlota(unidades).map(([flota, delGrupo]) => {
              const flotaId = delGrupo[0]?.flota?.id as string | undefined;
              return (
              <div key={flota}>
                <div className="mb-2 flex items-center gap-2">
                  <button
                    onClick={() => toggleFlota(flota)}
                    className="flex items-center gap-2 text-sm font-semibold text-slate-700"
                  >
                    <span className="text-slate-400">
                      {flotasAbiertas.has(flota) ? '▾' : '▸'}
                    </span>
                    {flota}
                    <span className="badge bg-marca-suave text-marca">{delGrupo.length}</span>
                  </button>
                  {puedeEliminar && flotaId && (
                    <button
                      onClick={() => eliminarFlota(flotaId, flota)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      Eliminar flota
                    </button>
                  )}
                </div>
                {flotasAbiertas.has(flota) && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {delGrupo.map((u, i) => {
                    const titulo =
                      [u.marca, u.modelo].filter(Boolean).join(' ') ||
                      u.descripcion ||
                      (u.folio ? `Unidad ${u.folio}` : `Unidad ${i + 1}`);
                    const campos = CAMPOS_UNIDAD.map((c) => ({
                      label: c.label,
                      valor: valorTexto(u, c),
                    }));
                    return (
                      <div key={u.id} className="rounded-2xl bg-white p-4 shadow-tarjeta">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={seleccion.has(u.id)}
                                onChange={() => toggleUnidad(u.id)}
                              />
                              <span className="truncate font-medium text-slate-800">{titulo}</span>
                            </label>
                            {u.valorAsegurado && (
                              <div className="text-sm text-marca">{moneda(u.valorAsegurado)}</div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="badge bg-marca-suave capitalize text-marca">
                              {u.tipo}
                            </span>
                            {puedeEliminar && (
                              <button
                                onClick={() => eliminarUnidad(u.id)}
                                className="text-xs text-slate-400 hover:text-red-600"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                          {campos.map((c) => (
                            <div key={c.label} className="min-w-0">
                              <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                                {c.label}
                              </dt>
                              <dd className="truncate text-sm text-slate-700" title={c.valor ?? ''}>
                                {c.valor}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Documentos recibidos (archivos originales vinculados al cliente) */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-800">
          Documentos recibidos ({documentos.length})
        </h2>
        {documentos.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay documentos vinculados a este cliente.</p>
        ) : (
          <div className="space-y-2">
            {documentos.map((d) => (
              <div key={d.id} className="rounded-2xl bg-white p-4 shadow-tarjeta">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-700">
                      {d.nombreOriginal ?? 'Documento'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {ORIGEN[d.origen] ?? d.origen} ·{' '}
                      {new Date(d.createdAt).toLocaleDateString('es-MX')} · {d.totalArchivos}{' '}
                      archivo(s) · {d.procesado ? 'procesado' : 'pendiente'}
                    </div>
                  </div>
                  {d.totalArchivos > 0 && (
                    <button
                      onClick={() => setDocAbierto(docAbierto === d.id ? null : d.id)}
                      className="shrink-0 text-sm text-marca hover:underline"
                    >
                      {docAbierto === d.id ? 'Ocultar archivos' : 'Ver archivos'}
                    </button>
                  )}
                </div>
                {docAbierto === d.id && (
                  <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                    {d.archivos.map((a: any) => (
                      <li key={a.indice} className="flex items-center gap-2">
                        <span className="text-marca">•</span>
                        <button
                          onClick={() => abrirArchivo(d.id, a.indice)}
                          className="truncate text-left text-sm text-marca hover:underline"
                          title={a.nombre}
                        >
                          {a.nombre}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Desglose de costos — módulo 8 */}
      <section className="space-y-3 rounded-2xl bg-white p-5 shadow-tarjeta">
        <h2 className="text-lg font-semibold text-slate-800">Desglose de costos</h2>
        <p className="text-sm text-slate-500">
          Excel por unidad con el costo de cada póliza y el pago mensual. Al enviarlo queda como
          documento base de cobranza del periodo.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={async () => {
              setError('');
              try {
                const res = await api.generarDesglose(id);
                setDesglose(res);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Error al generar');
              }
            }}
            className="btn-primary"
          >
            Generar desglose
          </button>
          {desglose && (
            <>
              <span className="text-sm text-slate-600">
                {desglose.unidades} unidad(es) · mensual{' '}
                {Number(desglose.totalMensual).toLocaleString('es-MX', {
                  style: 'currency',
                  currency: 'MXN',
                })}
              </span>
              <button
                onClick={async () => {
                  setError('');
                  try {
                    await api.enviarDesglose(id, desglose.documento.id);
                    setDesglose(null);
                    alert('Desglose y pólizas enviados por correo.');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Error al enviar');
                  }
                }}
                className="btn-success"
              >
                Enviar por correo
              </button>
            </>
          )}
        </div>
      </section>

      {/* Historial de aseguramiento */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-800">Historial de aseguramiento</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay pólizas registradas.</p>
        ) : (
          <ul className="space-y-2">
            {historial.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 text-sm shadow-tarjeta"
              >
                <span className="text-slate-700">
                  {[p.unidad?.marca, p.unidad?.modelo].filter(Boolean).join(' ') || 'Unidad'} ·{' '}
                  {p.aseguradora?.nombre}
                </span>
                <span className="text-slate-400">
                  {p.vigenciaInicio
                    ? new Date(p.vigenciaInicio).toLocaleDateString('es-MX')
                    : 's/f'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Auditoría */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-800">Auditoría</h2>
        <ul className="space-y-1 text-xs text-slate-500">
          {auditoria.map((a) => (
            <li key={a.id}>
              {new Date(a.timestamp).toLocaleString('es-MX')} · {a.accion} ·{' '}
              {a.actor?.nombre ?? 'sistema'}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
