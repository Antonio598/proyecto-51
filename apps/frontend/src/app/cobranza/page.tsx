'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
          La cobranza se concentra por Póliza Madre (cliente + aseguradora). n8n actualiza los
          estados y envía recordatorios.
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

      {/* Parcialidades abiertas por Póliza Madre */}
      <section className="space-y-2">
        <h2 className="font-semibold">Parcialidades por cobrar</h2>
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Aseguradora</th>
                <th className="px-3 py-2">Parcialidad</th>
                <th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {cortes.map((c: any) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2">
                    {c.cliente.razonSocial}
                    {c.flota && <div className="text-xs text-slate-400">Flota: {c.flota}</div>}
                  </td>
                  <td className="px-3 py-2">{c.aseguradora}</td>
                  <td className="px-3 py-2">
                    {c.periodo} · parcialidad {c.numeroParcialidad}
                    {c.esPrimerPago && (
                      <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">
                        1er pago
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {new Date(c.fechaVencimiento).toLocaleDateString('es-MX')}
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
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/cobranza/madre/${c.madreId}`}
                      className="rounded border px-3 py-1.5 text-xs"
                    >
                      Ver Madre
                    </Link>
                  </td>
                </tr>
              ))}
              {cortes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                    No hay parcialidades abiertas.
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
