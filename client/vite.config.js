import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// Note: a global `crypto` polyfill for Node 18 is preloaded via the build
// script (scripts/polyfill-crypto.cjs) so the workbox SW generator works.

// Proxy /api to the Express backend during development so the frontend can use
// same-origin relative URLs.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache the built app shell; also ship these static assets.
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'garuda-logo.png'],
      manifest: {
        name: 'Garuda — AI Interview Coach',
        short_name: 'Garuda',
        description:
          'Practice, analyze, improve. Upload your resume, pick a role, and run an adaptive voice interview with instant feedback.',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell (HTML/CSS/JS/icons) is precached for instant load and
        // offline launch. API calls always go to the network so interview
        // data is never stale — falling back gracefully when offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly',
            method: 'GET',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
