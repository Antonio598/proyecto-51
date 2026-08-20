'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function FacturasPage() {
  const [tipo, setTipo] = useState<'factura' | 'complemento'>('factura');
  const [resultado, setResultado] = useState<any>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!archivo) return;
    setOcupado(true);
    setError('');
    setMensaje('');
    setResultado(null);
    try {
      setResultado(await api.subirFacturaPorRfc(archivo, tipo));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la factura');
    } finally {
      setOcupado(false);
    }
  }

  async function enviar(id: string) {
    setOcupado(true);
    setError('');
    try {
      await api.enviarFactura(id);
      setMensaje('Factura enviada por correo al cliente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Facturas</h1>
        <p className="text-sm text-slate-500">
          Sube una factura o complemento. La IA lee el RFC del receptor y la liga automáticamente al
          cliente correspondiente.
        </p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as 'factura' | 'complemento')}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="factura">Factura</option>
          <option value="complemento">Complemento de pago</option>
        </select>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,application/xml,text/xml,image/*"
          onChange={subir}
          disabled={ocupado}
          className="text-sm"
        />
        {ocupado && <span className="text-sm text-slate-400">Leyendo RFC…</span>}
      </div>

      {resultado && (
        <section className="space-y-3 rounded-lg border-2 border-marca bg-white p-4 shadow">
          <h2 className="font-semibold">Factura ligada</h2>
          <div className="text-sm">
            <div>
              <span className="text-slate-500">Cliente: </span>
              <span className="font-medium">{resultado.cliente.razonSocial}</span>
              {resultado.cliente.rfc ? ` · ${resultado.cliente.rfc}` : ''}
            </div>
            {resultado.lectura?.total != null && (
              <div>
                <span className="text-slate-500">Total leído: </span>
                <span className="font-medium">
                  {Number(resultado.lectura.total).toLocaleString('es-MX', {
                    style: 'currency',
                    currency: 'MXN',
                  })}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => enviar(resultado.factura.id)}
              disabled={ocupado}
              className="rounded bg-green-700 px-4 py-2 text-xs text-white disabled:opacity-50"
            >
              Enviar por correo al cliente
            </button>
            <Link
              href={`/clientes/${resultado.cliente.id}`}
              className="rounded border px-4 py-2 text-xs"
            >
              Ver cliente
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
