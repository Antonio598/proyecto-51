'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const MOVIMIENTO: Record<string, { label: string; clase: string }> = {
  alta: { label: 'Alta', clase: 'bg-green-100 text-green-800' },
  baja: { label: 'Baja', clase: 'bg-red-100 text-red-800' },
  cancelacion: { label: 'Cancelación', clase: 'bg-red-100 text-red-800' },
};

function mxn(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function EndososPage() {
  const [endosos, setEndosos] = useState<any[]>([]);
  const [propuesta, setPropuesta] = useState<any>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    try {
      setEndosos(await api.listarEndosos());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!archivo) return;
    setOcupado(true);
    setError('');
    setMensaje('');
    setPropuesta(null);
    try {
      const res = await api.procesarEndoso(archivo);
      setPropuesta(res);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el endoso');
    } finally {
      setOcupado(false);
    }
  }

  async function aplicar(id: string) {
    setOcupado(true);
    setError('');
    try {
      await api.aplicarEndoso(id);
      setPropuesta(null);
      setMensaje('Endoso aplicado. La cobranza de la Póliza Madre se actualizó.');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aplicar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Endosos (altas y bajas)</h1>
        <p className="text-sm text-slate-500">
          Sube el documento del endoso. La IA identifica el movimiento (alta/baja/cancelación), el
          número de serie y el RFC, y localiza la póliza. Tú confirmas antes de aplicar.
        </p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded-lg bg-white p-4 shadow">
        <label className="text-sm font-medium">Subir endoso (PDF o imagen)</label>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          onChange={subir}
          disabled={ocupado}
          className="mt-2 block text-sm"
        />
        {ocupado && !propuesta && <p className="mt-2 text-sm text-slate-400">Leyendo endoso…</p>}
      </div>

      {/* Propuesta leída por IA */}
      {propuesta && (
        <section className="space-y-3 rounded-lg border-2 border-marca bg-white p-4 shadow">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold">Endoso leído</h2>
            <button onClick={() => setPropuesta(null)} className="text-sm text-slate-500">
              Cerrar
            </button>
          </div>
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <span className="text-slate-500">Movimiento: </span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  MOVIMIENTO[propuesta.endoso.movimiento]?.clase ?? ''
                }`}
              >
                {MOVIMIENTO[propuesta.endoso.movimiento]?.label ?? propuesta.endoso.movimiento}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Serie: </span>
              <span className="font-medium">{propuesta.endoso.serie ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">RFC: </span>
              <span className="font-medium">{propuesta.endoso.rfc ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">Importe: </span>
              <span className="font-medium">{mxn(propuesta.endoso.importe)}</span>
            </div>
          </div>

          {propuesta.endoso.notas && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {propuesta.endoso.notas}
            </p>
          )}

          {propuesta.poliza ? (
            <div className="rounded border px-3 py-2 text-sm">
              <div className="font-medium">
                Póliza localizada: {propuesta.poliza.folio ?? 'pendiente'} · {propuesta.poliza.aseguradora}
              </div>
              <div className="text-slate-500">
                Cliente: {propuesta.poliza.cliente.razonSocial}
                {propuesta.poliza.cliente.rfc ? ` · ${propuesta.poliza.cliente.rfc}` : ''} · estado
                actual: {propuesta.poliza.estado}
              </div>
              <div className="mt-2 flex gap-3">
                <button
                  onClick={() => aplicar(propuesta.endoso.id)}
                  disabled={ocupado}
                  className="rounded bg-green-700 px-4 py-2 text-xs text-white disabled:opacity-50"
                >
                  Confirmar y aplicar
                </button>
                <Link
                  href={`/polizas/${propuesta.poliza.id}`}
                  className="rounded border px-4 py-2 text-xs"
                >
                  Ver póliza
                </Link>
              </div>
            </div>
          ) : (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              No se localizó ninguna póliza con la serie <strong>{propuesta.endoso.serie ?? '—'}</strong>.
              Regístrala o emítela antes de aplicar el endoso.
            </p>
          )}
        </section>
      )}

      {/* Historial de endosos */}
      <section className="space-y-2">
        <h2 className="font-semibold">Endosos recientes</h2>
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Movimiento</th>
                <th className="px-3 py-2">Serie</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Importe</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {endosos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                    Aún no hay endosos.
                  </td>
                </tr>
              )}
              {endosos.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-2">{new Date(e.createdAt).toLocaleDateString('es-MX')}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${MOVIMIENTO[e.movimiento]?.clase ?? ''}`}
                    >
                      {MOVIMIENTO[e.movimiento]?.label ?? e.movimiento}
                    </span>
                  </td>
                  <td className="px-3 py-2">{e.serie ?? '—'}</td>
                  <td className="px-3 py-2">{e.poliza?.cliente?.razonSocial ?? '—'}</td>
                  <td className="px-3 py-2">{mxn(e.importe)}</td>
                  <td className="px-3 py-2">
                    {e.aplicadoEn ? (
                      <span className="text-xs text-green-700">
                        Aplicado {new Date(e.aplicadoEn).toLocaleDateString('es-MX')}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">Pendiente</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!e.aplicadoEn && e.polizaId && (
                      <button
                        onClick={() => aplicar(e.id)}
                        disabled={ocupado}
                        className="rounded bg-green-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                      >
                        Aplicar
                      </button>
                    )}
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
