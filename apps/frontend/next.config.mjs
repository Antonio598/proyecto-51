import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // En un monorepo, Next debe rastrear desde la raíz para incluir las
  // dependencias compartidas en el build standalone. Sin esto, el contenedor
  // puede arrancar sin módulos y fallar en tiempo de ejecución.
  outputFileTracingRoot: path.join(aqui, '../../'),

  /**
   * Proxy del panel hacia el backend.
   *
   * Cuando ambos corren en el mismo contenedor, el navegador llama a
   * `/api/...` sobre el mismo dominio y Next lo reenvía al backend interno.
   * Así no hace falta exponer el backend ni incrustar su URL en el build.
   *
   * Si despliegas el backend por separado, define NEXT_PUBLIC_API_URL con su
   * URL absoluta: el navegador irá directo y esta regla no se usará.
   */
  async rewrites() {
    const backend = process.env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:3001';
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
