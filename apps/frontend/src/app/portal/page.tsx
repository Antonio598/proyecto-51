'use client';

import { useState } from 'react';
import { consultarPortal, enviarPortal, PortalCuenta } from '@/lib/api';

type Pestana = 'enviar' | 'consultar';

function moneda(v: string | number | null | undefined) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function fecha(v: string | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const COLOR_ESTADO: Record<string, string> = {
  vigente: 'bg-emerald-100 text-emerald-700',
  por_vencer: 'bg-amber-100 text-amber-700',
  vencido: 'bg-red-100 text-red-700',
  pagado: 'bg-slate-100 text-slate-600',
  emitida: 'bg-emerald-100 text-emerald-700',
  pendiente_emision: 'bg-amber-100 text-amber-700',
  cancelada: 'bg-slate-100 text-slate-500',
};

function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span className={`badge ${COLOR_ESTADO[estado] ?? 'bg-slate-100 text-slate-600'}`}>
      {estado.replace(/_/g, ' ')}
    </span>
  );
}

export default function PortalPage() {
  const [pestana, setPestana] = useState<Pestana>('enviar');

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Encabezado con marca */}
      <header className="bg-gradient-to-br from-marca to-marca-oscuro text-white">
        <div className="mx-auto max-w-3xl px-4 py-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-xl font-bold">
            S
          </div>
          <h1 className="text-2xl font-semibold">Portal de clientes</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
            Envía tus documentos y consulta la información de tu seguro de forma segura.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 pb-16">
        {/* Selector de pestaña */}
        <div className="-mt-6 mb-6 grid grid-cols-2 gap-1 rounded-xl bg-white p-1 shadow-tarjeta">
          <button
            onClick={() => setPestana('enviar')}
            className={`rounded-lg py-2.5 text-sm font-medium transition ${
              pestana === 'enviar' ? 'bg-marca text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Enviar documentos
          </button>
          <button
            onClick={() => setPestana('consultar')}
            className={`rounded-lg py-2.5 text-sm font-medium transition ${
              pestana === 'consultar' ? 'bg-marca text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Mi información
          </button>
        </div>

        {pestana === 'enviar' ? <FormularioEnvio /> : <ConsultaCuenta />}

        <p className="mt-6 text-center text-xs text-slate-400">
          Tus datos se tratan de forma confidencial y solo los usa el despacho para gestionar tu
          seguro.
        </p>
      </div>
    </div>
  );
}

// ───────────────────────── Enviar documentos ─────────────────────────

function FormularioEnvio() {
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (archivos.length === 0) {
      setError('Adjunta al menos un archivo.');
      return;
    }
    setEnviando(true);
    try {
      await enviarPortal({ telefono, email, nombre: nombre || undefined, archivos });
      setListo(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-tarjeta">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600">
          ✓
        </div>
        <h2 className="text-lg font-semibold">¡Recibido!</h2>
        <p className="mt-1 text-sm text-slate-600">
          Tus archivos llegaron correctamente. Nuestro equipo los revisará en breve.
        </p>
        <button
          onClick={() => {
            setListo(false);
            setArchivos([]);
            setNombre('');
          }}
          className="btn-ghost mt-5"
        >
          Enviar más documentos
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-2xl bg-white p-6 shadow-tarjeta">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div>
        <label className="label">
          Teléfono <span className="text-red-500">*</span>
        </label>
        <input
          type="tel"
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Ej. 55 1234 5678"
          className="input"
          required
        />
        <p className="mt-1 text-xs text-slate-400">
          Con este número vinculamos tus documentos a tu cuenta.
        </p>
      </div>

      <div>
        <label className="label">
          Correo electrónico <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tucorreo@empresa.com"
          className="input"
          required
        />
      </div>

      <div>
        <label className="label">Nombre o empresa</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Opcional"
          className="input"
        />
      </div>

      <div>
        <label className="label">
          Archivos <span className="text-red-500">*</span>
        </label>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-marca-claro hover:bg-marca-suave">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mb-2 h-7 w-7 text-marca"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12" />
          </svg>
          <span className="text-sm font-medium text-slate-600">Toca para elegir archivos</span>
          <span className="mt-0.5 text-xs text-slate-400">
            Excel, PDF o fotos · hasta 10 archivos, 15 MB c/u
          </span>
          <input
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,application/pdf,image/*"
            onChange={(e) => setArchivos(Array.from(e.target.files ?? []))}
            className="hidden"
          />
        </label>
        {archivos.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {archivos.map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-marca">•</span> {a.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="submit" disabled={enviando} className="btn-primary w-full py-2.5">
        {enviando ? 'Enviando…' : 'Enviar documentos'}
      </button>
    </form>
  );
}

// ───────────────────────── Mi información ─────────────────────────

function ConsultaCuenta() {
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [cuenta, setCuenta] = useState<PortalCuenta | null>(null);

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      setCuenta(await consultarPortal({ telefono, email }));
    } catch (err) {
      setCuenta(null);
      setError(err instanceof Error ? err.message : 'No se pudo consultar.');
    } finally {
      setCargando(false);
    }
  }

  if (cuenta) {
    return (
      <div className="space-y-4">
        {/* Ficha del cliente */}
        <div className="rounded-2xl bg-white p-6 shadow-tarjeta">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">{cuenta.cliente.razonSocial}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {cuenta.cliente.telefono} · {cuenta.cliente.contactoEmail}
              </p>
            </div>
            <button onClick={() => setCuenta(null)} className="text-sm text-marca hover:underline">
              Salir
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-marca-suave py-3">
              <div className="text-xl font-semibold text-marca">{cuenta.unidades.length}</div>
              <div className="text-xs text-slate-500">Unidades</div>
            </div>
            <div className="rounded-xl bg-marca-suave py-3">
              <div className="text-xl font-semibold text-marca">{cuenta.polizas.length}</div>
              <div className="text-xs text-slate-500">Pólizas</div>
            </div>
            <div className="rounded-xl bg-marca-suave py-3">
              <div className="text-xl font-semibold text-marca">{cuenta.cobranza.length}</div>
              <div className="text-xs text-slate-500">Pagos pendientes</div>
            </div>
          </div>
        </div>

        {/* Cobranza pendiente */}
        {cuenta.cobranza.length > 0 && (
          <div className="rounded-2xl bg-white p-6 shadow-tarjeta">
            <h3 className="section-title mb-3">Pagos pendientes</h3>
            <ul className="space-y-2">
              {cuenta.cobranza.map((c, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-700">{c.unidad}</div>
                    <div className="text-xs text-slate-500">
                      {c.aseguradora} · vence {fecha(c.fechaProximoPago)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-slate-800">
                      {moneda(c.montoEsperado)}
                    </span>
                    <EstadoBadge estado={c.estado} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pólizas */}
        <div className="rounded-2xl bg-white p-6 shadow-tarjeta">
          <h3 className="section-title mb-3">Pólizas</h3>
          {cuenta.polizas.length === 0 ? (
            <p className="text-sm text-slate-400">Aún no hay pólizas registradas.</p>
          ) : (
            <ul className="space-y-2">
              {cuenta.polizas.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-700">{p.unidad}</div>
                    <div className="text-xs text-slate-500">
                      {p.aseguradora}
                      {p.folio ? ` · folio ${p.folio}` : ''} · {fecha(p.vigenciaInicio)}
                    </div>
                  </div>
                  <EstadoBadge estado={p.estado} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Flota */}
        <div className="rounded-2xl bg-white p-6 shadow-tarjeta">
          <h3 className="section-title mb-3">Mi flota</h3>
          {cuenta.unidades.length === 0 ? (
            <p className="text-sm text-slate-400">Aún no hay unidades registradas.</p>
          ) : (
            <ul className="space-y-2">
              {cuenta.unidades.map((u) => (
                <li key={u.id} className="rounded-xl border border-slate-100 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700">
                      {[u.marca, u.modelo].filter(Boolean).join(' ') || u.descripcion || 'Unidad'}
                    </span>
                    <span className="badge bg-slate-100 capitalize text-slate-600">{u.tipo}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {[
                      u.anio,
                      u.placas && `Placas ${u.placas}`,
                      u.numeroEconomico && `Econ. ${u.numeroEconomico}`,
                      u.tipoCobertura,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sin datos adicionales'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={consultar} className="space-y-4 rounded-2xl bg-white p-6 shadow-tarjeta">
      <p className="text-sm text-slate-600">
        Ingresa el teléfono y correo que registraste con el despacho para ver tu flota, pólizas y
        pagos pendientes.
      </p>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div>
        <label className="label">Teléfono</label>
        <input
          type="tel"
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Ej. 55 1234 5678"
          className="input"
          required
        />
      </div>
      <div>
        <label className="label">Correo electrónico</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tucorreo@empresa.com"
          className="input"
          required
        />
      </div>
      <button type="submit" disabled={cargando} className="btn-primary w-full py-2.5">
        {cargando ? 'Consultando…' : 'Ver mi información'}
      </button>
    </form>
  );
}
