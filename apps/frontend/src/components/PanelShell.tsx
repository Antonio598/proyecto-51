'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, cerrarSesion, getToken, getUsuario, UsuarioSesion } from '@/lib/api';

const NAV: { href: string; label: string; proximamente?: boolean }[] = [
  { href: '/clientes', label: 'Clientes y flotas' },
  { href: '/documentos', label: 'Documentos por procesar' },
  { href: '/expedientes', label: 'Expedientes' },
  { href: '/polizas', label: 'Pólizas' },
  { href: '/cobranza', label: 'Cobranza' },
  { href: '/pagos', label: 'Pagos' },
];

export default function PanelShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [noLeidas, setNoLeidas] = useState(0);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUsuario(getUsuario());

    // Sondeo ligero del contador de notificaciones.
    const refrescar = () =>
      api
        .conteoNotificaciones()
        .then((r) => setNoLeidas(r.noLeidas))
        .catch(() => undefined);
    refrescar();
    const intervalo = setInterval(refrescar, 30000);
    return () => clearInterval(intervalo);
  }, [router]);

  async function alternarNotificaciones() {
    if (!abierto) {
      try {
        setNotificaciones(await api.listarNotificaciones());
      } catch {
        /* ignora fallos de red al abrir el panel */
      }
    }
    setAbierto((v) => !v);
  }

  async function abrirNotificacion(n: any) {
    await api.marcarNotificacionLeida(n.id).catch(() => undefined);
    setAbierto(false);
    setNoLeidas((v) => Math.max(0, v - 1));
    if (n.enlace) router.push(n.enlace);
  }

  function salir() {
    cerrarSesion();
    router.replace('/login');
  }

  if (!usuario) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 bg-marca text-white">
        <div className="px-5 py-5 text-lg font-semibold">CRM Seguros</div>
        <nav className="space-y-1 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.proximamente ? '#' : item.href}
              className={`block rounded px-3 py-2 text-sm ${
                item.proximamente
                  ? 'cursor-not-allowed text-white/40'
                  : 'text-white/90 hover:bg-white/10'
              }`}
            >
              {item.label}
              {item.proximamente && <span className="ml-1 text-xs">(próx.)</span>}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <div className="text-sm text-slate-500">
            {usuario.nombre} · <span className="capitalize">{usuario.rol}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={alternarNotificaciones}
                className="relative text-sm text-slate-600 hover:text-marca"
              >
                Notificaciones
                {noLeidas > 0 && (
                  <span className="absolute -right-3 -top-2 rounded-full bg-red-600 px-1.5 text-[10px] font-medium text-white">
                    {noLeidas}
                  </span>
                )}
              </button>

              {abierto && (
                <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border bg-white shadow-lg">
                  <ul className="max-h-96 divide-y overflow-y-auto">
                    {notificaciones.length === 0 && (
                      <li className="px-3 py-4 text-center text-sm text-slate-400">
                        Sin notificaciones.
                      </li>
                    )}
                    {notificaciones.map((n) => (
                      <li key={n.id}>
                        <button
                          onClick={() => abrirNotificacion(n)}
                          className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                            n.leida ? 'text-slate-500' : 'font-medium text-slate-800'
                          }`}
                        >
                          {n.titulo}
                          <span className="block text-xs font-normal text-slate-500">
                            {n.mensaje}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button onClick={salir} className="text-sm text-marca hover:underline">
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
