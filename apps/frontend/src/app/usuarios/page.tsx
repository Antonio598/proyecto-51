'use client';

import { useEffect, useState } from 'react';
import { api, getUsuario } from '@/lib/api';

const ROLES = ['captura', 'tecnico', 'comercial', 'administracion', 'admin'];

export default function UsuariosPage() {
  const yo = typeof window !== 'undefined' ? getUsuario() : null;
  const esAdmin = ['administracion', 'admin'].includes(yo?.rol ?? '');

  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Cambiar mi contraseña
  const [pass, setPass] = useState({ actual: '', nueva: '' });

  // Crear usuario
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', password: '', rol: 'captura' });

  async function cargar() {
    if (!esAdmin) return;
    try {
      setUsuarios(await api.listarUsuarios());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function cambiarMiPass(e: React.FormEvent) {
    e.preventDefault();
    await accion(async () => {
      await api.cambiarMiPassword(pass.actual, pass.nueva);
      setPass({ actual: '', nueva: '' });
    }, 'Contraseña actualizada.');
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    await accion(async () => {
      await api.crearUsuario(nuevo);
      setNuevo({ nombre: '', email: '', password: '', rol: 'captura' });
      setCreando(false);
    }, 'Usuario creado.');
  }

  async function resetear(u: any) {
    const nueva = prompt(`Nueva contraseña para ${u.nombre}:`);
    if (!nueva) return;
    if (nueva.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    await accion(() => api.resetPasswordUsuario(u.id, nueva), `Contraseña de ${u.nombre} cambiada.`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <p className="text-sm text-slate-500">Gestiona tu contraseña y, si eres admin, el equipo.</p>
      </div>

      {mensaje && (
        <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{mensaje}</div>
      )}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Cambiar mi contraseña — disponible para todos */}
      <section className="max-w-md space-y-3 rounded-lg bg-white p-4 shadow">
        <h2 className="font-semibold">Cambiar mi contraseña</h2>
        <form onSubmit={cambiarMiPass} className="space-y-2">
          <input
            type="password"
            placeholder="Contraseña actual"
            value={pass.actual}
            onChange={(e) => setPass({ ...pass, actual: e.target.value })}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <input
            type="password"
            placeholder="Nueva contraseña (mín. 6)"
            value={pass.nueva}
            onChange={(e) => setPass({ ...pass, nueva: e.target.value })}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <button
            disabled={ocupado}
            className="rounded bg-marca px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Actualizar contraseña
          </button>
        </form>
      </section>

      {/* Gestión de equipo — sólo admin/administración */}
      {esAdmin && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Equipo del despacho</h2>
            <button
              onClick={() => setCreando((v) => !v)}
              className="rounded bg-marca px-3 py-1.5 text-sm text-white hover:bg-marca-claro"
            >
              {creando ? 'Cancelar' : 'Nuevo usuario'}
            </button>
          </div>

          {creando && (
            <form onSubmit={crear} className="flex flex-wrap gap-2 rounded-lg bg-white p-4 shadow">
              <input
                placeholder="Nombre"
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                required
              />
              <input
                type="email"
                placeholder="Correo"
                value={nuevo.email}
                onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
                className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                required
              />
              <input
                type="password"
                placeholder="Contraseña"
                value={nuevo.password}
                onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
                className="w-40 rounded border border-slate-300 px-3 py-2 text-sm"
                required
              />
              <select
                value={nuevo.rol}
                onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}
                className="rounded border border-slate-300 px-2 py-2 text-sm capitalize"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button className="rounded bg-marca px-4 py-2 text-sm text-white">Crear</button>
            </form>
          )}

          <div className="overflow-hidden rounded-lg bg-white shadow">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-2">Nombre</th>
                  <th className="px-4 py-2">Correo</th>
                  <th className="px-4 py-2">Rol</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-4 py-2">
                      {u.nombre}
                      {u.id === yo?.id && <span className="ml-1 text-xs text-slate-400">(tú)</span>}
                    </td>
                    <td className="px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2 capitalize">{u.rol}</td>
                    <td className="px-4 py-2">
                      {u.activo ? (
                        <span className="text-green-700">Activo</span>
                      ) : (
                        <span className="text-red-500">Inactivo</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => resetear(u)}
                        disabled={ocupado}
                        className="mr-2 rounded border px-3 py-1 text-xs disabled:opacity-50"
                      >
                        Cambiar contraseña
                      </button>
                      {u.id !== yo?.id && (
                        <button
                          onClick={() =>
                            accion(
                              () => api.cambiarEstadoUsuario(u.id, !u.activo),
                              u.activo ? 'Usuario desactivado.' : 'Usuario activado.',
                            )
                          }
                          disabled={ocupado}
                          className={`rounded px-3 py-1 text-xs text-white disabled:opacity-50 ${
                            u.activo ? 'bg-red-600' : 'bg-green-700'
                          }`}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
