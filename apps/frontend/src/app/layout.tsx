import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CRM Seguros de Flotas',
  description: 'Sistema de gestión integral para el despacho de seguros de flotas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
