'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function mxn(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function PagosPage() {
  const [comprobantes, setComprobantes] = useState<any[]>([]);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [detalle, setDetalle] = useState<any>(null);
  const [checklist, setChecklist] = useState<any>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    try {
      const [c, p] = await Promise.all([api.comprobantesPendientes(), api.pagosPendientes()]);
      setComprobantes(c);
      setPendientes(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function abrirComprobante(documentoId: string) {
    setError('');
    try {
      setDetalle(await api.detalleComprobante(documentoId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  async function registrar(candidato: any) {
    if (!detalle) return;
    setOcupado(true);
    setError('');
    try {
      const lectura = detalle.lectura ?? {};
      await api.registrarPago({
        corteId: candidato.corteId,
        documentoId: detalle.documento.id,
        monto: lectura.monto ?? candidato.montoEsperado,
        fecha: lectura.fecha ?? new Date().toISOString(),
      });
      setDetalle(null);
      setMensaje('Pago registrado. Aparece abajo como pendiente de aplicar en el portal.');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setOcupado(false);
    }
  }

  async function verChecklist(pagoId: string) {
    setError('');
    try {
      setChecklist(await api.checklistPago(pagoId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  async function confirmar(pagoId: string) {
    setOcupado(true);
    setError('');
    try {
      const res = await api.confirmarPagoAplicado(pagoId);
      setChecklist(null);
      setMensaje(
        res.siguienteCorte
          ? `Pago aplicado. Siguiente corte abierto: ${res.siguienteCorte.periodo}.`
          : 'Pago aplicado.',
      );
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pagos</h1>
        <p className="text-sm text-slate-500">
          Los comprobantes que llegan por WhatsApp se leen y concilian solos. Tú sólo confirmas.
        </p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Comprobantes recibidos */}
      <section className="space-y-2">
        <h2 className="font-semibold">Comprobantes recibidos ({comprobantes.length})</h2>
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Archivo</th>
                <th className="px-4 py-2">Recibido</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {comprobantes.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Sin comprobantes pendientes.
                  </td>
                </tr>
              )}
              {comprobantes.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2">{c.cliente?.razonSocial ?? 'Sin identificar'}</td>
                  <td className="px-4 py-2">{c.nombreOriginal}</td>
                  <td className="px-4 py-2">{new Date(c.createdAt).toLocaleString('es-MX')}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => abrirComprobante(c.id)}
                      className="rounded bg-marca px-3 py-1.5 text-xs text-white"
                    >
                      Conciliar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detalle de conciliación */}
      {detalle && (
        <section className="space-y-3 rounded-lg border-2 border-marca bg-white p-4 shadow">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold">Conciliación · {detalle.documento.nombreOriginal}</h2>
            <button onClick={() => setDetalle(null)} className="text-sm text-slate-500">
              Cerrar
            </button>
          </div>

          {detalle.lectura ? (
            <div className="rounded bg-slate-50 px-3 py-2 text-sm">
              <strong>Lectura del comprobante:</strong> {mxn(detalle.lectura.monto)} ·{' '}
              {detalle.lectura.fecha ?? 'sin fecha'} · Ref: {detalle.lectura.referencia ?? '—'} ·
              Beneficiario: {detalle.lectura.beneficiario ?? '—'}
              <span className="ml-2 text-xs text-slate-500">
                (confianza {Math.round((detalle.lectura.confianza ?? 0) * 100)}%)
              </span>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Aún no se ha leído este comprobante.{' '}
              <button
                onClick={() =>
                  api
                    .conciliarComprobante(detalle.documento.id)
                    .then(() => abrirComprobante(detalle.documento.id))
                }
                className="text-marca underline"
              >
                Leer ahora
              </button>
            </p>
          )}

          <div>
            <h3 className="text-sm font-medium">
              Coincidencias propuestas ({detalle.candidatos?.length ?? 0})
            </h3>
            <ul className="mt-2 space-y-2">
              {(detalle.candidatos ?? []).map((cand: any) => (
                <li
                  key={cand.corteId}
                  className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                >
                  <div>
                    Póliza {cand.folio ?? cand.polizaId.slice(-6)} · {cand.aseguradora} ·{' '}
                    {cand.periodo}
                    <div className="text-xs text-slate-500">
                      Esperado {mxn(cand.montoEsperado)} · diferencia {mxn(cand.diferencia)} ·
                      coincidencia {Math.round(cand.puntaje * 100)}%
                    </div>
                  </div>
                  <button
                    onClick={() => registrar(cand)}
                    disabled={ocupado}
                    className="rounded bg-marca px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  >
                    Es ésta
                  </button>
                </li>
              ))}
              {(detalle.candidatos ?? []).length === 0 && (
                <li className="text-sm text-slate-400">
                  No se encontraron cobros abiertos que coincidan con este importe.
                </li>
              )}
            </ul>
          </div>
        </section>
      )}

      {/* Pendientes de aplicar en el portal */}
      <section className="space-y-2">
        <h2 className="font-semibold">Pendientes de aplicar en el portal ({pendientes.length})</h2>
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Póliza</th>
                <th className="px-4 py-2">Periodo</th>
                <th className="px-4 py-2">Monto</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pendientes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Nada pendiente.
                  </td>
                </tr>
              )}
              {pendientes.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2">{p.poliza.cliente.razonSocial}</td>
                  <td className="px-4 py-2">
                    {p.poliza.folio ?? 'pendiente'}
                    <div className="text-xs text-slate-400">{p.poliza.aseguradora.nombre}</div>
                  </td>
                  <td className="px-4 py-2">{p.corte?.periodo ?? '—'}</td>
                  <td className="px-4 py-2">{mxn(p.monto)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => verChecklist(p.id)}
                      className="mr-2 rounded border px-3 py-1.5 text-xs"
                    >
                      Ver checklist
                    </button>
                    <button
                      onClick={() => confirmar(p.id)}
                      disabled={ocupado}
                      className="rounded bg-green-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    >
                      Ya lo apliqué
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Checklist del portal */}
      {checklist && (
        <section className="space-y-3 rounded-lg border-2 border-marca bg-white p-4 shadow">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold">
              Qué aplicar en el portal de {checklist.aseguradora}
            </h2>
            <button onClick={() => setChecklist(null)} className="text-sm text-slate-500">
              Cerrar
            </button>
          </div>
          {checklist.notasPortal && (
            <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {checklist.notasPortal}
            </p>
          )}
          <table className="w-full text-sm">
            <tbody>
              {checklist.campos.map((c: any) => (
                <tr key={c.orden} className="border-t">
                  <td className="w-10 px-2 py-1.5 text-slate-400">{c.orden}</td>
                  <td className="px-2 py-1.5 text-slate-600">{c.etiqueta}</td>
                  <td className="px-2 py-1.5 font-medium">{c.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => confirmar(checklist.pagoId)}
            disabled={ocupado}
            className="rounded bg-green-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Ya lo apliqué en el portal
          </button>
        </section>
      )}
    </div>
  );
}
