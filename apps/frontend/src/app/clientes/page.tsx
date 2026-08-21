'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface ClienteRow {
  id: string;
  razonSocial: string;
  rfc?: string;
  whatsappNumber?: string;
  activo: boolean;
  _count?: { unidades: number; polizas: number };
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ razonSocial: '', rfc: '', whatsappNumber: '' });
  const [vista, setVista] = useState<'tabla' | 'tarjetas'>('tabla');
  const [exportando, setExportando] = useState(false);

  async function exportar() {
    setExportando(true);
    setError('');
    try {
      await api.exportarClientesExcel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar');
    } finally {
      setExportando(false);
    }
  }

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      setClientes(await api.listarClientes(buscar || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.crearCliente({
        razonSocial: nuevo.razonSocial,
        rfc: nuevo.rfc || undefined,
        whatsappNumber: nuevo.whatsappNumber || undefined,
      });
      setNuevo({ razonSocial: '', rfc: '', whatsappNumber: '' });
      setCreando(false);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Clientes y flotas</h1>
          <p className="text-sm text-slate-500">Directorio de clientes y sus unidades aseguradas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
            <button
              onClick={() => setVista('tabla')}
              className={`px-3 py-1.5 ${vista === 'tabla' ? 'bg-marca text-white' : 'bg-white text-slate-600'}`}
            >
              Tabla
            </button>
            <button
              onClick={() => setVista('tarjetas')}
              className={`px-3 py-1.5 ${vista === 'tarjetas' ? 'bg-marca text-white' : 'bg-white text-slate-600'}`}
            >
              Tarjetas
            </button>
          </div>
          <button onClick={exportar} disabled={exportando} className="btn-ghost">
            {exportando ? 'Generando…' : 'Descargar Excel'}
          </button>
          <button onClick={() => setCreando((v) => !v)} className="btn-primary">
            {creando ? 'Cancelar' : '+ Nuevo cliente'}
          </button>
        </div>
      </div>

      {creando && (
        <form onSubmit={crear} className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow-tarjeta">
          <input
            placeholder="Razón social"
            value={nuevo.razonSocial}
            onChange={(e) => setNuevo({ ...nuevo, razonSocial: e.target.value })}
            className="input flex-1"
            required
          />
          <input
            placeholder="RFC"
            value={nuevo.rfc}
            onChange={(e) => setNuevo({ ...nuevo, rfc: e.target.value })}
            className="input w-40"
          />
          <input
            placeholder="WhatsApp (+52…)"
            value={nuevo.whatsappNumber}
            onChange={(e) => setNuevo({ ...nuevo, whatsappNumber: e.target.value })}
            className="input w-44"
          />
          <button className="btn-primary">Guardar</button>
        </form>
      )}

      <div className="flex gap-2">
        <input
          placeholder="Buscar por razón social, RFC o WhatsApp…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
          className="input flex-1"
        />
        <button onClick={cargar} className="btn-ghost">
          Buscar
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {vista === 'tabla' ? (
      <div className="overflow-x-auto rounded-2xl bg-white shadow-tarjeta ring-1 ring-slate-200/70">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Razón social</th>
              <th className="px-4 py-3 font-medium">RFC</th>
              <th className="px-4 py-3 font-medium">WhatsApp</th>
              <th className="px-4 py-3 text-center font-medium">Unidades</th>
              <th className="px-4 py-3 text-center font-medium">Pólizas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : clientes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Sin clientes.
                </td>
              </tr>
            ) : (
              clientes.map((c) => (
                <tr key={c.id} className="transition hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <Link href={`/clientes/${c.id}`} className="font-medium text-marca hover:underline">
                      {c.razonSocial}
                    </Link>
                    {!c.activo && (
                      <span className="badge ml-2 bg-red-100 text-red-600">inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.rfc ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.whatsappNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="badge bg-marca-suave text-marca">{c._count?.unidades ?? 0}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="badge bg-slate-100 text-slate-600">{c._count?.polizas ?? 0}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cargando ? (
            <div className="text-slate-400">Cargando…</div>
          ) : clientes.length === 0 ? (
            <div className="text-slate-400">Sin clientes.</div>
          ) : (
            clientes.map((c) => (
              <Link
                key={c.id}
                href={`/clientes/${c.id}`}
                className="rounded-2xl bg-white p-4 shadow-tarjeta ring-1 ring-slate-200/70 transition hover:ring-marca/40"
              >
                <div className="font-medium text-marca">{c.razonSocial}</div>
                <div className="mt-1 text-xs text-slate-500">{c.rfc ?? 'Sin RFC'}</div>
                <div className="text-xs text-slate-500">{c.whatsappNumber ?? '—'}</div>
                <div className="mt-3 flex gap-2 text-xs">
                  <span className="badge bg-marca-suave text-marca">
                    {c._count?.unidades ?? 0} unidades
                  </span>
                  <span className="badge bg-slate-100 text-slate-600">
                    {c._count?.polizas ?? 0} pólizas
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
