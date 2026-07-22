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
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow"
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold text-marca">CRM Seguros de Flotas</h1>
          <p className="text-sm text-slate-500">Inicia sesión para continuar</p>
        </div>

        {error && (
          <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium">Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded bg-marca py-2 text-sm font-medium text-white hover:bg-marca-claro disabled:opacity-50"
        >
          {cargando ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
    </div>
  );
}
