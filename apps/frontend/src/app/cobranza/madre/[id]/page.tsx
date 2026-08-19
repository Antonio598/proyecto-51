'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const ESTADO_COBRANZA: Record<string, { label: string; clase: string }> = {
  vigente: { label: 'Vigente', clase: 'bg-slate-100 text-slate-700' },
  por_vencer: { label: 'Por vencer', clase: 'bg-amber-100 text-amber-800' },
  vencido: { label: 'Vencido', clase: 'bg-red-100 text-red-800' },
  pagado: { label: 'Pagado', clase: 'bg-green-100 text-green-800' },
};

const PERIODICIDAD: Record<string, string> = {
  de_contado: 'De contado (1 pago)',
  mensual: 'Mensual (12)',
  bimestral: 'Bimestral (6)',
  trimestral: 'Trimestral (4)',
};

function mxn(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function fecha(v: unknown) {
  if (!v) return '—';
  return new Date(v as string).toLocaleDateString('es-MX');
}

export default function MadreDetallePage() {
  const { id } = useParams<{ id: string }>();
  const [madre, setMadre] = useState<any>(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [periodicidad, setPeriodicidad] = useState('');
  const [fechaEmision, setFechaEmision] = useState('');

  const cargar = useCallback(async () => {
    try {
      const m = await api.detalleMadre(id);
      setMadre(m);
      setPeriodicidad(m.periodicidad);
      setFechaEmision(m.fechaEmision ? String(m.fechaEmision).slice(0, 10) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardarPlan() {
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      await api.configurarPlanMadre(id, {
        periodicidad,
        ...(fechaEmision ? { fechaEmision: new Date(fechaEmision).toISOString() } : {}),
      });
      setMensaje('Plan de pagos actualizado.');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setOcupado(false);
    }
  }

  async function marcarPagado() {
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      const res = await api.marcarPagadoMadre(id);
      setMensaje(
        res.siguiente
          ? `Parcialidad ${res.pagada} pagada. Se abrió la parcialidad ${res.siguiente.numeroParcialidad}.`
          : `Parcialidad ${res.pagada} pagada. El plan quedó saldado.`,
      );
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setOcupado(false);
    }
  }

  if (error && !madre)
    return <div className="rounded bg-red-50 px-3 py-2 text-red-700">{error}</div>;
  if (!madre) return <div className="text-slate-400">Cargando…</div>;

  // Estado persistido por parcialidad (para pintar el calendario proyectado).
  const estadoPorParcialidad = new Map<number, any>(
    (madre.cortes ?? []).map((c: any) => [c.numeroParcialidad, c]),
  );
  const abierta = (madre.cortes ?? []).find((c: any) => c.estado !== 'pagado');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cobranza" className="text-sm text-marca">
          ← Cobranza
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Póliza Madre · {madre.cliente.razonSocial}</h1>
        <p className="text-sm text-slate-500">
          {madre.aseguradora.nombre}
          {madre.cliente.rfc ? ` · RFC ${madre.cliente.rfc}` : ''} · {madre.hijas.length} póliza(s)
          hija(s)
        </p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Total consolidado */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow sm:col-span-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total de la Madre</div>
          <div className="mt-1 text-2xl font-semibold">{mxn(madre.primaTotal)}</div>
        </div>
        <div className="rounded-lg bg-white p-4 text-sm shadow sm:col-span-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <div>Prima neta</div>
            <div className="text-right font-medium">{mxn(madre.primaNeta)}</div>
            <div>Financiamiento</div>
            <div className="text-right font-medium">{mxn(madre.financiamiento)}</div>
            <div>Gastos de expedición</div>
            <div className="text-right font-medium">{mxn(madre.gastosExpedicion)}</div>
            <div>IVA</div>
            <div className="text-right font-medium">{mxn(madre.iva)}</div>
          </div>
        </div>
      </div>

      {/* Plan de pagos */}
      <section className="space-y-3 rounded-lg bg-white p-4 shadow">
        <h2 className="font-semibold">Plan de pagos</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-slate-500">Periodicidad</span>
            <select
              value={periodicidad}
              onChange={(e) => setPeriodicidad(e.target.value)}
              className="mt-1 rounded border px-3 py-1.5"
            >
              {Object.entries(PERIODICIDAD).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Fecha de emisión</span>
            <input
              type="date"
              value={fechaEmision}
              onChange={(e) => setFechaEmision(e.target.value)}
              className="mt-1 rounded border px-3 py-1.5"
            />
          </label>
          <button
            onClick={guardarPlan}
            disabled={ocupado}
            className="rounded bg-marca px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Guardar plan
          </button>
          <div className="text-sm text-slate-500">
            Primer pago: {fecha(madre.primeraFechaPago)}
          </div>
        </div>

        {abierta && (
          <div className="flex items-center justify-between rounded border border-marca/40 bg-marca/5 px-3 py-2 text-sm">
            <div>
              Parcialidad vigente: <strong>#{abierta.numeroParcialidad}</strong> ·{' '}
              {mxn(abierta.montoEsperado)} · vence {fecha(abierta.fechaVencimiento)}
            </div>
            <button
              onClick={marcarPagado}
              disabled={ocupado}
              className="rounded bg-green-700 px-4 py-2 text-xs text-white disabled:opacity-50"
            >
              Marcar como pagado
            </button>
          </div>
        )}
      </section>

      {/* Calendario de parcialidades */}
      <section className="space-y-2">
        <h2 className="font-semibold">Calendario de parcialidades</h2>
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Pagado</th>
              </tr>
            </thead>
            <tbody>
              {(madre.calendario ?? []).map((p: any) => {
                const corte = estadoPorParcialidad.get(p.numeroParcialidad);
                const estado = corte?.estado;
                return (
                  <tr key={p.numeroParcialidad} className="border-t">
                    <td className="px-3 py-2">{p.numeroParcialidad}</td>
                    <td className="px-3 py-2">
                      {p.esPrimerPago ? 'Primer pago (con financiamiento y expedición)' : 'Prima neta proporcional'}
                    </td>
                    <td className="px-3 py-2">{fecha(p.fechaVencimiento)}</td>
                    <td className="px-3 py-2">{mxn(p.montoEsperado)}</td>
                    <td className="px-3 py-2">
                      {estado ? (
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${ESTADO_COBRANZA[estado]?.clase ?? ''}`}
                        >
                          {ESTADO_COBRANZA[estado]?.label ?? estado}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">no generada</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{fecha(corte?.pagadoEn)}</td>
                  </tr>
                );
              })}
              {(madre.calendario ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                    Aún no hay plan de pagos. Captura los datos de cobranza en las pólizas y define
                    la periodicidad y fecha de emisión.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Desglose por hija */}
      <section className="space-y-2">
        <h2 className="font-semibold">Desglose por póliza hija</h2>
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Folio</th>
                <th className="px-3 py-2">Unidad</th>
                <th className="px-3 py-2">Prima neta</th>
                <th className="px-3 py-2">Financiamiento</th>
                <th className="px-3 py-2">Expedición</th>
                <th className="px-3 py-2">IVA</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {madre.hijas.map((h: any) => (
                <tr key={h.id} className="border-t">
                  <td className="px-3 py-2">{h.folio ?? 'pendiente'}</td>
                  <td className="px-3 py-2">
                    {[h.unidad?.marca, h.unidad?.modelo].filter(Boolean).join(' ') || '—'}
                    <div className="text-xs text-slate-400">{h.unidad?.vin}</div>
                  </td>
                  <td className="px-3 py-2">{mxn(h.primaNeta)}</td>
                  <td className="px-3 py-2">{mxn(h.financiamiento)}</td>
                  <td className="px-3 py-2">{mxn(h.gastosExpedicion)}</td>
                  <td className="px-3 py-2">{mxn(h.iva)}</td>
                  <td className="px-3 py-2">{mxn(h.primaTotal)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/polizas/${h.id}`} className="text-xs text-marca">
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
