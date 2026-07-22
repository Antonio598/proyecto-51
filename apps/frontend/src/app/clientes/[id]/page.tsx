'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const TIPOS = ['camion', 'tractocamion', 'remolque', 'otro'];

export default function ClienteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const [cliente, setCliente] = useState<any>(null);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [auditoria, setAuditoria] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [desglose, setDesglose] = useState<any>(null);
  const [nuevaUnidad, setNuevaUnidad] = useState({
    tipo: 'tractocamion',
    vin: '',
    anio: '',
    marca: '',
    modelo: '',
    tipoCarga: '',
    valorAsegurado: '',
  });

  async function cargar() {
    try {
      const [c, u, h, a] = await Promise.all([
        api.obtenerCliente(id),
        api.listarUnidades(id),
        api.historialAseguramiento(id),
        api.auditoriaCliente(id),
      ]);
      setCliente(c);
      setUnidades(u);
      setHistorial(h);
      setAuditoria(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function agregarUnidad(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.crearUnidad(id, {
        tipo: nuevaUnidad.tipo,
        vin: nuevaUnidad.vin || undefined,
        anio: nuevaUnidad.anio ? Number(nuevaUnidad.anio) : undefined,
        marca: nuevaUnidad.marca || undefined,
        modelo: nuevaUnidad.modelo || undefined,
        tipoCarga: nuevaUnidad.tipoCarga || undefined,
        valorAsegurado: nuevaUnidad.valorAsegurado ? Number(nuevaUnidad.valorAsegurado) : undefined,
      });
      setNuevaUnidad({
        tipo: 'tractocamion',
        vin: '',
        anio: '',
        marca: '',
        modelo: '',
        tipoCarga: '',
        valorAsegurado: '',
      });
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear unidad');
    }
  }

  if (error) return <div className="rounded bg-red-50 px-3 py-2 text-red-700">{error}</div>;
  if (!cliente) return <div className="text-slate-400">Cargando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clientes" className="text-sm text-marca hover:underline">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{cliente.razonSocial}</h1>
        <p className="text-sm text-slate-500">
          {cliente.rfc ?? 'Sin RFC'} · WhatsApp: {cliente.whatsappNumber ?? '—'}
        </p>
      </div>

      {/* Flota */}
      <section className="space-y-3">
        <h2 className="font-semibold">Flota ({unidades.length})</h2>
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">VIN</th>
                <th className="px-3 py-2">Año</th>
                <th className="px-3 py-2">Marca / Modelo</th>
                <th className="px-3 py-2">Carga</th>
                <th className="px-3 py-2">Valor asegurado</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2 capitalize">{u.tipo}</td>
                  <td className="px-3 py-2">{u.vin ?? '—'}</td>
                  <td className="px-3 py-2">{u.anio ?? '—'}</td>
                  <td className="px-3 py-2">
                    {[u.marca, u.modelo].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-3 py-2">{u.tipoCarga ?? '—'}</td>
                  <td className="px-3 py-2">
                    {u.valorAsegurado
                      ? Number(u.valorAsegurado).toLocaleString('es-MX', {
                          style: 'currency',
                          currency: 'MXN',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
              {unidades.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                    Sin unidades registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={agregarUnidad} className="flex flex-wrap gap-2 rounded-lg bg-white p-4 shadow">
          <select
            value={nuevaUnidad.tipo}
            onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, tipo: e.target.value })}
            className="rounded border border-slate-300 px-2 py-2 text-sm capitalize"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            placeholder="VIN"
            value={nuevaUnidad.vin}
            onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, vin: e.target.value })}
            className="w-44 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Año"
            value={nuevaUnidad.anio}
            onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, anio: e.target.value })}
            className="w-20 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Marca"
            value={nuevaUnidad.marca}
            onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, marca: e.target.value })}
            className="w-32 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Modelo"
            value={nuevaUnidad.modelo}
            onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, modelo: e.target.value })}
            className="w-32 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Tipo de carga"
            value={nuevaUnidad.tipoCarga}
            onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, tipoCarga: e.target.value })}
            className="w-40 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Valor asegurado"
            value={nuevaUnidad.valorAsegurado}
            onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, valorAsegurado: e.target.value })}
            className="w-36 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded bg-marca px-4 py-2 text-sm text-white">Agregar unidad</button>
        </form>
      </section>

      {/* Desglose de costos — módulo 8 */}
      <section className="space-y-2 rounded-lg bg-white p-4 shadow">
        <h2 className="font-semibold">Desglose de costos</h2>
        <p className="text-sm text-slate-500">
          Excel por unidad con el costo de cada póliza y el pago mensual. Al enviarlo queda como
          documento base de cobranza del periodo.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={async () => {
              setError('');
              try {
                const res = await api.generarDesglose(id);
                setDesglose(res);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Error al generar');
              }
            }}
            className="rounded bg-marca px-4 py-2 text-sm text-white"
          >
            Generar desglose
          </button>
          {desglose && (
            <>
              <span className="text-sm text-slate-600">
                {desglose.unidades} unidad(es) · mensual{' '}
                {Number(desglose.totalMensual).toLocaleString('es-MX', {
                  style: 'currency',
                  currency: 'MXN',
                })}
              </span>
              <button
                onClick={async () => {
                  setError('');
                  try {
                    await api.enviarDesglose(id, desglose.documento.id);
                    setDesglose(null);
                    alert('Desglose y pólizas enviados por WhatsApp.');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Error al enviar');
                  }
                }}
                className="rounded bg-green-700 px-4 py-2 text-sm text-white"
              >
                Enviar por WhatsApp
              </button>
            </>
          )}
        </div>
      </section>

      {/* Historial de aseguramiento */}
      <section className="space-y-2">
        <h2 className="font-semibold">Historial de aseguramiento</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay pólizas registradas.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {historial.map((p) => (
              <li key={p.id} className="rounded bg-white px-3 py-2 shadow-sm">
                {p.unidad?.marca} {p.unidad?.modelo} · {p.aseguradora?.nombre} ·{' '}
                {p.vigenciaInicio ? new Date(p.vigenciaInicio).toLocaleDateString('es-MX') : 's/f'}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Auditoría */}
      <section className="space-y-2">
        <h2 className="font-semibold">Auditoría</h2>
        <ul className="space-y-1 text-xs text-slate-500">
          {auditoria.map((a) => (
            <li key={a.id}>
              {new Date(a.timestamp).toLocaleString('es-MX')} · {a.accion} ·{' '}
              {a.actor?.nombre ?? 'sistema'}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
