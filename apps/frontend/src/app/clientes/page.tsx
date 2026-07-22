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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clientes y flotas</h1>
        <button
          onClick={() => setCreando((v) => !v)}
          className="rounded bg-marca px-3 py-1.5 text-sm text-white hover:bg-marca-claro"
        >
          {creando ? 'Cancelar' : 'Nuevo cliente'}
        </button>
      </div>

      {creando && (
        <form onSubmit={crear} className="flex flex-wrap gap-2 rounded-lg bg-white p-4 shadow">
          <input
            placeholder="Razón social"
            value={nuevo.razonSocial}
            onChange={(e) => setNuevo({ ...nuevo, razonSocial: e.target.value })}
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <input
            placeholder="RFC"
            value={nuevo.rfc}
            onChange={(e) => setNuevo({ ...nuevo, rfc: e.target.value })}
            className="w-40 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="WhatsApp (+52…)"
            value={nuevo.whatsappNumber}
            onChange={(e) => setNuevo({ ...nuevo, whatsappNumber: e.target.value })}
            className="w-44 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded bg-marca px-4 py-2 text-sm text-white">Guardar</button>
        </form>
      )}

      <div className="flex gap-2">
        <input
          placeholder="Buscar por razón social, RFC o WhatsApp…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button onClick={cargar} className="rounded border px-4 py-2 text-sm">
          Buscar
        </button>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">Razón social</th>
              <th className="px-4 py-2">RFC</th>
              <th className="px-4 py-2">WhatsApp</th>
              <th className="px-4 py-2">Unidades</th>
              <th className="px-4 py-2">Pólizas</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : clientes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Sin clientes.
                </td>
              </tr>
            ) : (
              clientes.map((c) => (
                <tr key={c.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/clientes/${c.id}`} className="text-marca hover:underline">
                      {c.razonSocial}
                    </Link>
                    {!c.activo && <span className="ml-2 text-xs text-red-500">(inactivo)</span>}
                  </td>
                  <td className="px-4 py-2">{c.rfc ?? '—'}</td>
                  <td className="px-4 py-2">{c.whatsappNumber ?? '—'}</td>
                  <td className="px-4 py-2">{c._count?.unidades ?? 0}</td>
                  <td className="px-4 py-2">{c._count?.polizas ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
