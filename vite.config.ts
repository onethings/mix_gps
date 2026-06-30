import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const DEFAULT_TRACCAR_URL = 'https://demo3.traccar.org';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_TRACCAR_URL || DEFAULT_TRACCAR_URL;
  const wsTarget = target.replace(/^http/, 'ws');
  const baseRaw = env.VITE_BASE_PATH && String(env.VITE_BASE_PATH).trim();
  const base = baseRaw ? `${baseRaw.replace(/\/$/, '')}/` : '/';

  return {
    base,
    plugins: [react()],
    resolve: {
      deduplicate: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    optimizeDeps: {
      include: [
        '@radix-ui/react-dialog',
        '@radix-ui/react-tabs',
        '@radix-ui/react-separator',
        '@radix-ui/react-slot',
      ],
    },
    server: {
      port: 3001,
      proxy: {
        '/api/socket': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
          secure: true,
        },
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
          cookieDomainRewrite: 'localhost',
        },
      },
    },
    preview: {
      port: 3001,
      proxy: {
        '/api/socket': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
          secure: true,
        },
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
