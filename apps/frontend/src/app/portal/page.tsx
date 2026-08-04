'use client';

import { useState } from 'react';
import { enviarPortal } from '@/lib/api';

export default function PortalPage() {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-marca">Envío de documentos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Comparte con nosotros los archivos de tu flota o tus comprobantes de forma segura.
          </p>
        </div>

        {listo ? (
          <div className="rounded-xl bg-white p-8 text-center shadow">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
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
              className="mt-5 rounded border px-4 py-2 text-sm text-slate-700"
            >
              Enviar más documentos
            </button>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-4 rounded-xl bg-white p-6 shadow">
            {error && (
              <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium">
                Teléfono <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej. 55 1234 5678"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                required
              />
              <p className="mt-1 text-xs text-slate-400">
                Con este número vinculamos tus documentos a tu cuenta.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium">
                Correo electrónico <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@empresa.com"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Nombre o empresa</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Opcional"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">
                Archivos <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,application/pdf,image/*"
                onChange={(e) => setArchivos(Array.from(e.target.files ?? []))}
                className="mt-1 w-full text-sm"
              />
              <p className="mt-1 text-xs text-slate-400">
                Excel, PDF o fotos. Hasta 10 archivos, 15 MB cada uno.
              </p>
              {archivos.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {archivos.map((a, i) => (
                    <li key={i}>• {a.name}</li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded bg-marca py-2.5 text-sm font-medium text-white hover:bg-marca-claro disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Enviar documentos'}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-slate-400">
          Tus datos se tratan de forma confidencial y solo los usa el despacho para gestionar tu
          seguro.
        </p>
      </div>
    </div>
  );
}
