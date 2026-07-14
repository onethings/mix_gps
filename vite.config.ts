import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

const DEFAULT_TRACCAR_URL = 'https://demo3.traccar.org';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_TRACCAR_URL || DEFAULT_TRACCAR_URL;
  const wsTarget = target.replace(/^http/, 'ws');

  // ⚠️ Production CORS note:
  // In dev mode, /api requests go through Vite's proxy, so no CORS issues.
  // In production/preview, the browser calls VITE_TRACCAR_URL directly.
  // If your frontend domain differs from the Traccar server domain,
  // add this to traccar.xml on the Traccar server:
  //   <entry key='web.origin'>https://your-frontend-domain.com</entry>
  // Do NOT use '*' — it exposes all vehicle/gps data to any website.
  const baseRaw = env.VITE_BASE_PATH && String(env.VITE_BASE_PATH).trim();
  const base = baseRaw ? `${baseRaw.replace(/\/$/, '')}/` : '/';

  const plugins = [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icons/*.svg',
        'custom/*.{webp,png}',
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webp}'],
        globIgnores: ['**/sprite.svg'], // sprite is runtime-cached separately
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kevin-gps-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^\/markers\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'kevin-gps-markers',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: 'Kevin GPS',
        short_name: 'Kevin GPS',
        description: 'GPS Fleet Tracking Platform',
        start_url: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2563eb',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
    }),
  ];

  // Bundle visualization (analysis only, not in production)
  if (env.VITE_ANALYZE) {
    plugins.push(
      visualizer({
        open: false,
        gzipSize: true,
        brotliSize: true,
        filename: 'dist/stats.html',
      }),
    );
  }

  // Sentry plugin in production builds (requires VITE_SENTRY_AUTH_TOKEN)
  if (env.VITE_SENTRY_AUTH_TOKEN) {
    plugins.push(
      sentryVitePlugin({
        authToken: env.VITE_SENTRY_AUTH_TOKEN,
        org: env.VITE_SENTRY_ORG,
        project: env.VITE_SENTRY_PROJECT,
        telemetry: false,
      }),
    );
  }

  return {
    base,
    plugins,
    resolve: {
      deduplicate: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-maplibre': ['maplibre-gl'],
            'vendor-ui': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-tabs',
              '@radix-ui/react-separator',
              '@radix-ui/react-slot',
              'lucide-react',
              'class-variance-authority',
            ],
          },
        },
      },
    },
    optimizeDeps: {
      include: [
        '@radix-ui/react-dialog',
        '@radix-ui/react-tabs',
        '@radix-ui/react-separator',
        '@radix-ui/react-slot',
        '@tanstack/react-virtual',
      ],
      // Only scan our own entry, not traccar-web-master/
      entries: ['index.html'],
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
        '/geocode': {
          target: 'https://nominatim.openstreetmap.org',
          changeOrigin: true,
          secure: true,
          rewrite: (path: string) => path.replace(/^\/geocode/, ''),
          headers: {
            'User-Agent': 'KevinGPS/1.0',
          },
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
        '/geocode': {
          target: 'https://nominatim.openstreetmap.org',
          changeOrigin: true,
          secure: true,
          rewrite: (path: string) => path.replace(/^\/geocode/, ''),
          headers: {
            'User-Agent': 'KevinGPS/1.0',
          },
        },
      },
    },
  };
});
