'use client';

import { useEffect, useState } from 'react';
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

export default function PolizasPage() {
  const params = useSearchParams();
  const expedienteId = params.get('expediente') ?? undefined;

  const [polizas, setPolizas] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any>(null);
  const [emitiendo, setEmitiendo] = useState<string | null>(null);
  const [folio, setFolio] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    try {
      setPolizas(await api.listarPolizas({ expedienteId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedienteId]);

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
      await api.marcarPolizaEmitida(id, { folio });
      setEmitiendo(null);
      setFolio('');
      setMensaje('Póliza marcada como emitida. Se abrió su primer corte de cobranza a 30 días.');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setOcupado(false);
    }
  }

  const pendientes = polizas.filter((p) => p.estado === 'pendiente_emision');
  const expedientesConPendientes = [
    ...new Set(pendientes.map((p) => p.expedienteId).filter(Boolean)),
  ] as string[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pólizas</h1>
        <p className="text-sm text-slate-500">
          El sistema deja los datos listos y en el orden del portal. El único paso manual es
          teclearlos allá — las aseguradoras no tienen API.
        </p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

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

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2">Aseguradora</th>
              <th className="px-3 py-2">Folio</th>
              <th className="px-3 py-2">Prima</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {polizas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  Sin pólizas. Genéralas desde un expediente aprobado.
                </td>
              </tr>
            )}
            {polizas.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">{p.cliente.razonSocial}</td>
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
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${ESTADO_POLIZA[p.estado]?.clase ?? ''}`}
                  >
                    {ESTADO_POLIZA[p.estado]?.label ?? p.estado}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {p.estado === 'pendiente_emision' &&
                    (emitiendo === p.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <input
                          value={folio}
                          onChange={(e) => setFolio(e.target.value)}
                          placeholder="Folio del portal"
                          className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => marcarEmitida(p.id)}
                          disabled={ocupado || folio.length < 3}
                          className="rounded bg-green-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                        >
                          Guardar
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setEmitiendo(p.id)}
                        className="rounded bg-marca px-3 py-1.5 text-xs text-white"
                      >
                        Marcar emitida
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
