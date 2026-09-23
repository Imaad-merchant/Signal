import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  logLevel: 'error',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'logo.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Donna',
        short_name: 'Donna',
        description: 'Donna — your chief of staff',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#1e1f20',
        theme_color: '#1e1f20',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Network-first, NOT precache-the-shell. Precaching the app shell +
        // navigateFallback meant returning users kept getting a stale index.html
        // (and therefore stale JS) long after a deploy — every UI change stayed
        // invisible while /api changes (denylisted) still landed. Now: online
        // always fetches the current build; offline falls back to the last one seen.
        globPatterns: ['**/*.{ico,png,svg,webmanifest}'], // icons/manifest only
        // Add push/notification handlers without touching the caching strategy.
        importScripts: ['/push-sw.js'],
        // Disable the default navigateFallback → precached index.html (that was the
        // stale-shell). Navigations are handled network-first below instead.
        navigateFallback: null,
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Page navigations: try the network first (Vercel's SPA rewrite serves
            // index.html for deep links like /cowork), fall back to cache offline.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-html',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 8 },
            },
          },
          {
            // JS/CSS/workers: network-first so a new build's assets load immediately.
            urlPattern: ({ request }) => ['script', 'style', 'worker'].includes(request.destination),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-assets',
              expiration: { maxEntries: 80 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split big vendor libs into their own long-cacheable chunks so the main
        // bundle is smaller and a lib update doesn't bust the whole app cache.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory')) return 'charts';
          if (id.includes('firebase') || id.includes('@firebase')) return 'firebase';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('dompurify')) return 'dompurify';
          return undefined;
        },
      },
    },
  },
})
