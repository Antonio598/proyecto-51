import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          DEFAULT: '#0f3d63',
          claro: '#1d5f92',
          oscuro: '#0a2c48',
          suave: '#eef4f9',
        },
        acento: {
          DEFAULT: '#0ea5a4',
          claro: '#2dd4bf',
        },
      },
      boxShadow: {
        tarjeta: '0 1px 2px rgba(15, 61, 99, 0.04), 0 8px 24px -12px rgba(15, 61, 99, 0.15)',
        panel: '0 20px 60px -30px rgba(15, 61, 99, 0.35)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
