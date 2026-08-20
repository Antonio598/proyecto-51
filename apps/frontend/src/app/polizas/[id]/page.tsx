'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, getUsuario } from '@/lib/api';

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

const COBRANZA_VACIA = {
  folio: '',
  primaNeta: '',
  financiamiento: '',
  gastosExpedicion: '',
  iva: '',
  primaTotal: '',
  numeroPagos: '',
};

export default function PolizaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const puedeCobranza = ['administracion', 'admin'].includes(
    (typeof window !== 'undefined' ? getUsuario()?.rol : '') ?? '',
  );
  const [poliza, setPoliza] = useState<any>(null);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [tipoSubida, setTipoSubida] = useState<'factura' | 'complemento'>('factura');
  const [enlace, setEnlace] = useState('');
  const [cobranza, setCobranza] = useState({ ...COBRANZA_VACIA });
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const inputPdf = useRef<HTMLInputElement>(null);
  const inputFactura = useRef<HTMLInputElement>(null);

  async function cargar() {
    try {
      const p = await api.obtenerPoliza(id);
      setPoliza(p);
      setEnlace(p.urlNube ?? '');
      setCobranza({
        folio: p.folio ?? '',
        primaNeta: p.primaNeta != null ? String(p.primaNeta) : '',
        financiamiento: p.financiamiento != null ? String(p.financiamiento) : '',
        gastosExpedicion: p.gastosExpedicion != null ? String(p.gastosExpedicion) : '',
        iva: p.iva != null ? String(p.iva) : '',
        primaTotal: p.primaTotal != null ? String(p.primaTotal) : '',
        numeroPagos: p.numeroPagos != null ? String(p.numeroPagos) : '',
      });
      setFacturas(await api.listarFacturas(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(/[,$\s]/g, '')));
  const totalSugerido =
    (num(cobranza.primaNeta) ?? 0) +
    (num(cobranza.financiamiento) ?? 0) +
    (num(cobranza.gastosExpedicion) ?? 0) +
    (num(cobranza.iva) ?? 0);
  const totalEfectivo = num(cobranza.primaTotal) ?? totalSugerido;
  const pagos = num(cobranza.numeroPagos) ?? 0;
  const importePorPeriodo = totalEfectivo > 0 && pagos > 0 ? totalEfectivo / pagos : 0;

  async function guardarCobranza() {
    await accion(
      () =>
        api.actualizarCobranzaPoliza(id, {
          folio: cobranza.folio || undefined,
          primaNeta: num(cobranza.primaNeta),
          financiamiento: num(cobranza.financiamiento),
          gastosExpedicion: num(cobranza.gastosExpedicion),
          iva: num(cobranza.iva),
          primaTotal: num(cobranza.primaTotal) ?? (totalSugerido > 0 ? totalSugerido : undefined),
          numeroPagos: num(cobranza.numeroPagos),
        }),
      'Datos de cobranza guardados.',
    );
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function accion(fn: () => Promise<unknown>, exito: string) {
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      await fn();
      setMensaje(exito);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setOcupado(false);
    }
  }

  async function subirPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      const res = await api.subirPdfPoliza(id, archivo);
      setMensaje(
        res.sugerencia?.folio
          ? `PDF adjuntado. Folio detectado por IA: ${res.sugerencia.folio} — verifícalo antes de guardarlo.`
          : 'PDF adjuntado. No se pudo detectar el folio automáticamente.',
      );
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir');
    } finally {
      setOcupado(false);
      if (inputPdf.current) inputPdf.current.value = '';
    }
  }

  async function subirFactura(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    await accion(
      () => api.subirFactura(id, archivo, tipoSubida),
      `${tipoSubida === 'factura' ? 'Factura' : 'Complemento'} subido.`,
    );
    if (inputFactura.current) inputFactura.current.value = '';
  }

  if (!poliza) return <div className="text-slate-400">{error || 'Cargando…'}</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/polizas" className="text-sm text-marca hover:underline">
          ← Pólizas
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          {poliza.folio ? `Póliza ${poliza.folio}` : 'Póliza pendiente de emitir'}
        </h1>
        <p className="text-sm text-slate-500">
          {poliza.cliente.razonSocial} · {poliza.aseguradora.nombre} ·{' '}
          {[poliza.unidad.marca, poliza.unidad.modelo].filter(Boolean).join(' ')}{' '}
          {poliza.unidad.vin && `(${poliza.unidad.vin})`}
        </p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-xs uppercase tracking-wide text-slate-500">Prima anual</div>
          <div className="mt-1 text-lg font-semibold">{mxn(poliza.prima)}</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-xs uppercase tracking-wide text-slate-500">Vigencia</div>
          <div className="mt-1 text-sm">
            {poliza.vigenciaInicio
              ? new Date(poliza.vigenciaInicio).toLocaleDateString('es-MX')
              : '—'}{' '}
            →{' '}
            {poliza.vigenciaFin ? new Date(poliza.vigenciaFin).toLocaleDateString('es-MX') : '—'}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-xs uppercase tracking-wide text-slate-500">Estado</div>
          <div className="mt-1 text-sm capitalize">{poliza.estado.replace('_', ' ')}</div>
        </div>
      </div>

      {/* Póliza: liga de nube (Dropbox) o PDF adjunto */}
      <section className="space-y-3 rounded-lg bg-white p-4 shadow">
        <h2 className="font-semibold">Póliza (PDF)</h2>
        <p className="text-sm text-slate-500">
          Registra la liga de la nube (Dropbox) donde está el PDF, o adjunta el archivo. Si adjuntas
          el PDF, Claude lee el folio y la vigencia para que no los teclees de nuevo.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <label className="label">Liga de la póliza (Dropbox)</label>
            <input
              type="url"
              value={enlace}
              onChange={(e) => setEnlace(e.target.value)}
              placeholder="https://www.dropbox.com/…"
              className="input"
            />
          </div>
          <button
            onClick={() =>
              accion(() => api.actualizarEnlacePoliza(id, enlace), 'Liga de la póliza guardada.')
            }
            disabled={ocupado || !enlace}
            className="btn-primary"
          >
            Guardar liga
          </button>
          {poliza.urlNube && (
            <a
              href={poliza.urlNube}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              Abrir póliza
            </a>
          )}
        </div>

        <div className="border-t pt-3">
          <label className="label">O adjunta el PDF descargado del portal</label>
          <input
            ref={inputPdf}
            type="file"
            accept="application/pdf,image/*"
            onChange={subirPdf}
            disabled={ocupado}
            className="text-sm"
          />
        </div>
      </section>

      {/* Datos de cobranza (captura manual) */}
      {puedeCobranza && (
        <section className="space-y-3 rounded-lg bg-white p-4 shadow">
          <div>
            <h2 className="font-semibold">Datos de cobranza</h2>
            <p className="text-sm text-slate-500">
              Como no hay conexión con la aseguradora, captura aquí los importes del recibo. Este
              desglose se suma al total de la Póliza Madre, que concentra la cobranza y el plan de
              pagos (primer pago vs. subsecuentes).
            </p>
            {poliza.polizaMadreId && (
              <Link
                href={`/cobranza/madre/${poliza.polizaMadreId}`}
                className="mt-1 inline-block text-sm text-marca"
              >
                Ver Póliza Madre y plan de pagos →
              </Link>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">No. de póliza</label>
              <input
                value={cobranza.folio}
                onChange={(e) => setCobranza({ ...cobranza, folio: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Inciso</label>
              <input
                value={poliza.unidad?.folio ?? '—'}
                disabled
                className="input bg-slate-50 text-slate-500"
              />
            </div>
            <div>
              <label className="label">Prima neta</label>
              <input
                inputMode="decimal"
                value={cobranza.primaNeta}
                onChange={(e) => setCobranza({ ...cobranza, primaNeta: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Financiamiento</label>
              <input
                inputMode="decimal"
                value={cobranza.financiamiento}
                onChange={(e) => setCobranza({ ...cobranza, financiamiento: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Gastos de expedición</label>
              <input
                inputMode="decimal"
                value={cobranza.gastosExpedicion}
                onChange={(e) => setCobranza({ ...cobranza, gastosExpedicion: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">IVA</label>
              <input
                inputMode="decimal"
                value={cobranza.iva}
                onChange={(e) => setCobranza({ ...cobranza, iva: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">
                Total a pagar {cobranza.primaTotal.trim() === '' && totalSugerido > 0 && (
                  <span className="text-slate-400">(auto: {mxn(totalSugerido)})</span>
                )}
              </label>
              <input
                inputMode="decimal"
                value={cobranza.primaTotal}
                onChange={(e) => setCobranza({ ...cobranza, primaTotal: e.target.value })}
                placeholder={totalSugerido > 0 ? String(totalSugerido) : ''}
                className="input"
              />
            </div>
            <div>
              <label className="label">Número de pagos</label>
              <input
                inputMode="numeric"
                value={cobranza.numeroPagos}
                onChange={(e) => setCobranza({ ...cobranza, numeroPagos: e.target.value })}
                placeholder="ej. 12"
                className="input"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={guardarCobranza} disabled={ocupado} className="btn-primary">
              Guardar datos de cobranza
            </button>
            {importePorPeriodo > 0 && (
              <span className="text-sm text-slate-600">
                Importe por periodo (promedio):{' '}
                <strong className="text-marca">{mxn(importePorPeriodo)}</strong>
              </span>
            )}
          </div>
        </section>
      )}

      {/* Cobranza: ahora vive en la Póliza Madre */}
      <section className="space-y-2">
        <h2 className="font-semibold">Cobranza</h2>
        <div className="rounded-lg bg-white p-4 text-sm text-slate-600 shadow">
          El plan de pagos (parcialidades, fechas límite y estado) se concentra en la Póliza Madre
          de este cliente y aseguradora.
          {poliza.polizaMadreId ? (
            <>
              {' '}
              <Link href={`/cobranza/madre/${poliza.polizaMadreId}`} className="text-marca">
                Ver plan de pagos de la Póliza Madre →
              </Link>
            </>
          ) : (
            ' Se creará al marcar la póliza como emitida.'
          )}
          {poliza.cortes.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">
                Cortes anteriores (modelo previo)
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {poliza.cortes.map((c: any) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-2 py-1.5">{c.periodo}</td>
                      <td className="px-2 py-1.5">
                        {new Date(c.fechaProximoPago).toLocaleDateString('es-MX')}
                      </td>
                      <td className="px-2 py-1.5">{mxn(c.montoEsperado)}</td>
                      <td className="px-2 py-1.5">
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
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Pagos */}
      <section className="space-y-2">
        <h2 className="font-semibold">Pagos registrados</h2>
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Monto</th>
                <th className="px-4 py-2">Forma</th>
                <th className="px-4 py-2">Aplicado en portal</th>
              </tr>
            </thead>
            <tbody>
              {poliza.pagos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-slate-400">
                    Sin pagos registrados.
                  </td>
                </tr>
              )}
              {poliza.pagos.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2">{new Date(p.fecha).toLocaleDateString('es-MX')}</td>
                  <td className="px-4 py-2">{mxn(p.monto)}</td>
                  <td className="px-4 py-2 capitalize">{p.forma}</td>
                  <td className="px-4 py-2">
                    {p.aplicadoEnPortal ? (
                      <span className="text-green-700">Sí</span>
                    ) : (
                      <span className="text-amber-700">Pendiente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Facturas y complementos — módulo 11 */}
      <section className="space-y-3 rounded-lg bg-white p-4 shadow">
        <h2 className="font-semibold">Facturas y complementos de pago</h2>
        <p className="text-sm text-slate-500">
          Descárgalos del portal de la aseguradora y súbelos aquí. El envío al cliente por correo
          es automático.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={tipoSubida}
            onChange={(e) => setTipoSubida(e.target.value as 'factura' | 'complemento')}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="factura">Factura</option>
            <option value="complemento">Complemento de pago</option>
          </select>
          <input
            ref={inputFactura}
            type="file"
            accept="application/pdf,application/xml,text/xml"
            onChange={subirFactura}
            disabled={ocupado}
            className="text-sm"
          />
        </div>

        <ul className="space-y-2">
          {facturas.length === 0 && (
            <li className="text-sm text-slate-400">Sin facturas registradas.</li>
          )}
          {facturas.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
            >
              <div>
                <span className="capitalize">{f.tipo}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {new Date(f.createdAt).toLocaleDateString('es-MX')}
                </span>
                {f.enviadoAlClienteEn && (
                  <span className="ml-2 text-xs text-green-700">
                    Enviada el {new Date(f.enviadoAlClienteEn).toLocaleDateString('es-MX')}
                  </span>
                )}
              </div>
              <button
                onClick={() => accion(() => api.enviarFactura(f.id), 'Enviada por correo.')}
                disabled={ocupado}
                className="rounded bg-green-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {f.enviadoAlClienteEn ? 'Reenviar' : 'Enviar por correo'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
