import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    // Vercel deployments use the shared API by default. An explicit mock mode remains
    // available for a deliberately separate browser demo; no failure falls back to it.
    define:
      process.env.VERCEL === '1' && env.VITE_DATA_MODE !== 'mock'
        ? { 'import.meta.env.VITE_DATA_MODE': JSON.stringify('api') }
        : {},
    server: {
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${process.env.MOCK_PORT || env.MOCK_PORT || 3001}`,
          changeOrigin: false,
          xfwd: true,
        },
      },
    },
  };
});
