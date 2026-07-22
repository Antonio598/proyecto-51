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
};

export default nextConfig;
