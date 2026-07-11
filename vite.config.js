import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Brand mark: white tiger-head cutout on the app's dark-green boundary
// color (#1c3b28, the same shade already used for country-boundary lines
// in both map palettes -- see BASE_VISUAL.BOUNDARY_COLOR in config.js).
// Icons themselves are pre-rasterized PNGs in public/icons/ (generated
// from src/components/tigerMarkPath.js), not regenerated at build time.
const THEME_GREEN = '#1c3b28';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // maplibre-gl and react/react-dom change far less often than
            // app code and are the bulk of the 1.4MB main chunk (see the
            // chunk-size warning at build time) -- isolating them means a
            // routine app deploy only invalidates the small app chunk;
            // returning players keep the vendor chunk cached.
            if (id.includes('maplibre-gl')) return 'vendor-maplibre';
            if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
          }
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registers a real (if minimal) service worker under `npm run dev`
      // too, not just production builds -- without this, Chrome's
      // beforeinstallprompt criteria (a registered SW is one of them) are
      // never met in dev, so InstallPrompt.jsx's native/Android banner has
      // nothing to hook into and silently never appears while testing
      // locally. Trade-off: dev now has a SW in play, so if a later code
      // change doesn't seem to show up, that's the SW serving a cached
      // response rather than a real bug -- hard-refresh, or DevTools ->
      // Application -> Service Workers -> Unregister, clears it.
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: ['icons/safari-pinned-tab.svg'],
      manifest: {
        name: 'EcoGuesser',
        short_name: 'EcoGuesser',
        description: "Guess India's national parks, wildlife sanctuaries, tiger reserves, biosphere reserves, and Ramsar wetlands from the map.",
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: THEME_GREEN,
        theme_color: THEME_GREEN,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-shell only in the eager precache -- JS/CSS/HTML are
        // content-hashed by Vite, so precaching them is free (a new deploy
        // just ships new filenames). The ~7MB of site/boundary GeoJSON in
        // public/ is deliberately NOT precached here -- forcing that whole
        // dataset into the SW install step would make first-load feel like
        // it hung. It's handled by the CacheFirst-style runtimeCaching rule
        // below instead, so each file gets cached lazily the first time a
        // round actually needs it.
        globPatterns: ['**/*.{js,css,html,woff2,ico}'],
        // The glob above still matches every chunk in dist/, including the
        // seven components App.jsx deliberately code-splits via lazy() --
        // ClassicMap/BlitzMap (only mount once their tab is opened),
        // DailySummary/Leaderboard (only after a Daily round completes),
        // StatsView (Stats tab only), InfoModal/SideDrawer (only once
        // opened). Precaching them anyway forces every one of those
        // fetches into the SW install step on first visit, which defeats
        // the point of code-splitting them out of the initial bundle in
        // the first place and burns bandwidth a player may never need
        // (e.g. someone who only ever plays Daily never needs Blitz's
        // chunk). globIgnores drops them from the eager manifest; the
        // runtimeCaching rule below still caches each one, just lazily,
        // the first time its tab/action is actually used. Vite names each
        // chunk after its source component by default (verified via
        // `npm run build`: ClassicMap-*.js, BlitzMap-*.js, etc.), so these
        // patterns need updating only if a component here is renamed.
        globIgnores: [
          '**/ClassicMap-*',
          '**/BlitzMap-*',
          '**/DailySummary-*',
          '**/Leaderboard-*',
          '**/StatsView-*',
          '**/InfoModal-*',
          '**/SideDrawer-*',
        ],
        // Never precache/cache the leaderboard API or the ArcGIS tile proxy:
        // scores and Daily's date-keyed selection must always hit the
        // network, and satellite tiles already have their own server-side
        // cache (functions/tiles proxy, 30-day TTL) -- double-caching them
        // client-side would just burn storage quota for no benefit and risk
        // serving stale imagery.
        navigateFallbackDenylist: [/^\/api\//, /^\/tiles\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^\/tiles\//,
            handler: 'NetworkOnly',
          },
          // Site/boundary GeoJSON (+ india-states.topojson -- see
          // scripts/convertStatesTopo.js) and app icons: rarely change
          // between visits, safe to serve from cache first and refresh in
          // the background so repeat rounds don't re-download the same data.
          {
            urlPattern: /\.(?:geojson|topojson|png|jpg|jpeg|svg)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'eg-static-data',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Covers the lazy route chunks excluded from the eager precache
          // above (ClassicMap/BlitzMap/DailySummary/Leaderboard/StatsView/
          // InfoModal/SideDrawer). CacheFirst -- not StaleWhileRevalidate --
          // is safe here specifically because every JS/CSS asset Vite
          // emits is content-hashed: the filename itself changes on any
          // code change, so a cached response can never go stale under a
          // given URL and there's no need to ever re-check the network.
          // First tab open / action after a deploy fetches from network
          // and caches; every visit after that (same deploy) is instant.
          {
            urlPattern: /\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'eg-lazy-chunks',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // Dev-only convenience: `npm run dev` is plain Vite with no Cloudflare
      // Pages Functions support, so /tiles/* would otherwise fall through to
      // the SPA fallback (index.html) instead of hitting our tile proxy.
      // This forwards straight to ArcGIS so satellite view is testable
      // locally. NOT used in production -- Cloudflare Pages runs the real
      // caching proxy at functions/tiles/[[path]].js instead. Note this
      // bypasses that cache, so each local reload re-hits ArcGIS directly --
      // fine for occasional dev testing, but avoid leaving satellite view
      // toggled on for long unattended sessions.
      '/tiles': {
        target: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles/, ''),
      },
    },
  },
});
