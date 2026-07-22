'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, getUsuario } from '@/lib/api';
import { estadoClase, estadoLabel } from '@/lib/estados';

const CAMPOS_COBERTURA = [
  { key: 'responsabilidadCivil', label: 'Responsabilidad civil (terceros)' },
  { key: 'danosMateriales', label: 'Daños materiales' },
  { key: 'roboTotal', label: 'Robo total' },
  { key: 'gastosMedicosOcupantes', label: 'Gastos médicos ocupantes' },
  { key: 'responsabilidadCivilCarga', label: 'RC carga transportada' },
] as const;

const vacia = {
  aseguradoraId: '',
  responsabilidadCivil: '',
  danosMateriales: '',
  roboTotal: '',
  gastosMedicosOcupantes: '',
  responsabilidadCivilCarga: '',
  asistenciaJuridica: false,
  extras: '',
  dedDanosMateriales: '',
  dedRoboTotal: '',
  prima: '',
  condiciones: '',
};

export default function ExpedienteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const usuario = typeof window !== 'undefined' ? getUsuario() : null;

  const [exp, setExp] = useState<any>(null);
  const [auditoria, setAuditoria] = useState<any[]>([]);
  const [aseguradoras, setAseguradoras] = useState<any[]>([]);
  const [form, setForm] = useState({ ...vacia });
  const [comentario, setComentario] = useState('');
  const [aseguradoraElegida, setAseguradoraElegida] = useState('');
  const [vigenciaInicio, setVigenciaInicio] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    try {
      const [e, a, aud] = await Promise.all([
        api.obtenerExpediente(id),
        api.listarAseguradoras(),
        api.auditoriaExpediente(id).catch(() => []),
      ]);
      setExp(e);
      setAseguradoras(a);
      setAuditoria(aud);
      if (e.propuestaCliente?.contenido?.aseguradoraId) {
        setAseguradoraElegida(e.propuestaCliente.contenido.aseguradoraId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const num = (v: string) => (v === '' ? null : Number(v));

  async function capturar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      const res = await api.capturarPropuesta(id, {
        aseguradoraId: form.aseguradoraId,
        coberturas: {
          responsabilidadCivil: num(form.responsabilidadCivil),
          danosMateriales: num(form.danosMateriales),
          roboTotal: num(form.roboTotal),
          gastosMedicosOcupantes: num(form.gastosMedicosOcupantes),
          responsabilidadCivilCarga: num(form.responsabilidadCivilCarga),
          asistenciaJuridica: form.asistenciaJuridica,
          extras: form.extras || null,
        },
        deducibles: {
          danosMateriales: num(form.dedDanosMateriales),
          roboTotal: num(form.dedRoboTotal),
        },
        prima: num(form.prima) ?? undefined,
        condiciones: form.condiciones || undefined,
      });
      setForm({ ...vacia });
      setMensaje(
        res.comparativoGenerado
          ? '✅ Última propuesta capturada — el comparativo se generó automáticamente y se notificó al área comercial.'
          : 'Propuesta guardada. Faltan aseguradoras por capturar.',
      );
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al capturar');
    } finally {
      setOcupado(false);
    }
  }

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

  async function abrirDocumento(docId: string) {
    try {
      const { url } = await api.enlaceDocumento(docId);
      window.open(url, '_blank');
    } catch {
      setError('No se pudo abrir el documento');
    }
  }

  if (!exp) return <div className="text-slate-400">{error || 'Cargando…'}</div>;

  const rol = usuario?.rol;
  const puedeCapturar = ['tecnico', 'admin'].includes(rol ?? '');
  const puedeAprobar = ['comercial', 'admin'].includes(rol ?? '');
  const puedeProponer = ['administracion', 'admin'].includes(rol ?? '');
  const ultimoComparativo = exp.comparativos?.[0];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/expedientes" className="text-sm text-marca hover:underline">
          ← Expedientes
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold">{exp.cliente.razonSocial}</h1>
          <span className={`rounded px-2 py-0.5 text-xs ${estadoClase(exp.estado)}`}>
            {estadoLabel(exp.estado)}
          </span>
        </div>
        <p className="text-sm text-slate-500">Expediente {exp.folioInterno.slice(-8)}</p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {exp.siniestralidad && (
        <section className="rounded-lg bg-white p-4 shadow">
          <h2 className="font-semibold">Siniestralidad reportada</h2>
          <p className="mt-1 text-sm text-slate-600">{exp.siniestralidad}</p>
        </section>
      )}

      {/* Propuestas capturadas */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            Propuestas de aseguradoras ({exp.propuestasAseguradora.length} de{' '}
            {exp.aseguradorasSolicitadas.length})
          </h2>
          {exp.aseguradorasPendientes?.length > 0 && (
            <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
              Faltan {exp.aseguradorasPendientes.length} por capturar
            </span>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Aseguradora</th>
                <th className="px-3 py-2">RC terceros</th>
                <th className="px-3 py-2">Daños materiales</th>
                <th className="px-3 py-2">Robo total</th>
                <th className="px-3 py-2">Prima anual</th>
              </tr>
            </thead>
            <tbody>
              {exp.propuestasAseguradora.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{p.aseguradora.nombre}</td>
                  <td className="px-3 py-2">{fmt(p.coberturas?.responsabilidadCivil)}</td>
                  <td className="px-3 py-2">{fmt(p.coberturas?.danosMateriales)}</td>
                  <td className="px-3 py-2">{fmt(p.coberturas?.roboTotal)}</td>
                  <td className="px-3 py-2">{fmt(p.prima)}</td>
                </tr>
              ))}
              {exp.propuestasAseguradora.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                    Aún no hay propuestas capturadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Captura estructurada (Técnico) */}
      {puedeCapturar && (
        <section className="space-y-3 rounded-lg bg-white p-4 shadow">
          <h2 className="font-semibold">Capturar propuesta de aseguradora</h2>
          <form onSubmit={capturar} className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="w-56">
                <label className="block text-xs font-medium text-slate-600">Aseguradora</label>
                <select
                  value={form.aseguradoraId}
                  onChange={(e) => setForm({ ...form, aseguradoraId: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">— Selecciona —</option>
                  {aseguradoras.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-40">
                <label className="block text-xs font-medium text-slate-600">Prima anual</label>
                <input
                  value={form.prima}
                  onChange={(e) => setForm({ ...form, prima: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  placeholder="MXN"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {CAMPOS_COBERTURA.map((c) => (
                <div key={c.key}>
                  <label className="block text-xs font-medium text-slate-600">{c.label}</label>
                  <input
                    value={form[c.key]}
                    onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Suma asegurada"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Deducible daños (%)
                </label>
                <input
                  value={form.dedDanosMateriales}
                  onChange={(e) => setForm({ ...form, dedDanosMateriales: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Deducible robo (%)
                </label>
                <input
                  value={form.dedRoboTotal}
                  onChange={(e) => setForm({ ...form, dedRoboTotal: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.asistenciaJuridica}
                onChange={(e) => setForm({ ...form, asistenciaJuridica: e.target.checked })}
              />
              Incluye asistencia jurídica y vial
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Coberturas adicionales
                </label>
                <input
                  value={form.extras}
                  onChange={(e) => setForm({ ...form, extras: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Condiciones particulares
                </label>
                <input
                  value={form.condiciones}
                  onChange={(e) => setForm({ ...form, condiciones: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <button
              disabled={ocupado || !form.aseguradoraId}
              className="rounded bg-marca px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {ocupado ? 'Guardando…' : 'Guardar propuesta'}
            </button>
          </form>
        </section>
      )}

      {/* Comparativo */}
      <section className="space-y-2 rounded-lg bg-white p-4 shadow">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Cuadro comparativo</h2>
          {puedeCapturar && exp.propuestasAseguradora.length > 0 && (
            <button
              onClick={() => accion(() => api.generarComparativo(id), 'Comparativo regenerado.')}
              disabled={ocupado}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Regenerar
            </button>
          )}
        </div>
        {ultimoComparativo ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-500">
              Generado el {new Date(ultimoComparativo.generadoEn).toLocaleString('es-MX')}
            </span>
            {ultimoComparativo.pdfDocId && (
              <button
                onClick={() => abrirDocumento(ultimoComparativo.pdfDocId)}
                className="rounded bg-marca px-3 py-1.5 text-white"
              >
                Ver PDF
              </button>
            )}
            {ultimoComparativo.excelDocId && (
              <button
                onClick={() => abrirDocumento(ultimoComparativo.excelDocId)}
                className="rounded border px-3 py-1.5"
              >
                Descargar Excel
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Se generará automáticamente al capturar la última propuesta solicitada.
          </p>
        )}
      </section>

      {/* Aprobación comercial */}
      {puedeAprobar && exp.estado === 'en_revision_comercial' && (
        <section className="flex flex-wrap gap-2 rounded-lg bg-white p-4 shadow">
          <h2 className="w-full font-semibold">Revisión comercial</h2>
          <button
            onClick={() =>
              accion(
                () => api.cambiarEstadoExpediente(id, 'aprobado'),
                'Expediente aprobado. Se notificó a administración.',
              )
            }
            disabled={ocupado}
            className="rounded bg-green-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Aprobar
          </button>
          <button
            onClick={() =>
              accion(
                () => api.cambiarEstadoExpediente(id, 'ajustado'),
                'Devuelto a Técnico para ajustes.',
              )
            }
            disabled={ocupado}
            className="rounded border border-amber-500 px-4 py-2 text-sm text-amber-700 disabled:opacity-50"
          >
            Solicitar ajustes
          </button>
        </section>
      )}

      {/* Propuesta al cliente */}
      {puedeProponer && ['aprobado', 'enviado_a_cliente'].includes(exp.estado) && (
        <section className="space-y-3 rounded-lg bg-white p-4 shadow">
          <h2 className="font-semibold">Propuesta al cliente</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <label className="block text-xs font-medium text-slate-600">
                Aseguradora elegida
              </label>
              <select
                value={aseguradoraElegida}
                onChange={(e) => setAseguradoraElegida(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— Selecciona —</option>
                {exp.propuestasAseguradora.map((p: any) => (
                  <option key={p.aseguradoraId} value={p.aseguradoraId}>
                    {p.aseguradora.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() =>
                accion(
                  () => api.generarPropuestaCliente(id, aseguradoraElegida),
                  'Propuesta generada.',
                )
              }
              disabled={ocupado || !aseguradoraElegida}
              className="rounded bg-marca px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Generar propuesta
            </button>
            {exp.propuestaCliente?.pdfDocId && (
              <>
                <button
                  onClick={() => abrirDocumento(exp.propuestaCliente.pdfDocId)}
                  className="rounded border px-4 py-2 text-sm"
                >
                  Ver PDF
                </button>
                <button
                  onClick={() =>
                    accion(() => api.enviarPropuestaCliente(id), 'Propuesta enviada por WhatsApp.')
                  }
                  disabled={ocupado || !exp.cliente.whatsappNumber}
                  title={
                    exp.cliente.whatsappNumber
                      ? ''
                      : 'El cliente no tiene WhatsApp registrado'
                  }
                  className="rounded bg-green-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  Enviar por WhatsApp
                </button>
              </>
            )}
          </div>
          {exp.propuestaCliente?.enviadaEn && (
            <p className="text-sm text-green-700">
              Enviada el {new Date(exp.propuestaCliente.enviadaEn).toLocaleString('es-MX')} a{' '}
              {exp.cliente.whatsappNumber}
            </p>
          )}
        </section>
      )}

      {/* Emisión de pólizas (Fase D) */}
      {puedeProponer && ['aprobado', 'enviado_a_cliente'].includes(exp.estado) && (
        <section className="space-y-3 rounded-lg bg-white p-4 shadow">
          <h2 className="font-semibold">Emisión de pólizas</h2>
          <p className="text-sm text-slate-500">
            Crea una póliza por unidad y genera el checklist de captura para el portal.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <label className="block text-xs font-medium text-slate-600">Inicio de vigencia</label>
              <input
                type="date"
                value={vigenciaInicio}
                onChange={(e) => setVigenciaInicio(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={() =>
                accion(
                  () =>
                    api.prepararEmision(id, {
                      aseguradoraId: aseguradoraElegida,
                      vigenciaInicio: new Date(vigenciaInicio).toISOString(),
                    }),
                  'Pólizas preparadas. Revísalas en la sección Pólizas para capturarlas en el portal.',
                )
              }
              disabled={ocupado || !aseguradoraElegida || !vigenciaInicio}
              title={aseguradoraElegida ? '' : 'Elige primero la aseguradora arriba'}
              className="rounded bg-marca px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Preparar emisión
            </button>
            <Link
              href={`/polizas?expediente=${id}`}
              className="rounded border px-4 py-2 text-sm text-slate-700"
            >
              Ver pólizas y checklist
            </Link>
          </div>
        </section>
      )}

      {/* Comentarios */}
      <section className="space-y-3 rounded-lg bg-white p-4 shadow">
        <h2 className="font-semibold">Comentarios y ajustes</h2>
        <ul className="space-y-2">
          {exp.comentarios.map((c: any) => (
            <li key={c.id} className="rounded bg-slate-50 px-3 py-2 text-sm">
              <div className="text-xs text-slate-500">
                {c.autor.nombre} ({c.autor.rol}) ·{' '}
                {new Date(c.createdAt).toLocaleString('es-MX')}
              </div>
              {c.contenido}
            </li>
          ))}
          {exp.comentarios.length === 0 && (
            <li className="text-sm text-slate-400">Sin comentarios.</li>
          )}
        </ul>
        <div className="flex gap-2">
          <input
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Escribe un comentario o ajuste…"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() =>
              accion(async () => {
                await api.comentarExpediente(id, comentario);
                setComentario('');
              }, 'Comentario agregado.')
            }
            disabled={ocupado || !comentario.trim()}
            className="rounded bg-marca px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Comentar
          </button>
        </div>
      </section>

      {/* Auditoría: quién capturó, quién aprobó y cuándo */}
      <section className="space-y-2 rounded-lg bg-white p-4 shadow">
        <h2 className="font-semibold">Auditoría</h2>
        {auditoria.length === 0 ? (
          <p className="text-sm text-slate-400">Sin movimientos registrados.</p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-600">
            {auditoria.map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="text-slate-400">
                  {new Date(a.timestamp).toLocaleString('es-MX')}
                </span>
                <span className="font-medium">{a.accion}</span>
                <span>· {a.actor?.nombre ?? 'sistema'}</span>
                {a.actor?.rol && <span className="text-slate-400">({a.actor.rol})</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function fmt(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}
