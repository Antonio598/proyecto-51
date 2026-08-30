'use client';

import { useEffect, useState } from 'react';
import { api, MetricasResumen } from '@/lib/api';

function mxn(v: number) {
  return Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

/** Gráfica de barras de crecimiento acumulado, en SVG puro (sin dependencias). */
function GraficaAcumulado({ porMes }: { porMes: MetricasResumen['porMes'] }) {
  const W = 720;
  const H = 260;
  const padX = 44;
  const padY = 24;
  const base = H - padY - 18; // línea base (deja espacio para etiquetas de mes)
  const alto = base - padY;
  const max = Math.max(1, ...porMes.map((m) => m.acumulado));
  const ancho = (W - padX * 2) / porMes.length;
  const anchoBarra = ancho * 0.6;

  // Cuatro marcas de referencia en el eje Y.
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: base - f * alto,
    valor: max * f,
  }));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img">
        {/* Rejilla + etiquetas del eje Y */}
        {marcas.map((m, i) => (
          <g key={i}>
            <line x1={padX} y1={m.y} x2={W - padX} y2={m.y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={padX - 8} y={m.y + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
              {max >= 1000 ? `${Math.round(m.valor / 1000)}k` : Math.round(m.valor)}
            </text>
          </g>
        ))}

        {/* Barras */}
        {porMes.map((m, i) => {
          const x = padX + i * ancho + (ancho - anchoBarra) / 2;
          const h = (m.acumulado / max) * alto;
          const y = base - h;
          return (
            <g key={m.mes}>
              <rect
                x={x}
                y={y}
                width={anchoBarra}
                height={Math.max(0, h)}
                rx={3}
                className="fill-marca"
              >
                <title>{`${m.mes}: ${mxn(m.acumulado)}`}</title>
              </rect>
              <text
                x={x + anchoBarra / 2}
                y={base + 14}
                textAnchor="middle"
                className="fill-slate-500 text-[9px]"
              >
                {m.mes}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function MetricasPage() {
  const [data, setData] = useState<MetricasResumen | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .metricasResumen()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar'));
  }, []);

  if (error) return <div className="rounded bg-red-50 px-3 py-2 text-red-700">{error}</div>;
  if (!data) return <div className="text-slate-400">Cargando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Métricas</h1>
        <p className="text-sm text-slate-500">
          Prima neta total de las pólizas vigentes (suma de las Pólizas Madre). Cada póliza vive 1
          año desde su emisión; al vencer deja de contar, salvo que se renueve.
        </p>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Prima neta total (vigente)</div>
          <div className="mt-1 text-3xl font-semibold text-marca">{mxn(data.primaNetaTotal)}</div>
        </div>
        <div className="rounded-lg bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Pólizas activas</div>
          <div className="mt-1 text-3xl font-semibold">{data.polizasActivas}</div>
          <div className="mt-1 text-xs text-green-700">Vigentes</div>
        </div>
        <div className="rounded-lg bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Vencidas por falta de pago</div>
          <div className="mt-1 text-3xl font-semibold text-red-600">
            {data.vencidasPorPago.cantidad}
          </div>
          <div className="mt-1 text-xs text-red-600">
            {mxn(data.vencidasPorPago.monto)} adeudado · {data.vencidasPorPago.madres} cliente(s)
          </div>
        </div>
        <div className="rounded-lg bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Pólizas no vigentes</div>
          <div className="mt-1 text-3xl font-semibold text-amber-600">
            {data.noVigentes.cantidad}
          </div>
          <div className="mt-1 text-xs text-amber-600">
            {mxn(data.noVigentes.primaNeta)} fuera del total · venció su año
          </div>
        </div>
      </div>

      {/* Gráfica de crecimiento */}
      <div className="rounded-lg bg-white p-5 shadow">
        <h2 className="mb-1 font-semibold">Crecimiento acumulado {data.anio}</h2>
        <p className="mb-4 text-sm text-slate-500">
          Prima neta vigente acumulada mes a mes durante el año.
        </p>
        <GraficaAcumulado porMes={data.porMes} />
      </div>
    </div>
  );
}
