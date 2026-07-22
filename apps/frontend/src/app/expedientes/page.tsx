'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ESTADOS, estadoClase, estadoLabel } from '@/lib/estados';

export default function ExpedientesPage() {
  const [expedientes, setExpedientes] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [aseguradoras, setAseguradoras] = useState<any[]>([]);
  const [filtro, setFiltro] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState<{
    clienteId: string;
    siniestralidad: string;
    aseguradorasSolicitadas: string[];
  }>({ clienteId: '', siniestralidad: '', aseguradorasSolicitadas: [] });

  async function cargar(estado = filtro) {
    setCargando(true);
    setError('');
    try {
      setExpedientes(await api.listarExpedientes(estado || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    Promise.all([api.listarClientes(), api.listarAseguradoras()])
      .then(([c, a]) => {
        setClientes(c);
        setAseguradoras(a);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function alternarAseguradora(id: string) {
    setNuevo((prev) => ({
      ...prev,
      aseguradorasSolicitadas: prev.aseguradorasSolicitadas.includes(id)
        ? prev.aseguradorasSolicitadas.filter((a) => a !== id)
        : [...prev.aseguradorasSolicitadas, id],
    }));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.crearExpediente({
        clienteId: nuevo.clienteId,
        siniestralidad: nuevo.siniestralidad || undefined,
        aseguradorasSolicitadas: nuevo.aseguradorasSolicitadas,
      });
      setNuevo({ clienteId: '', siniestralidad: '', aseguradorasSolicitadas: [] });
      setCreando(false);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Expedientes</h1>
          <p className="text-sm text-slate-500">
            Al capturar la última propuesta solicitada, el comparativo se genera solo.
          </p>
        </div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="rounded bg-marca px-3 py-1.5 text-sm text-white hover:bg-marca-claro"
        >
          {creando ? 'Cancelar' : 'Nuevo expediente'}
        </button>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {creando && (
        <form onSubmit={crear} className="space-y-3 rounded-lg bg-white p-4 shadow">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600">Cliente</label>
              <select
                value={nuevo.clienteId}
                onChange={(e) => setNuevo({ ...nuevo, clienteId: e.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                required
              >
                <option value="">— Selecciona —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razonSocial}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">
              Siniestralidad reportada por el cliente
            </label>
            <textarea
              value={nuevo.siniestralidad}
              onChange={(e) => setNuevo({ ...nuevo, siniestralidad: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ej. 2 siniestros en los últimos 12 meses, ambos por daños materiales…"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">
              Aseguradoras a las que se solicitó propuesta
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {aseguradoras.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => alternarAseguradora(a.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    nuevo.aseguradorasSolicitadas.includes(a.id)
                      ? 'border-marca bg-marca text-white'
                      : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {a.nombre}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              El comparativo se dispara cuando todas estas tengan propuesta capturada.
            </p>
          </div>

          <button
            className="rounded bg-marca px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={!nuevo.clienteId || nuevo.aseguradorasSolicitadas.length === 0}
          >
            Crear expediente
          </button>
        </form>
      )}

      <div className="flex gap-2">
        <select
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value);
            cargar(e.target.value);
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([valor, { label }]) => (
            <option key={valor} value={valor}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">Folio</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Propuestas</th>
              <th className="px-4 py-2">Creado</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : expedientes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Sin expedientes.
                </td>
              </tr>
            ) : (
              expedientes.map((e) => (
                <tr key={e.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/expedientes/${e.id}`} className="text-marca hover:underline">
                      {e.folioInterno.slice(-8)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{e.cliente?.razonSocial}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${estadoClase(e.estado)}`}>
                      {estadoLabel(e.estado)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {e._count?.propuestasAseguradora ?? 0} / {e.aseguradorasSolicitadas?.length ?? 0}
                  </td>
                  <td className="px-4 py-2">{new Date(e.createdAt).toLocaleDateString('es-MX')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
