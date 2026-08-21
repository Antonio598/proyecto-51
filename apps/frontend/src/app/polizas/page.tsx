'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const ESTADO_POLIZA: Record<string, { label: string; clase: string }> = {
  pendiente_emision: { label: 'Pendiente de emitir', clase: 'bg-amber-100 text-amber-800' },
  emitida: { label: 'Emitida', clase: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', clase: 'bg-red-100 text-red-800' },
};

function mxn(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

/** Agrupa las pólizas por el nombre de la flota de su unidad. */
function agruparPolizasPorFlota(polizas: any[]): Array<[string, any[]]> {
  const grupos = new Map<string, any[]>();
  for (const p of polizas) {
    const nombre = p.unidad?.flota?.nombre ?? 'Sin flota asignada';
    if (!grupos.has(nombre)) grupos.set(nombre, []);
    grupos.get(nombre)!.push(p);
  }
  return Array.from(grupos.entries()).sort(([a], [b]) => {
    if (a === 'Sin flota asignada') return 1;
    if (b === 'Sin flota asignada') return -1;
    return a.localeCompare(b);
  });
}

export default function PolizasPage() {
  const params = useSearchParams();
  const expedienteId = params.get('expediente') ?? undefined;

  const [clientes, setClientes] = useState<any[]>([]);
  const [buscarCliente, setBuscarCliente] = useState('');
  const [clienteSel, setClienteSel] = useState<any>(null);
  const [polizas, setPolizas] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any>(null);
  const [emitiendo, setEmitiendo] = useState<string | null>(null);
  const [serieEmision, setSerieEmision] = useState('');
  const [serie, setSerie] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargarClientes = useCallback(async () => {
    try {
      setClientes(await api.listarClientes(buscarCliente || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }, [buscarCliente]);

  const cargarPolizas = useCallback(
    async (clienteId?: string, serieBusqueda: string = serie) => {
      try {
        setPolizas(
          await api.listarPolizas({
            expedienteId,
            clienteId,
            serie: serieBusqueda.trim() || undefined,
          }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar');
      }
    },
    [expedienteId, serie],
  );

  useEffect(() => {
    // Si venimos de un expediente, mostramos sus pólizas directo.
    if (expedienteId) cargarPolizas();
    else cargarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedienteId]);

  function abrirCliente(c: any) {
    setClienteSel(c);
    setSerie('');
    cargarPolizas(c.id, '');
  }

  function volver() {
    setClienteSel(null);
    setPolizas([]);
    cargarClientes();
  }

  async function verChecklist(expId: string) {
    setError('');
    try {
      setChecklist(await api.checklistEmision(expId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  async function marcarEmitida(id: string) {
    setOcupado(true);
    setError('');
    try {
      await api.marcarPolizaEmitida(id, { serie: serieEmision });
      setEmitiendo(null);
      setSerieEmision('');
      setMensaje('Póliza emitida. Se registró el número de serie y arrancó su plan de cobranza.');
      await cargarPolizas(clienteSel?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setOcupado(false);
    }
  }

  const filaPoliza = (p: any) => (
    <tr key={p.id} className="border-t">
      <td className="px-3 py-2">
        <Link href={`/polizas/${p.id}`} className="text-marca hover:underline">
          {[p.unidad.marca, p.unidad.modelo].filter(Boolean).join(' ') || 'Ver póliza'}
        </Link>
        <div className="text-xs text-slate-400">{p.unidad.vin}</div>
      </td>
      <td className="px-3 py-2">{p.aseguradora.nombre}</td>
      <td className="px-3 py-2">{p.folio ?? '—'}</td>
      <td className="px-3 py-2">{mxn(p.prima)}</td>
      <td className="px-3 py-2">
        <span className={`rounded px-2 py-0.5 text-xs ${ESTADO_POLIZA[p.estado]?.clase ?? ''}`}>
          {ESTADO_POLIZA[p.estado]?.label ?? p.estado}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <span className="flex items-center justify-end gap-2">
          {p.urlNube && (
            <a
              href={p.urlNube}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              Abrir póliza
            </a>
          )}
          {p.estado === 'pendiente_emision' &&
            (emitiendo === p.id ? (
              <>
                <input
                  value={serieEmision}
                  onChange={(e) => setSerieEmision(e.target.value.toUpperCase())}
                  placeholder="Número de serie (VIN)"
                  className="w-48 rounded border border-slate-300 px-2 py-1 text-xs uppercase"
                />
                <button
                  onClick={() => marcarEmitida(p.id)}
                  disabled={ocupado || serieEmision.length < 5}
                  className="rounded bg-green-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  Emitir
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setEmitiendo(p.id);
                  setSerieEmision(p.unidad.vin ?? '');
                }}
                className="rounded bg-marca px-3 py-1.5 text-xs text-white"
              >
                Emitir
              </button>
            ))}
        </span>
      </td>
    </tr>
  );

  const pendientes = polizas.filter((p) => p.estado === 'pendiente_emision');
  const expedientesConPendientes = [
    ...new Set(pendientes.map((p) => p.expedienteId).filter(Boolean)),
  ] as string[];

  // ── Vista 1: lista de clientes (fuera) ──
  const enListaClientes = !clienteSel && !expedienteId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pólizas</h1>
        <p className="text-sm text-slate-500">
          {enListaClientes
            ? 'Elige un cliente para ver sus pólizas.'
            : 'El sistema deja los datos listos y en el orden del portal. El único paso manual es teclearlos allá.'}
        </p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {enListaClientes ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              cargarClientes();
            }}
            className="flex gap-2"
          >
            <input
              value={buscarCliente}
              onChange={(e) => setBuscarCliente(e.target.value)}
              placeholder="Buscar cliente por razón social, RFC o WhatsApp…"
              className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded bg-marca px-3 py-2 text-sm text-white">
              Buscar
            </button>
          </form>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clientes.filter((c) => (c._count?.polizas ?? 0) > 0).length === 0 && (
              <div className="text-sm text-slate-400">Ningún cliente tiene pólizas todavía.</div>
            )}
            {clientes
              .filter((c) => (c._count?.polizas ?? 0) > 0)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => abrirCliente(c)}
                  className="rounded-2xl bg-white p-4 text-left shadow ring-1 ring-slate-200/70 transition hover:ring-marca/40"
                >
                  <div className="font-medium text-marca">{c.razonSocial}</div>
                  <div className="mt-1 text-xs text-slate-500">{c.rfc ?? 'Sin RFC'}</div>
                  <div className="text-xs text-slate-500">{c.whatsappNumber ?? '—'}</div>
                  <div className="mt-3 flex gap-2 text-xs">
                    <span className="rounded bg-marca-suave px-2 py-0.5 text-marca">
                      {c._count?.polizas ?? 0} pólizas
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
                      {c._count?.unidades ?? 0} unidades
                    </span>
                  </div>
                </button>
              ))}
          </div>
        </>
      ) : (
        <>
          {clienteSel && (
            <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow">
              <div>
                <button onClick={volver} className="text-sm text-marca">
                  ← Volver a clientes
                </button>
                <h2 className="mt-1 text-lg font-semibold">{clienteSel.razonSocial}</h2>
                <p className="text-sm text-slate-500">
                  {clienteSel.rfc ?? 'Sin RFC'}
                  {clienteSel.whatsappNumber ? ` · ${clienteSel.whatsappNumber}` : ''}
                </p>
              </div>
              <Link href={`/clientes/${clienteSel.id}`} className="text-sm text-marca">
                Ver perfil →
              </Link>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              cargarPolizas(clienteSel?.id);
            }}
            className="flex flex-wrap gap-2"
          >
            <input
              value={serie}
              onChange={(e) => setSerie(e.target.value.toUpperCase())}
              placeholder="Buscar por número de serie (VIN)…"
              className="w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm uppercase"
            />
            <button type="submit" className="rounded bg-marca px-3 py-2 text-sm text-white">
              Buscar
            </button>
          </form>

          {expedientesConPendientes.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-lg bg-white p-4 shadow">
              <span className="text-sm text-slate-600">Checklist de captura:</span>
              {expedientesConPendientes.map((expId) => (
                <button
                  key={expId}
                  onClick={() => verChecklist(expId)}
                  className="rounded bg-marca px-3 py-1.5 text-xs text-white"
                >
                  Ver checklist ({expId.slice(-6)})
                </button>
              ))}
            </div>
          )}

          {polizas.length === 0 ? (
            <div className="rounded-lg bg-white p-6 text-center text-slate-400 shadow">
              Sin pólizas.
            </div>
          ) : (
            agruparPolizasPorFlota(polizas).map(([flota, grupo]) => (
              <div key={flota} className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  {flota}
                  <span className="rounded bg-marca-suave px-2 py-0.5 text-xs text-marca">
                    {grupo.length}
                  </span>
                </h3>
                <div className="overflow-x-auto rounded-lg bg-white shadow">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Unidad</th>
                        <th className="px-3 py-2">Aseguradora</th>
                        <th className="px-3 py-2">Folio</th>
                        <th className="px-3 py-2">Prima</th>
                        <th className="px-3 py-2">Estado</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>{grupo.map((p) => filaPoliza(p))}</tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* Checklist de captura en el portal */}
      {checklist && (
        <section className="space-y-4 rounded-lg border-2 border-marca bg-white p-4 shadow">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold">Checklist de captura · {checklist.cliente}</h2>
              <p className="text-sm text-slate-500">
                {checklist.totalPolizas} póliza(s). Los campos están en el orden en que el portal
                los pide: captura de arriba hacia abajo sin saltar renglones.
              </p>
            </div>
            <button onClick={() => setChecklist(null)} className="text-sm text-slate-500">
              Cerrar
            </button>
          </div>

          {checklist.polizas.map((p: any, i: number) => (
            <div key={p.polizaId} className="rounded border">
              <div className="border-b bg-slate-50 px-3 py-2 text-sm font-medium">
                {i + 1}. {p.aseguradora} —{' '}
                {[p.unidad.marca, p.unidad.modelo].filter(Boolean).join(' ')} ({p.unidad.vin ?? 's/VIN'})
              </div>
              {p.notasPortal && (
                <p className="bg-amber-50 px-3 py-2 text-xs text-amber-800">{p.notasPortal}</p>
              )}
              <table className="w-full text-sm">
                <tbody>
                  {p.campos.map((c: any) => (
                    <tr key={c.orden} className="border-t">
                      <td className="w-10 px-2 py-1.5 text-slate-400">{c.orden}</td>
                      <td className="px-2 py-1.5 text-slate-600">{c.etiqueta}</td>
                      <td
                        className={`px-2 py-1.5 font-medium ${
                          String(c.valor).startsWith('FALTA') ? 'text-red-600' : ''
                        }`}
                      >
                        {c.valor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
