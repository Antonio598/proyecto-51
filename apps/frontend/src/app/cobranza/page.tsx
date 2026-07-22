'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const ESTADO_COBRANZA: Record<string, { label: string; clase: string }> = {
  vigente: { label: 'Vigente', clase: 'bg-slate-100 text-slate-700' },
  por_vencer: { label: 'Por vencer', clase: 'bg-amber-100 text-amber-800' },
  vencido: { label: 'Vencido', clase: 'bg-red-100 text-red-800' },
  pagado: { label: 'Pagado', clase: 'bg-green-100 text-green-800' },
};

function mxn(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function CobranzaPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .dashboardCobranza()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar'));
  }, []);

  if (error) return <div className="rounded bg-red-50 px-3 py-2 text-red-700">{error}</div>;
  if (!data) return <div className="text-slate-400">Cargando…</div>;

  const { resumen, porCliente, cortes } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cobranza</h1>
        <p className="text-sm text-slate-500">
          Cortes cada 30 días naturales. n8n actualiza los estados y envía recordatorios.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid gap-4 sm:grid-cols-3">
        {(['vencido', 'por_vencer', 'vigente'] as const).map((k) => (
          <div key={k} className="rounded-lg bg-white p-4 shadow">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {ESTADO_COBRANZA[k].label}
            </div>
            <div className="mt-1 text-2xl font-semibold">{resumen[k]?.cantidad ?? 0}</div>
            <div className="text-sm text-slate-500">{mxn(resumen[k]?.monto)}</div>
          </div>
        ))}
      </div>

      {/* Por cliente */}
      <section className="space-y-2">
        <h2 className="font-semibold">Por cliente</h2>
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Vencidos</th>
                <th className="px-4 py-2">Por vencer</th>
                <th className="px-4 py-2">Monto abierto</th>
              </tr>
            </thead>
            <tbody>
              {porCliente.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Sin cobros abiertos.
                  </td>
                </tr>
              )}
              {porCliente.map((c: any) => (
                <tr key={c.clienteId} className="border-t">
                  <td className="px-4 py-2">{c.razonSocial}</td>
                  <td className="px-4 py-2">
                    {c.vencido > 0 ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                        {c.vencido}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2">{c.porVencer || '—'}</td>
                  <td className="px-4 py-2">{mxn(c.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detalle por unidad */}
      <section className="space-y-2">
        <h2 className="font-semibold">Detalle por unidad</h2>
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Unidad</th>
                <th className="px-3 py-2">Póliza</th>
                <th className="px-3 py-2">Periodo</th>
                <th className="px-3 py-2">Próximo pago</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cortes.map((c: any) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2">{c.cliente.razonSocial}</td>
                  <td className="px-3 py-2">
                    {[c.unidad?.marca, c.unidad?.modelo].filter(Boolean).join(' ') || '—'}
                    <div className="text-xs text-slate-400">{c.unidad?.vin}</div>
                  </td>
                  <td className="px-3 py-2">
                    {c.folio ?? 'pendiente'}
                    <div className="text-xs text-slate-400">{c.aseguradora}</div>
                  </td>
                  <td className="px-3 py-2">{c.periodo}</td>
                  <td className="px-3 py-2">
                    {new Date(c.fechaProximoPago).toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-3 py-2">{mxn(c.montoEsperado)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        ESTADO_COBRANZA[c.estado]?.clase ?? ''
                      }`}
                    >
                      {ESTADO_COBRANZA[c.estado]?.label ?? c.estado}
                    </span>
                  </td>
                </tr>
              ))}
              {cortes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                    No hay cortes abiertos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
