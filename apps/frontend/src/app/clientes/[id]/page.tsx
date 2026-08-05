'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const TIPOS = ['camion', 'tractocamion', 'remolque', 'otro'];

type Fmt = 'texto' | 'moneda' | 'bool';

/** Campos que se muestran en cada unidad (todo lo que extrae la IA). */
const CAMPOS_UNIDAD: Array<{ key: string; label: string; fmt?: Fmt }> = [
  { key: 'aseguradoNombre', label: 'Asegurado' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'anio', label: 'Año' },
  { key: 'vin', label: 'Serie / VIN' },
  { key: 'numeroEconomico', label: 'No. económico' },
  { key: 'placas', label: 'Placas' },
  { key: 'numeroMotor', label: 'No. de motor' },
  { key: 'tipoCobertura', label: 'Cobertura' },
  { key: 'tipoCarga', label: 'Tipo de carga' },
  { key: 'usoUnidad', label: 'Uso' },
  { key: 'dobleRemolque', label: 'Doble remolque', fmt: 'bool' },
  { key: 'valorAsegurado', label: 'Suma asegurada', fmt: 'moneda' },
  { key: 'tipoAdaptacion', label: 'Adaptación' },
  { key: 'coberturaAdaptacion', label: 'Cobertura adaptación' },
  { key: 'sumaAseguradaAdaptacion', label: 'Suma adaptación', fmt: 'moneda' },
];

function moneda(v: unknown) {
  if (v == null || v === '') return null;
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function valorMostrable(u: Record<string, unknown>, campo: { key: string; fmt?: Fmt }) {
  const v = u[campo.key];
  if (campo.fmt === 'bool') return v ? 'Sí' : null; // solo mostramos si aplica
  if (campo.fmt === 'moneda') return moneda(v);
  return v != null && v !== '' ? String(v) : null;
}

export default function ClienteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const [cliente, setCliente] = useState<any>(null);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [auditoria, setAuditoria] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [desglose, setDesglose] = useState<any>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
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
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear unidad');
    }
  }

  if (error) return <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</div>;
  if (!cliente) return <div className="text-slate-400">Cargando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clientes" className="text-sm text-marca hover:underline">
          ← Clientes
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-800">{cliente.razonSocial}</h1>
          {!cliente.activo && (
            <span className="badge bg-red-100 text-red-600">Inactivo</span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {cliente.rfc ?? 'Sin RFC'} · WhatsApp: {cliente.whatsappNumber ?? '—'}
          {cliente.contactoEmail ? ` · ${cliente.contactoEmail}` : ''}
        </p>
      </div>

      {/* Flota */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Flota ({unidades.length})</h2>
          <button onClick={() => setMostrarForm((v) => !v)} className="btn-ghost py-1.5">
            {mostrarForm ? 'Cancelar' : '+ Agregar unidad'}
          </button>
        </div>

        {mostrarForm && (
          <form onSubmit={agregarUnidad} className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow-tarjeta">
            <select
              value={nuevaUnidad.tipo}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, tipo: e.target.value })}
              className="input w-40 capitalize"
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
              className="input w-44"
            />
            <input
              placeholder="Año"
              value={nuevaUnidad.anio}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, anio: e.target.value })}
              className="input w-24"
            />
            <input
              placeholder="Marca"
              value={nuevaUnidad.marca}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, marca: e.target.value })}
              className="input w-32"
            />
            <input
              placeholder="Modelo"
              value={nuevaUnidad.modelo}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, modelo: e.target.value })}
              className="input w-32"
            />
            <input
              placeholder="Tipo de carga"
              value={nuevaUnidad.tipoCarga}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, tipoCarga: e.target.value })}
              className="input w-40"
            />
            <input
              placeholder="Valor asegurado"
              value={nuevaUnidad.valorAsegurado}
              onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, valorAsegurado: e.target.value })}
              className="input w-40"
            />
            <button className="btn-primary">Guardar</button>
          </form>
        )}

        {unidades.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 shadow-tarjeta">
            Sin unidades registradas. Los documentos aprobados desde la bandeja agregan unidades
            aquí automáticamente.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {unidades.map((u, i) => {
              const titulo =
                [u.marca, u.modelo].filter(Boolean).join(' ') || u.descripcion || `Unidad ${i + 1}`;
              const campos = CAMPOS_UNIDAD.map((c) => ({
                label: c.label,
                valor: valorMostrable(u, c),
              })).filter((c) => c.valor != null);
              return (
                <div key={u.id} className="rounded-2xl bg-white p-4 shadow-tarjeta">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{titulo}</div>
                      {u.valorAsegurado && (
                        <div className="text-sm text-marca">{moneda(u.valorAsegurado)}</div>
                      )}
                    </div>
                    <span className="badge shrink-0 bg-marca-suave capitalize text-marca">
                      {u.tipo}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                    {campos.map((c) => (
                      <div key={c.label} className="min-w-0">
                        <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                          {c.label}
                        </dt>
                        <dd className="truncate text-sm text-slate-700" title={c.valor ?? ''}>
                          {c.valor}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Desglose de costos — módulo 8 */}
      <section className="space-y-3 rounded-2xl bg-white p-5 shadow-tarjeta">
        <h2 className="text-lg font-semibold text-slate-800">Desglose de costos</h2>
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
            className="btn-primary"
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
                className="btn-success"
              >
                Enviar por WhatsApp
              </button>
            </>
          )}
        </div>
      </section>

      {/* Historial de aseguramiento */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-800">Historial de aseguramiento</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay pólizas registradas.</p>
        ) : (
          <ul className="space-y-2">
            {historial.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 text-sm shadow-tarjeta"
              >
                <span className="text-slate-700">
                  {[p.unidad?.marca, p.unidad?.modelo].filter(Boolean).join(' ') || 'Unidad'} ·{' '}
                  {p.aseguradora?.nombre}
                </span>
                <span className="text-slate-400">
                  {p.vigenciaInicio
                    ? new Date(p.vigenciaInicio).toLocaleDateString('es-MX')
                    : 's/f'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Auditoría */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-800">Auditoría</h2>
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
