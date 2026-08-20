'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const VIGENCIA: Record<string, { label: string; clase: string }> = {
  ACTIVA: { label: 'ACTIVA', clase: 'bg-green-100 text-green-800' },
  CANCELADA: { label: 'CANCELADA', clase: 'bg-red-100 text-red-800' },
  INACTIVA: { label: 'INACTIVA', clase: 'bg-slate-200 text-slate-700' },
};

function fecha(v: unknown) {
  if (!v) return '—';
  return new Date(v as string).toLocaleDateString('es-MX');
}

export default function ConsultaVigenciaPage() {
  const [serie, setSerie] = useState('');
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    if (!serie.trim()) return;
    setError('');
    setCargando(true);
    setRes(null);
    try {
      setRes(await api.consultarVigencia(serie.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al consultar');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Consulta de vigencia</h1>
        <p className="text-sm text-slate-500">
          Escribe el número de serie (VIN) de una unidad para ver el estado de su póliza, el
          cliente, su RFC y las fechas de vigencia.
        </p>
      </div>

      <form onSubmit={consultar} className="flex flex-wrap gap-3">
        <input
          value={serie}
          onChange={(e) => setSerie(e.target.value.toUpperCase())}
          placeholder="Número de serie (VIN)"
          className="input max-w-sm flex-1 uppercase"
        />
        <button type="submit" disabled={cargando} className="btn-primary">
          {cargando ? 'Consultando…' : 'Consultar'}
        </button>
      </form>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {res && !res.encontrada && (
        <div className="rounded-lg bg-white p-6 text-center text-slate-500 shadow">
          No se encontró ninguna póliza con la serie <strong>{res.serie}</strong>.
        </div>
      )}

      {res?.encontrada && (
        <div className="space-y-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Serie</div>
                <div className="text-lg font-semibold">{res.unidad.vin}</div>
                <div className="text-sm text-slate-500">
                  {[res.unidad.marca, res.unidad.modelo].filter(Boolean).join(' ') || '—'}
                  {res.unidad.numeroEconomico ? ` · Econ. ${res.unidad.numeroEconomico}` : ''}
                </div>
              </div>
              <span
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  VIGENCIA[res.vigencia]?.clase ?? ''
                }`}
              >
                {VIGENCIA[res.vigencia]?.label ?? res.vigencia}
              </span>
            </div>

            <div className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Dato etiqueta="No. de póliza" valor={res.poliza.folio ?? 'pendiente'} />
              <Dato etiqueta="Aseguradora" valor={res.poliza.aseguradora} />
              <Dato etiqueta="Cliente" valor={res.poliza.cliente.razonSocial} />
              <Dato etiqueta="RFC" valor={res.poliza.cliente.rfc ?? '—'} />
              <Dato etiqueta="Inicio de vigencia" valor={fecha(res.poliza.vigenciaInicio)} />
              <Dato etiqueta="Fin de vigencia" valor={fecha(res.poliza.vigenciaFin)} />
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link href={`/polizas/${res.poliza.id}`} className="text-marca">
                Ver póliza →
              </Link>
              {res.poliza.polizaMadreId && (
                <Link href={`/cobranza/madre/${res.poliza.polizaMadreId}`} className="text-marca">
                  Ver Póliza Madre →
                </Link>
              )}
            </div>
          </div>

          {res.historial.length > 1 && (
            <div className="overflow-x-auto rounded-lg bg-white shadow">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Póliza</th>
                    <th className="px-3 py-2">Aseguradora</th>
                    <th className="px-3 py-2">Vigencia</th>
                    <th className="px-3 py-2">Periodo</th>
                  </tr>
                </thead>
                <tbody>
                  {res.historial.map((h: any) => (
                    <tr key={h.id} className="border-t">
                      <td className="px-3 py-2">{h.folio ?? 'pendiente'}</td>
                      <td className="px-3 py-2">{h.aseguradora}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${VIGENCIA[h.vigencia]?.clase ?? ''}`}
                        >
                          {VIGENCIA[h.vigencia]?.label ?? h.vigencia}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {fecha(h.vigenciaInicio)} — {fecha(h.vigenciaFin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <span className="text-slate-500">{etiqueta}: </span>
      <span className="font-medium">{valor}</span>
    </div>
  );
}
