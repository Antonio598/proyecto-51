'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

function mxn(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function FacturasPage() {
  const [tipo, setTipo] = useState<'factura' | 'complemento'>('factura');
  const [resultado, setResultado] = useState<any>(null);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    try {
      setFacturas(await api.listarFacturasRecientes());
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
      setResultado(await api.subirFacturaPorRfc(archivo, tipo));
      await cargar();
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
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setOcupado(false);
    }
  }

  async function verArchivo(storageDocId?: string) {
    if (!storageDocId) {
      setError('Esta factura no tiene archivo asociado.');
      return;
    }
    try {
      const { url } = await api.enlaceDocumento(storageDocId);
      window.open(url, '_blank');
    } catch {
      setError('No se pudo abrir el archivo.');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Facturas</h1>
        <p className="text-sm text-slate-500">
          Sube una factura o complemento. La IA lee el RFC del receptor y la liga automáticamente al
          cliente correspondiente. Todas quedan guardadas aquí y puedes ver el archivo original.
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
            <span className="text-slate-500">Cliente: </span>
            <span className="font-medium">{resultado.cliente.razonSocial}</span>
            {resultado.cliente.rfc ? ` · ${resultado.cliente.rfc}` : ''}
            {resultado.lectura?.total != null && <> · Total {mxn(resultado.lectura.total)}</>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => enviar(resultado.factura.id)}
              disabled={ocupado}
              className="rounded bg-green-700 px-4 py-2 text-xs text-white disabled:opacity-50"
            >
              Enviar por correo al cliente
            </button>
            <Link href={`/clientes/${resultado.cliente.id}`} className="rounded border px-4 py-2 text-xs">
              Ver cliente
            </Link>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Facturas guardadas</h2>
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Póliza</th>
                <th className="px-3 py-2">Enviada</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {facturas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                    Aún no hay facturas.
                  </td>
                </tr>
              )}
              {facturas.map((f) => {
                const cliente = f.cliente ?? f.poliza?.cliente;
                return (
                  <tr key={f.id} className="border-t">
                    <td className="px-3 py-2">{new Date(f.createdAt).toLocaleDateString('es-MX')}</td>
                    <td className="px-3 py-2 capitalize">{f.tipo}</td>
                    <td className="px-3 py-2">
                      {cliente?.razonSocial ?? '—'}
                      {cliente?.rfc ? <div className="text-xs text-slate-400">{cliente.rfc}</div> : null}
                    </td>
                    <td className="px-3 py-2">{f.poliza?.folio ?? '—'}</td>
                    <td className="px-3 py-2">
                      {f.enviadoAlClienteEn ? (
                        <span className="text-xs text-green-700">
                          {new Date(f.enviadoAlClienteEn).toLocaleDateString('es-MX')}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">no</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => verArchivo(f.storageDocId)}
                        className="mr-2 rounded border px-3 py-1.5 text-xs"
                      >
                        Ver archivo
                      </button>
                      <button
                        onClick={() => enviar(f.id)}
                        disabled={ocupado}
                        className="rounded bg-green-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                      >
                        {f.enviadoAlClienteEn ? 'Reenviar' : 'Enviar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
