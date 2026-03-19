import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { writeFileSync } from 'fs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseHost = env.VITE_SUPABASE_URL
    ? new URL(env.VITE_SUPABASE_URL).hostname
    : 'localhost'

  const buildTime = Date.now().toString();
  try { writeFileSync('public/version.json', JSON.stringify({ v: buildTime })); } catch(e) {}

  return {
    define: {
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.png', 'pwa-192.png', 'pwa-512.png'],
        manifest: {
          name: 'ENGEL expert academy',
          short_name: 'ENGEL EA',
          description: 'Aplikacja szkoleń ENGEL Expert Academy',
          theme_color: '#2C2C2C',
          background_color: '#EFEFEF',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
          globIgnores: ['version.json'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: new RegExp(`^https://${supabaseHost}/rest/v1/.*`, 'i'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-api',
                // BEZPIECZEŃSTWO: 5 minut zamiast 24h — przy współdzielonym urządzeniu
                // następny użytkownik nie zobaczy danych poprzedniego po wylogowaniu.
                expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
              },
            },
          ],
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Każda z tych bibliotek trafia do osobnego chunk'a
            // ładowanego lazy — nie blokuje pierwszego render'u
            'react-vendor':   ['react', 'react-dom'],
            'react-pdf':      ['@react-pdf/renderer'],
            'fullcalendar':   [
              '@fullcalendar/core',
              '@fullcalendar/react',
              '@fullcalendar/interaction',
              '@fullcalendar/resource-timeline',
            ],
          },
        },
      },
    },
  }
})
