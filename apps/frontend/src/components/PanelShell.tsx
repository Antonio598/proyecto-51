'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, cerrarSesion, getToken, getUsuario, UsuarioSesion } from '@/lib/api';

/** Iconos en línea (sin dependencias externas), trazo simple estilo "lucide". */
const Icono = ({ d }: { d: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-[18px] w-[18px] shrink-0"
  >
    <path d={d} />
  </svg>
);

const ICONOS: Record<string, string> = {
  clientes: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  documentos: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  expedientes: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  polizas: 'M9 12l2 2 4-4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  cobranza: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  pagos: 'M1 4h22v16H1z M1 10h22',
  usuarios: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
};

const NAV: { href: string; label: string; icono: string }[] = [
  { href: '/clientes', label: 'Clientes y flotas', icono: 'clientes' },
  { href: '/documentos', label: 'Documentos por procesar', icono: 'documentos' },
  { href: '/expedientes', label: 'Expedientes', icono: 'expedientes' },
  { href: '/polizas', label: 'Pólizas', icono: 'polizas' },
  { href: '/endosos', label: 'Endosos (altas/bajas)', icono: 'documentos' },
  { href: '/consulta', label: 'Consulta de vigencia', icono: 'polizas' },
  { href: '/cobranza', label: 'Cobranza', icono: 'cobranza' },
  { href: '/recordatorios', label: 'Recordatorios', icono: 'cobranza' },
  { href: '/facturas', label: 'Facturas', icono: 'pagos' },
  { href: '/notas-credito', label: 'Notas de crédito', icono: 'pagos' },
  { href: '/pagos', label: 'Pagos', icono: 'pagos' },
  { href: '/usuarios', label: 'Usuarios', icono: 'usuarios' },
];

function iniciales(nombre: string) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function PanelShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [noLeidas, setNoLeidas] = useState(0);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [menuMovil, setMenuMovil] = useState(false);

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

  const Navegacion = (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const activo = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMenuMovil(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
              activo
                ? 'bg-white/15 font-medium text-white shadow-sm'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icono d={ICONOS[item.icono]} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar de escritorio */}
      <aside className="hidden w-64 shrink-0 flex-col bg-gradient-to-b from-marca to-marca-oscuro text-white lg:flex">
        <div className="px-5 py-5">
          <div className="inline-block rounded-lg bg-white p-2 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/arc-navy.png" alt="ARC soluciones" className="h-8 w-auto" />
          </div>
          <div className="mt-2 text-[11px] text-white/60">Seguros de flotas de transporte</div>
        </div>
        <div className="flex-1 px-3">{Navegacion}</div>
        <div className="px-3 pb-4">
          <div className="rounded-lg bg-white/10 px-3 py-2 text-[11px] text-white/70">
            Sesión iniciada como<br />
            <span className="font-medium text-white">{usuario.nombre}</span>
          </div>
        </div>
      </aside>

      {/* Cajón móvil */}
      {menuMovil && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuMovil(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-gradient-to-b from-marca to-marca-oscuro px-3 py-5 text-white">
            <div className="mb-4 inline-block rounded-lg bg-white p-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/arc-navy.png" alt="ARC soluciones" className="h-7 w-auto" />
            </div>
            {Navegacion}
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuMovil(true)}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Menú"
            >
              <Icono d="M3 12h18 M3 6h18 M3 18h18" />
            </button>
            <div className="hidden text-sm text-slate-500 sm:block">
              Panel de gestión
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={alternarNotificaciones}
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-marca"
                aria-label="Notificaciones"
              >
                <Icono d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0" />
                {noLeidas > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {noLeidas}
                  </span>
                )}
              </button>

              {abierto && (
                <div className="absolute right-0 z-10 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
                  <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">
                    Notificaciones
                  </div>
                  <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                    {notificaciones.length === 0 && (
                      <li className="px-4 py-6 text-center text-sm text-slate-400">
                        Sin notificaciones.
                      </li>
                    )}
                    {notificaciones.map((n) => (
                      <li key={n.id}>
                        <button
                          onClick={() => abrirNotificacion(n)}
                          className={`block w-full px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
                            n.leida ? 'text-slate-500' : 'font-medium text-slate-800'
                          }`}
                        >
                          {n.titulo}
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            {n.mensaje}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-marca text-xs font-semibold text-white">
                {iniciales(usuario.nombre)}
              </div>
              <div className="hidden leading-tight sm:block">
                <div className="text-sm font-medium text-slate-700">{usuario.nombre}</div>
                <div className="text-[11px] capitalize text-slate-400">{usuario.rol}</div>
              </div>
            </div>

            <button
              onClick={salir}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <Icono d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
