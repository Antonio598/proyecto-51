import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ARC soluciones — Seguros de flotas',
  description: 'Sistema de gestión integral de seguros de flotas de ARC soluciones',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
