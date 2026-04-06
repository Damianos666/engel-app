import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { writeFileSync } from 'fs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // loadEnv() czyta wyłącznie z plików .env.* — nie widzi zmiennych z Vercel dashboard.
  // Vercel wstrzykuje je do process.env podczas buildu, więc używamy go jako fallback.
  const rawSupabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const supabaseHost = rawSupabaseUrl
    ? new URL(rawSupabaseUrl).hostname
    : null;

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
        includeAssets: ['logo.png', 'pwa-192.png'],
        manifest: {
          name: 'ENGEL Expert Academy',
          short_name: 'Expert Academy',
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
          // JS/CSS/HTML + czcionki woff2 — małe pliki, szybki pre-cache.
          // PNG i SVG celowo poza pre-cache: ikony PWA przeglądarka ma po install,
          // logo cachujemy runtime przy pierwszym żądaniu (patrz niżej).
          // Chunk pdf (~3MB) wykluczony — trafia do runtimeCaching poniżej.
          globPatterns: ['**/*.{js,css,html,woff2}'],
          globIgnores: [
            'version.json',
            '**/pdf-*.js',   // @react-pdf chunk — 3MB, lazy + runtime cache wystarczy
            '**/pwa-*.png',     // ikony PWA — tylko dla install prompt
            '**/certGenerator-*.js', // lazy — ładowany tylko przy pobraniu cert
            '**/certId-*.js',        // lazy — ładowany tylko przy pobraniu cert
            '**/browser-*.js',       // qrcode lib — lazy przez QRScanner
          ],
          maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
          runtimeCaching: [
            // ── Statyczne assety — CacheFirst, długi TTL ─────────────────────
            // logo.png i svg — nie zmieniają się między deployami (brak hash w nazwie).
            // CacheFirst: przeglądarka serwuje z cache, odświeża w tle co 30 dni.
            {
              urlPattern: /\.(png|svg|ico)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-assets',
                expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
            // ── PDF chunk — CacheFirst po pierwszym pobraniu ──────────────────
            // @react-pdf/renderer (~3MB). Ładowany tylko gdy ktoś kliknie
            // "Certyfikat". Po pierwszym pobraniu cachowany na 7 dni.
            {
              urlPattern: /\/pdf[-_.][a-z0-9]+\.js$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'pdf-chunk',
                expiration: { maxEntries: 2, maxAgeSeconds: 7 * 24 * 60 * 60 },
              },
            },
            ...(supabaseHost ? [
              // ── REST API — NetworkFirst, 5 min cache ─────────────────────────
              {
                urlPattern: new RegExp(`^https://${supabaseHost}/rest/v1/.*`, 'i'),
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'supabase-rest',
                  expiration: { maxEntries: 60, maxAgeSeconds: 5 * 60 },
                  networkTimeoutSeconds: 4,
                },
              },
              // ── AUTH — NetworkOnly (nigdy nie cache'uj tokenów) ──────────────
              {
                urlPattern: new RegExp(`^https://${supabaseHost}/auth/v1/.*`, 'i'),
                handler: 'NetworkOnly',
              },
              // ── EDGE FUNCTIONS — NetworkFirst, 30 s cache ────────────────────
              {
                urlPattern: new RegExp(`^https://${supabaseHost}/functions/v1/.*`, 'i'),
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'supabase-edge',
                  expiration: { maxEntries: 10, maxAgeSeconds: 30 },
                  networkTimeoutSeconds: 8,
                },
              },
            ] : []),
          ],
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          // ─── ROLE-BASED CODE SPLITTING ────────────────────────────────────
          // Każda rola pobiera tylko swój zestaw chunków:
          //
          //  klient  → vendor + shared-ui + client-tabs + shared-tabs + lazy(gram,quiz,pdf,qr)
          //  trener  → vendor + shared-ui + trainer     + shared-tabs + lazy(admin-codegen,admin-quiz)
          //  admin   → vendor + shared-ui + admin
          //
          // Workbox cache'uje każdy chunk osobno (content hash w nazwie).
          // Deploy który zmienia tylko TrainingTab → tylko client-tabs.HASH.js
          // jest pobierany od nowa. Pozostałe chunki serwowane są z cache.
          manualChunks(id) {
            // Vendor — react + react-dom. Zmienia się przy major upgradach.
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/'))
              return 'vendor';

            // PDF — @react-pdf/renderer (~3MB). Ładowany tylko przy pobieraniu cert.
            if (id.includes('@react-pdf'))
              return 'pdf';

            // Admin — cały panel admina. Tylko rola "admin".
            if (id.includes('/components/admin/'))
              return 'admin';

            // GramTab — lazy overlay gamifikacji. Ładowany na żądanie (przycisk 🔥).
            if (id.includes('GramTab'))
              return 'gram';

            // Quiz + nagrody — ładowane gdy użytkownik zaczyna quiz/tip.
            if (id.includes('QuizGame') || id.includes('QuizRewardModal') || id.includes('TipRewardModal'))
              return 'quiz';

            // QR Scanner — jsqr (~200KB). Ładowany tylko przy skanowaniu QR.
            if (id.includes('QRScannerTab'))
              return 'qr';

            // Trener — terminarz trenera. Tylko rola "trainer".
            if (id.includes('TrainerScheduleTab'))
              return 'trainer';

            // Taby klienta — Training, Catalog, Schedule. Tylko rola "client".
            if (id.includes('TrainingTab') || id.includes('CatalogTab') || id.includes('ScheduleTab'))
              return 'client-tabs';

            // Taby współdzielone klient+trener — Messages, Profile.
            if (id.includes('MessagesTab') || id.includes('ProfileTab'))
              return 'shared-tabs';
          },
        },
      },
    },
  }
})
