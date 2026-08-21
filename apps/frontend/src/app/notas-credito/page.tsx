'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

function mxn(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function NotasCreditoPage() {
  const [notas, setNotas] = useState<any[]>([]);
  const [resultado, setResultado] = useState<any>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    try {
      setNotas(await api.listarNotasCredito());
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
    setResultado(null);
    try {
      const res = await api.subirNotaCredito(archivo);
      setResultado(res);
      setMensaje(
        res.facturaVinculada
          ? 'Nota de crédito ligada al cliente y a su factura.'
          : 'Nota de crédito ligada al cliente (sin factura relacionada encontrada).',
      );
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la nota de crédito');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Notas de crédito</h1>
        <p className="text-sm text-slate-500">
          Sube la nota de crédito. La IA lee el RFC y el UUID de la factura relacionada, y la liga
          al cliente y a su factura correspondiente.
        </p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded-lg bg-white p-4 shadow">
        <label className="text-sm font-medium">Subir nota de crédito (PDF, XML o imagen)</label>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,application/xml,text/xml,image/*"
          onChange={subir}
          disabled={ocupado}
          className="mt-2 block text-sm"
        />
        {ocupado && <p className="mt-2 text-sm text-slate-400">Leyendo nota de crédito…</p>}
      </div>

      {resultado && (
        <section className="rounded-lg border-2 border-marca bg-white p-4 text-sm shadow">
          <h2 className="mb-2 font-semibold">Nota de crédito ligada</h2>
          <div>
            <span className="text-slate-500">Cliente: </span>
            <span className="font-medium">{resultado.cliente.razonSocial}</span>
            {resultado.cliente.rfc ? ` · ${resultado.cliente.rfc}` : ''}
          </div>
          {resultado.nota.uuidRelacionado && (
            <div>
              <span className="text-slate-500">UUID factura relacionada: </span>
              <span className="font-mono text-xs">{resultado.nota.uuidRelacionado}</span>
            </div>
          )}
          <div>
            <span className="text-slate-500">Factura vinculada: </span>
            <span className="font-medium">{resultado.facturaVinculada ? 'Sí' : 'No encontrada'}</span>
          </div>
          <Link
            href={`/clientes/${resultado.cliente.id}`}
            className="mt-2 inline-block text-marca"
          >
            Ver cliente →
          </Link>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Notas de crédito recientes</h2>
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Importe</th>
                <th className="px-3 py-2">Factura</th>
              </tr>
            </thead>
            <tbody>
              {notas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                    Aún no hay notas de crédito.
                  </td>
                </tr>
              )}
              {notas.map((n) => (
                <tr key={n.id} className="border-t">
                  <td className="px-3 py-2">{new Date(n.createdAt).toLocaleDateString('es-MX')}</td>
                  <td className="px-3 py-2">{n.cliente?.razonSocial ?? '—'}</td>
                  <td className="px-3 py-2">{mxn(n.importe)}</td>
                  <td className="px-3 py-2">
                    {n.facturaId ? (
                      <span className="text-xs text-green-700">Vinculada</span>
                    ) : (
                      <span className="text-xs text-slate-400">Sin factura</span>
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
