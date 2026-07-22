'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const TIPOS = ['camion', 'tractocamion', 'remolque', 'otro'];

interface UnidadForm {
  tipo: string;
  vin: string;
  anio: string;
  marca: string;
  modelo: string;
  descripcion: string;
  tipoCarga: string;
  valorAsegurado: string;
}

const CAMPOS: Array<{ key: keyof UnidadForm; label: string; ancho: string }> = [
  { key: 'tipo', label: 'Tipo', ancho: 'w-36' },
  { key: 'vin', label: 'VIN / Serie', ancho: 'w-48' },
  { key: 'anio', label: 'Año', ancho: 'w-20' },
  { key: 'marca', label: 'Marca', ancho: 'w-32' },
  { key: 'modelo', label: 'Modelo', ancho: 'w-32' },
  { key: 'descripcion', label: 'Descripción', ancho: 'w-56' },
  { key: 'tipoCarga', label: 'Tipo de carga', ancho: 'w-40' },
  { key: 'valorAsegurado', label: 'Valor asegurado', ancho: 'w-36' },
];

function aForm(u: Record<string, unknown>): UnidadForm {
  return {
    tipo: (u.tipo as string) ?? 'otro',
    vin: (u.vin as string) ?? '',
    anio: u.anio != null ? String(u.anio) : '',
    marca: (u.marca as string) ?? '',
    modelo: (u.modelo as string) ?? '',
    descripcion: (u.descripcion as string) ?? '',
    tipoCarga: (u.tipoCarga as string) ?? '',
    valorAsegurado: u.valorAsegurado != null ? String(u.valorAsegurado) : '',
  };
}

export default function RevisionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [documento, setDocumento] = useState<any>(null);
  const [unidades, setUnidades] = useState<UnidadForm[]>([]);
  const [camposDudosos, setCamposDudosos] = useState<string[][]>([]);
  const [notas, setNotas] = useState('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [enlace, setEnlace] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    setError('');
    try {
      const doc = await api.obtenerDocumento(id);
      setDocumento(doc);
      setClienteId(doc.clienteId ?? '');
      if (doc.extraccion) aplicarExtraccion(doc.extraccion);
      const [{ url }, lista] = await Promise.all([api.enlaceDocumento(id), api.listarClientes()]);
      setEnlace(url);
      setClientes(lista);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }

  function aplicarExtraccion(extraccion: any) {
    const campos = extraccion.camposExtraidos ?? {};
    setUnidades((campos.unidades ?? []).map(aForm));
    setNotas(campos.notas ?? '');
    // El backend calcula qué campos quedaron por debajo del umbral de confianza.
    const conf = extraccion.confianzaPorCampo?.unidades ?? [];
    setCamposDudosos(
      extraccion.camposDudosos ??
        conf.map((c: Record<string, number>) =>
          Object.entries(c ?? {})
            .filter(([, v]) => typeof v === 'number' && v < 0.8)
            .map(([k]) => k),
        ),
    );
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function extraer() {
    setOcupado(true);
    setError('');
    try {
      aplicarExtraccion(await api.extraerDocumento(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en la extracción');
    } finally {
      setOcupado(false);
    }
  }

  async function aprobar() {
    setOcupado(true);
    setError('');
    try {
      await api.aprobarExtraccion(id, {
        clienteId: clienteId || undefined,
        unidades: unidades.map((u) => ({
          tipo: u.tipo,
          vin: u.vin || null,
          anio: u.anio ? Number(u.anio) : null,
          marca: u.marca || null,
          modelo: u.modelo || null,
          descripcion: u.descripcion || null,
          tipoCarga: u.tipoCarga || null,
          valorAsegurado: u.valorAsegurado ? Number(u.valorAsegurado) : null,
        })),
      });
      router.push('/documentos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar');
      setOcupado(false);
    }
  }

  async function descartar() {
    setOcupado(true);
    try {
      await api.descartarDocumento(id);
      router.push('/documentos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descartar');
      setOcupado(false);
    }
  }

  function editar(i: number, campo: keyof UnidadForm, valor: string) {
    setUnidades((prev) => prev.map((u, idx) => (idx === i ? { ...u, [campo]: valor } : u)));
    // Al corregir un campo deja de estar marcado como dudoso.
    setCamposDudosos((prev) => prev.map((c, idx) => (idx === i ? c.filter((k) => k !== campo) : c)));
  }

  const totalDudosos = camposDudosos.reduce((n, c) => n + c.length, 0);

  if (!documento) {
    return <div className="text-slate-400">{error || 'Cargando…'}</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/documentos" className="text-sm text-marca hover:underline">
          ← Documentos por procesar
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          Revisión de extracción · {documento.nombreOriginal}
        </h1>
        <p className="text-sm text-slate-500">
          Valida o corrige los datos antes de que pasen a la flota del cliente.
          {enlace && (
            <>
              {' '}
              <a href={enlace} target="_blank" rel="noreferrer" className="text-marca underline">
                Ver archivo original
              </a>
            </>
          )}
        </p>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow">
        <div>
          <label className="block text-xs font-medium text-slate-600">Cliente</label>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="mt-1 w-72 rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— Selecciona un cliente —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razonSocial}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={extraer}
          disabled={ocupado}
          className="rounded bg-marca px-4 py-2 text-sm text-white hover:bg-marca-claro disabled:opacity-50"
        >
          {ocupado ? 'Procesando…' : documento.extraccion ? 'Volver a extraer' : 'Extraer con IA'}
        </button>
        <button
          onClick={descartar}
          disabled={ocupado}
          className="rounded border px-4 py-2 text-sm text-slate-600 disabled:opacity-50"
        >
          Descartar
        </button>
      </div>

      {notas && (
        <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <strong>Notas de la extracción:</strong> {notas}
        </div>
      )}

      {unidades.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Unidades detectadas ({unidades.length})</h2>
            {totalDudosos > 0 ? (
              <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
                {totalDudosos} campo(s) con baja confianza — resaltados en ámbar
              </span>
            ) : (
              <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800">
                Todos los campos con confianza alta
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg bg-white shadow">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-2 py-2">#</th>
                  {CAMPOS.map((c) => (
                    <th key={c.key} className="px-2 py-2">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unidades.map((u, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                    {CAMPOS.map((c) => {
                      const dudoso = camposDudosos[i]?.includes(c.key);
                      const clase = `w-full rounded border px-2 py-1 text-sm ${
                        dudoso ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
                      }`;
                      return (
                        <td key={c.key} className={`px-2 py-2 ${c.ancho}`}>
                          {c.key === 'tipo' ? (
                            <select
                              value={u.tipo}
                              onChange={(e) => editar(i, 'tipo', e.target.value)}
                              className={clase}
                            >
                              {TIPOS.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={u[c.key]}
                              onChange={(e) => editar(i, c.key, e.target.value)}
                              placeholder={dudoso ? 'Verificar' : ''}
                              className={clase}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={aprobar}
              disabled={ocupado || !clienteId}
              className="rounded bg-marca px-5 py-2 text-sm font-medium text-white hover:bg-marca-claro disabled:opacity-50"
              title={!clienteId ? 'Selecciona un cliente primero' : ''}
            >
              Aprobar y crear {unidades.length} unidad(es)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
