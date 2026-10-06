import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // OPENROUTER_KEY is deliberately client-side (personal build, see chat.ts).
  // Vite only exposes VITE_* by default, so allowlist this one name exactly.
  envPrefix: ['VITE_', 'OPENROUTER_KEY'],
  server: {
    // Cloudflare quick tunnels hand out a random *.trycloudflare.com host
    // per tunnel, so match the suffix instead of pinning one hostname.
    allowedHosts: ['.trycloudflare.com'],
  },
  plugins: [
    react(),
    VitePWA({
      // Explicit prompt: user finishes their session, then updates.
      // Silent background reload would destroy in-progress reviews.
      registerType: 'prompt',
      strategies: 'generateSW',
      // Explicit globs — index/ (admin dict, ~2.3 MB) must stay out of the
      // install precache; it is runtime-cached on first admin search instead.
      // Only .md files live here: JSON (deck, hanzi-data) and word clips are
      // covered by workbox globPatterns below, whose globIgnores correctly
      // drops ex-*.mp3 — listing them here too would bypass globIgnores and
      // duplicate manifest entries.
      includeAssets: ['assets/deck/*.md'],
      devOptions: {
        enabled: false,
      },
      workbox: {
        // Word clips (1.8 MB) precache for offline review; example clips
        // (3.4 MB) load on tap via the starter-deck-audio runtime cache.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,mp3,json}', 'offline.html'],
        // Admin dictionary indexes (~2.3 MB) are admin-only — never precache
        // them for every install; runtime NetworkFirst serves the admin UI.
        globIgnores: ['**/assets/deck/index/**', '**/assets/deck/audio/ex-*.mp3'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/deck\/index\/.*\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'admin-dict-index',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/assets\/deck\/audio\/.*\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'starter-deck-audio',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Chanki',
        short_name: 'Chanki',
        description:
          'Four-sided Chinese flashcards with spaced repetition — character, pinyin, meaning and tone on every card. Works offline.',
        start_url: '/',
        scope: '/',
        id: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#131110',
        theme_color: '#131110',
        categories: ['education'],
        icons: [
          {
            src: '/icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
