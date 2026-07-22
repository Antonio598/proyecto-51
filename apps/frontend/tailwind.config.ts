import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          DEFAULT: '#0f3d63',
          claro: '#1d5f92',
        },
      },
    },
  },
  plugins: [],
};

export default config;
