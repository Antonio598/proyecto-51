'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

function mxn(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function etiquetaFactura(f: any) {
  const partes = [
    f.tipo,
    f.poliza?.folio ? `póliza ${f.poliza.folio}` : null,
    f.uuid ? `UUID ${String(f.uuid).slice(0, 8)}…` : null,
    new Date(f.createdAt).toLocaleDateString('es-MX'),
  ].filter(Boolean);
  return partes.join(' · ');
}

export default function NotasCreditoPage() {
  const [notas, setNotas] = useState<any[]>([]);
  const [resultado, setResultado] = useState<any>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Vinculación manual a factura (por nota).
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [facturasDe, setFacturasDe] = useState<any[]>([]);
  const [facturaSel, setFacturaSel] = useState('');

  async function vincular(notaId: string, facturaId: string) {
    if (!facturaId) return;
    setOcupado(true);
    setError('');
    try {
      await api.vincularNotaFactura(notaId, facturaId);
      setVinculando(null);
      setFacturaSel('');
      setMensaje('Nota de crédito vinculada a la factura.');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo vincular');
    } finally {
      setOcupado(false);
    }
  }

  async function abrirVincular(clienteId: string, notaId: string) {
    setError('');
    setFacturaSel('');
    setVinculando(notaId);
    try {
      setFacturasDe(await api.listarFacturasCliente(clienteId));
    } catch {
      setFacturasDe([]);
    }
  }

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

  async function verArchivo(storageDocId?: string) {
    if (!storageDocId) {
      setError('Esta nota de crédito no tiene archivo asociado.');
      return;
    }
    try {
      const { url } = await api.enlaceDocumento(storageDocId);
      window.open(url, '_blank');
    } catch {
      setError('No se pudo abrir el archivo.');
    }
  }

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

          {!resultado.facturaVinculada && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-slate-500">Vincular a factura:</span>
              <select
                value={facturaSel}
                onChange={(e) => setFacturaSel(e.target.value)}
                className="rounded border px-2 py-1 text-xs"
              >
                <option value="">— elige factura —</option>
                {(resultado.facturasCliente ?? []).map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {etiquetaFactura(f)}
                  </option>
                ))}
              </select>
              <button
                onClick={async () => {
                  await vincular(resultado.nota.id, facturaSel);
                  setResultado((r: any) => (r ? { ...r, facturaVinculada: true } : r));
                }}
                disabled={ocupado || !facturaSel}
                className="rounded bg-green-700 px-3 py-1 text-xs text-white disabled:opacity-50"
              >
                Vincular
              </button>
              {(resultado.facturasCliente ?? []).length === 0 && (
                <span className="text-xs text-slate-400">
                  Este cliente no tiene facturas cargadas para vincular.
                </span>
              )}
            </div>
          )}

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
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {notas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
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
                    ) : vinculando === n.id ? (
                      <span className="flex flex-wrap items-center gap-1">
                        <select
                          value={facturaSel}
                          onChange={(e) => setFacturaSel(e.target.value)}
                          className="rounded border px-1 py-1 text-xs"
                        >
                          <option value="">— factura —</option>
                          {facturasDe.map((f: any) => (
                            <option key={f.id} value={f.id}>
                              {etiquetaFactura(f)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => vincular(n.id, facturaSel)}
                          disabled={ocupado || !facturaSel}
                          className="rounded bg-green-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Guardar
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => abrirVincular(n.clienteId, n.id)}
                        className="rounded border px-2 py-1 text-xs text-slate-600"
                      >
                        Vincular factura
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => verArchivo(n.storageDocId)}
                      className="rounded border px-3 py-1.5 text-xs"
                    >
                      Ver archivo
                    </button>
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
