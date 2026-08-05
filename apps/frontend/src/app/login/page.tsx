'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, guardarSesion } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@despacho.mx');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const { accessToken, user } = await api.login(email, password);
      guardarSesion(accessToken, user);
      router.push('/clientes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-marca to-marca-oscuro p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
            S
          </div>
          <span className="text-lg font-semibold">CRM Seguros</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Gestión integral de seguros de flotas
          </h2>
          <p className="mt-3 text-white/70">
            Clientes, extracción de documentos con IA, comparativos, emisión y cobranza — todo en un
            solo lugar.
          </p>
        </div>
        <div className="relative text-sm text-white/50">Uso interno del despacho</div>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center bg-slate-100 px-4 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-tarjeta">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-marca text-lg font-bold text-white lg:hidden">
              S
            </div>
            <h1 className="text-xl font-semibold text-slate-800">Bienvenido de nuevo</h1>
            <p className="mt-1 text-sm text-slate-500">Inicia sesión para continuar</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="label">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label className="label">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
            />
          </div>

          <button type="submit" disabled={cargando} className="btn-primary w-full py-2.5">
            {cargando ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}
