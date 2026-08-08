'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const TIPOS = ['camion', 'tractocamion', 'remolque', 'otro'];

// Todos los campos son texto en el formulario; se convierten al enviar.
type UnidadForm = Record<string, string>;

type TipoCampo = 'texto' | 'numero' | 'moneda' | 'tipo' | 'bool';

const CAMPOS: Array<{ key: string; label: string; tipo?: TipoCampo }> = [
  { key: 'flotaNombre', label: 'Flota' },
  { key: 'folio', label: 'Folio' },
  { key: 'aseguradoNombre', label: 'Asegurado' },
  { key: 'tipo', label: 'Tipo de unidad', tipo: 'tipo' },
  { key: 'marca', label: 'Marca' },
  { key: 'descripcion', label: 'Descripción completa' },
  { key: 'anio', label: 'Año', tipo: 'numero' },
  { key: 'vin', label: 'Serie / VIN' },
  { key: 'numeroEconomico', label: 'Número económico' },
  { key: 'valorAsegurado', label: 'Suma asegurada', tipo: 'moneda' },
  { key: 'placas', label: 'Placas' },
  { key: 'numeroMotor', label: 'Número de motor' },
  { key: 'tipoCobertura', label: 'Tipo de cobertura' },
  { key: 'tipoCarga', label: 'Tipo de carga' },
  { key: 'usoUnidad', label: 'Uso de la unidad' },
  { key: 'dobleRemolque', label: 'Doble remolque', tipo: 'bool' },
  { key: 'tipoAdaptacion', label: 'Adaptación' },
  { key: 'coberturaAdaptacion', label: 'Cobertura de adaptación' },
  { key: 'sumaAseguradaAdaptacion', label: 'Suma asegurada adaptación', tipo: 'moneda' },
];

function aForm(u: Record<string, unknown>): UnidadForm {
  const f: UnidadForm = {};
  for (const c of CAMPOS) {
    const v = u[c.key];
    if (c.tipo === 'bool') f[c.key] = v ? 'si' : 'no';
    else f[c.key] = v != null ? String(v) : '';
  }
  if (!f.tipo) f.tipo = 'otro';
  return f;
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
      const num = (v: string) => (v ? Number(String(v).replace(/[,$\s]/g, '')) : null);
      await api.aprobarExtraccion(id, {
        clienteId: clienteId || undefined,
        unidades: unidades.map((u) => ({
          flotaNombre: u.flotaNombre || null,
          folio: u.folio || null,
          tipo: u.tipo || 'otro',
          aseguradoNombre: u.aseguradoNombre || null,
          marca: u.marca || null,
          descripcion: u.descripcion || null,
          anio: num(u.anio),
          vin: u.vin || null,
          numeroEconomico: u.numeroEconomico || null,
          valorAsegurado: num(u.valorAsegurado),
          placas: u.placas || null,
          numeroMotor: u.numeroMotor || null,
          tipoCobertura: u.tipoCobertura || null,
          tipoCarga: u.tipoCarga || null,
          usoUnidad: u.usoUnidad || null,
          dobleRemolque: u.dobleRemolque === 'si',
          tipoAdaptacion: u.tipoAdaptacion || null,
          coberturaAdaptacion: u.coberturaAdaptacion || null,
          sumaAseguradaAdaptacion: num(u.sumaAseguradaAdaptacion),
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

          <div className="space-y-4">
            {unidades.map((u, i) => (
              <div key={i} className="rounded-lg bg-white p-4 shadow">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Unidad {i + 1}</h3>
                  {camposDudosos[i]?.length > 0 && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      {camposDudosos[i].length} por verificar
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {CAMPOS.map((c) => {
                    const dudoso = camposDudosos[i]?.includes(c.key);
                    const clase = `mt-1 w-full rounded border px-2 py-1.5 text-sm ${
                      dudoso ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
                    }`;
                    return (
                      <div key={c.key}>
                        <label className="block text-xs font-medium text-slate-600">
                          {c.label}
                          {dudoso && <span className="ml-1 text-amber-600">• verificar</span>}
                        </label>
                        {c.tipo === 'tipo' ? (
                          <select
                            value={u.tipo}
                            onChange={(e) => editar(i, 'tipo', e.target.value)}
                            className={`${clase} capitalize`}
                          >
                            {TIPOS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        ) : c.tipo === 'bool' ? (
                          <select
                            value={u[c.key]}
                            onChange={(e) => editar(i, c.key, e.target.value)}
                            className={clase}
                          >
                            <option value="no">No</option>
                            <option value="si">Sí</option>
                          </select>
                        ) : (
                          <input
                            value={u[c.key] ?? ''}
                            onChange={(e) => editar(i, c.key, e.target.value)}
                            inputMode={
                              c.tipo === 'numero' || c.tipo === 'moneda' ? 'decimal' : undefined
                            }
                            className={clase}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-slate-50 py-3">
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
