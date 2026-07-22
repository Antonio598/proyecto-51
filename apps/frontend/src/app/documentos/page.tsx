'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface DocumentoRow {
  id: string;
  nombreOriginal?: string;
  mime?: string;
  createdAt: string;
  cliente?: { id: string; razonSocial: string } | null;
  extraccion?: { id: string; estadoRevision: string } | null;
  metadata?: { numero?: string; pushName?: string };
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Extracción pendiente de revisión',
  aprobado: 'Aprobado',
  corregido: 'Corregido',
};

export default function BandejaPage() {
  const [docs, setDocs] = useState<DocumentoRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      setDocs(await api.bandejaDocumentos());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Documentos por procesar</h1>
          <p className="text-sm text-slate-500">
            Archivos recibidos por WhatsApp, asociados automáticamente al cliente por su número.
          </p>
        </div>
        <button onClick={cargar} className="rounded border px-3 py-1.5 text-sm">
          Actualizar
        </button>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">Archivo</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Remitente</th>
              <th className="px-4 py-2">Recibido</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  La bandeja está vacía.
                </td>
              </tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/documentos/${d.id}`} className="text-marca hover:underline">
                      {d.nombreOriginal ?? 'Sin nombre'}
                    </Link>
                    <div className="text-xs text-slate-400">{d.mime}</div>
                  </td>
                  <td className="px-4 py-2">
                    {d.cliente ? (
                      d.cliente.razonSocial
                    ) : (
                      <span className="text-amber-600">Sin identificar</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {d.metadata?.pushName ?? '—'}
                    <div className="text-xs text-slate-400">{d.metadata?.numero}</div>
                  </td>
                  <td className="px-4 py-2">
                    {new Date(d.createdAt).toLocaleString('es-MX')}
                  </td>
                  <td className="px-4 py-2">
                    {d.extraccion ? (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                        {ESTADO_LABEL[d.extraccion.estadoRevision] ?? d.extraccion.estadoRevision}
                      </span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Sin extraer
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
