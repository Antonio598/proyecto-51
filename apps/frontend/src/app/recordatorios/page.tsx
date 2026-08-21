'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

function mxn(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function fecha(v: unknown) {
  if (!v) return '—';
  return new Date(v as string).toLocaleDateString('es-MX');
}

export default function RecordatoriosPage() {
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    try {
      setPendientes(await api.recordatoriosPendientes());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrir(corteId: string) {
    setAbierto(corteId);
    setNota('');
    setArchivos([]);
    setMensaje('');
    setError('');
  }

  async function enviar(corteId: string) {
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      await api.enviarRecordatorioManual(corteId, archivos, nota || undefined);
      setMensaje('Recordatorio enviado por correo al cliente.');
      setAbierto(null);
      setArchivos([]);
      setNota('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Recordatorios de cobranza</h1>
        <p className="text-sm text-slate-500">
          Desde 20 días antes del vencimiento puedes enviar un recordatorio manual. El correo lleva
          el total y el desglose; además puedes adjuntar un archivo con los datos para realizar el
          pago. (El sistema también envía recordatorios automáticos por su cuenta.)
        </p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Aseguradora</th>
              <th className="px-3 py-2">Parcialidad</th>
              <th className="px-3 py-2">Vence</th>
              <th className="px-3 py-2">Faltan</th>
              <th className="px-3 py-2">Monto</th>
              <th className="px-3 py-2">Enviados</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pendientes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  No hay parcialidades abiertas.
                </td>
              </tr>
            )}
            {pendientes.map((p) => {
              const dentroVentana = p.diasRestantes <= 20;
              return (
                <tr key={p.corteMadreId} className="border-t align-top">
                  <td className="px-3 py-2">
                    {p.cliente}
                    {p.flota && <div className="text-xs text-slate-400">Flota: {p.flota}</div>}
                    {!p.correo && (
                      <div className="text-xs text-red-600">sin correo registrado</div>
                    )}
                  </td>
                  <td className="px-3 py-2">{p.aseguradora}</td>
                  <td className="px-3 py-2">#{p.numeroParcialidad}</td>
                  <td className="px-3 py-2">{fecha(p.fechaVencimiento)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        p.diasRestantes < 0
                          ? 'text-red-700'
                          : dentroVentana
                            ? 'text-amber-700'
                            : 'text-slate-500'
                      }
                    >
                      {p.diasRestantes < 0
                        ? `vencido (${-p.diasRestantes} d)`
                        : `${p.diasRestantes} d`}
                    </span>
                  </td>
                  <td className="px-3 py-2">{mxn(p.montoEsperado)}</td>
                  <td className="px-3 py-2 text-center">{p.recordatoriosEnviados}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-2">
                        <Link
                          href={`/cobranza/madre/${p.madreId}`}
                          className="rounded border px-3 py-1.5 text-xs"
                        >
                          Ver Madre
                        </Link>
                        <button
                          onClick={() => (abierto === p.corteMadreId ? setAbierto(null) : abrir(p.corteMadreId))}
                          disabled={!p.correo}
                          className="rounded bg-marca px-3 py-1.5 text-xs text-white disabled:opacity-50"
                        >
                          {abierto === p.corteMadreId ? 'Cerrar' : 'Enviar recordatorio'}
                        </button>
                      </div>

                      {abierto === p.corteMadreId && (
                        <div className="mt-1 w-72 space-y-2 rounded border bg-slate-50 p-3 text-left">
                          <label className="block text-xs text-slate-600">
                            Adjuntar archivos (datos de pago)
                            <input
                              ref={inputRef}
                              type="file"
                              multiple
                              onChange={(e) => setArchivos(Array.from(e.target.files ?? []))}
                              className="mt-1 block w-full text-xs"
                            />
                          </label>
                          {archivos.length > 0 && (
                            <div className="text-xs text-slate-500">
                              {archivos.length} archivo(s) adjunto(s)
                            </div>
                          )}
                          <textarea
                            value={nota}
                            onChange={(e) => setNota(e.target.value)}
                            placeholder="Nota opcional (se agrega al correo)"
                            className="w-full rounded border px-2 py-1 text-xs"
                            rows={2}
                          />
                          <button
                            onClick={() => enviar(p.corteMadreId)}
                            disabled={ocupado}
                            className="w-full rounded bg-green-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                          >
                            {ocupado ? 'Enviando…' : 'Enviar por correo'}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
