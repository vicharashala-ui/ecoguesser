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
        // App-shell only in the eager precache -- everything else (the
        // seven lazy() components below, plus their own helper/utility
        // chunks) is deliberately left out, so a fresh install only ever
        // downloads what render actually needs before becoming
        // interactive. The ~7MB of site/boundary GeoJSON in public/ is
        // similarly excluded -- forcing that whole dataset into the SW
        // install step would make first-load feel like it hung. Both are
        // handled by the runtimeCaching rules below instead, so each file
        // gets cached lazily the first time a round/tab/action actually
        // needs it.
        //
        // This is an ALLOWLIST -- globPatterns lists exactly what belongs
        // in the eager set -- not a denylist. An earlier version tried to
        // enumerate every lazy component by name instead (globIgnores:
        // ClassicMap-*, BlitzMap-*, DailySummary-*, Leaderboard-*,
        // StatsView-*, InfoModal-*, SideDrawer-*), but that only catches
        // the lazy() components themselves. Their own helper chunks --
        // shareImage.js (html-to-image work, only reachable from
        // Leaderboard's Share button), MilestoneToast (only reachable from
        // Classic/Blitz), api.js (only reachable from DailySummary/
        // Leaderboard/SideDrawer) -- don't match any of those literal
        // names, so all three kept silently leaking back into the eager
        // 1.3MB+ precache anyway (confirmed via a real build's sw.js
        // manifest, not just in theory). An allowlist can't leak the same
        // way: anything not named here is simply left for the
        // runtimeCaching rule below to pick up lazily, whether it's one of
        // today's helper chunks or one nobody's written yet -- the failure
        // mode for an unlisted chunk is "cached one visit later than
        // ideal", not "silently bloats every fresh install".
        globPatterns: [
          'index.html',
          'favicon.ico',
          // NOT manifest.webmanifest or the manifest icons here -- vite-
          // plugin-pwa already precaches the web manifest and its
          // referenced icons on its own, independently of this list;
          // naming them here too just double-precaches the same files
          // under duplicate (if identical) entries (confirmed via a real
          // build: the two mechanisms don't dedupe against each other).
          //
          // The app entry (index-*) and the three vendor/runtime chunks
          // manualChunks (above) splits out -- see the modulepreload tags
          // in a real `npm run build`'s dist/index.html for the ground
          // truth this list is meant to mirror.
          'assets/index-*.{js,css}',
          'assets/vendor-*.js',
          'assets/config-*.js',
          'assets/rolldown-runtime-*.js',
          'assets/*.woff2',
        ],
        // Never precache/cache the leaderboard API or the ArcGIS tile proxy:
        // scores and Daily's date-keyed selection must always hit the
        // network, and satellite tiles already have their own server-side
        // cache (functions/tiles proxy, 30-day TTL) -- double-caching them
        // client-side would just burn storage quota for no benefit and risk
        // serving stale imagery.
        navigateFallbackDenylist: [/^\/api\//, /^\/tiles\//],
        runtimeCaching: [
          // Match callbacks, NOT RegExps: Workbox tests a RegExp urlPattern
          // against the request's FULL href (https://ecoguesser.pages.dev/
          // api/...), so the previous /^\/api\//-anchored patterns could
          // never match anything -- both NetworkOnly guards were dead code
          // (verified against a real build's sw.js: re.exec(url.href) is
          // null). Nothing was caching these endpoints anyway, but only by
          // accident -- the extension-based rules below just happen not to
          // match extension-less API/tile URLs. Any future .json-suffixed
          // API route would have silently fallen into the 30-day SWR cache
          // below, which is exactly the stale-leaderboard/stale-imagery
          // failure these two rules exist to prevent. A pathname callback
          // matches the way the pattern always intended to.
          // (navigateFallbackDenylist above is unaffected -- NavigationRoute
          // denylists match against the pathname and were already correct.)
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/tiles/'),
            handler: 'NetworkOnly',
          },
          // OpenFreeMap TileJSON (/planet) -- the one mutable document on
          // that origin: it names the current deployment's tile URL paths,
          // which rotate on their redeploys. NetworkFirst (not CacheFirst/
          // SWR) so a live session always prefers the fresh document --
          // serving a stale one could point MapLibre at a purged
          // deployment's tile URLs -- while the cached copy still covers
          // offline opens and dead-network timeouts. index.html preloads
          // this same URL, so the online-path cost of NetworkFirst is
          // already paid in parallel with the JS download.
          {
            urlPattern: ({ url }) => url.origin === 'https://tiles.openfreemap.org' && url.pathname === '/planet',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ofm-tilejson',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // Everything else on the OFM origin: glyph PBFs (on the
          // first-paint path -- every label layer needs its fontstack/range
          // files, and country_label starts at minzoom 2) and vector tiles.
          // Previously uncached by the SW entirely: the extension rules
          // below can't reach cross-origin URLs (Workbox requires a
          // cross-origin RegExp to match from index 0), so repeat visits
          // re-paid whatever OFM's HTTP cache headers allowed, and offline
          // PWA opens lost the basemap outright. CacheFirst is safe for
          // both: glyph range files are immutable in practice, and tile
          // URLs embed the deployment path from the TileJSON above, so a
          // rotation produces brand-new URLs rather than stale hits (old
          // entries just age out via LRU/maxAge). ~300 entries x ~30-80KB
          // vector tiles bounds worst-case storage near 15-20MB;
          // purgeOnQuotaError lets the browser reclaim this cache first if
          // storage pressure ever bites.
          {
            urlPattern: ({ url }) => url.origin === 'https://tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'ofm-static',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
            },
          },
          // Site/boundary GeoJSON (+ india-states.topojson -- see
          // scripts/convertStatesTopo.js -- and protected-areas.json, the
          // site metadata App.jsx now fetches instead of import()'ing, see
          // src/App.jsx's loadSites()) and app icons: rarely change
          // between visits, safe to serve from cache first and refresh in
          // the background so repeat rounds don't re-download the same data.
          // maxEntries: 858 real files match this pattern today (835
          // per-site boundaries + protected-areas.json + physical-features
          // .geojson + india-states.topojson + 16 icons + map-style.json).
          // 1000 covers that with headroom for new protected areas before
          // Workbox's LRU eviction starts silently re-fetching older sites.
          {
            urlPattern: /\.(?:geojson|topojson|json|png|jpg|jpeg|svg)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'eg-static-data',
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
      // Dev-only convenience, MUST come before the general /tiles rule below
      // so it's matched first (Vite/http-proxy matches by startsWith in key
      // order) -- otherwise that broader rule also catches /tiles/dem/* and
      // forwards it to ArcGIS instead of here, producing a nonsense ArcGIS
      // URL (.../MapServer/tile/dem/{z}/{x}/{y}) that comes back as a 400
      // error page instead of any elevation data. Forwards straight to the
      // Terrarium DEM bucket -- same upstream functions/tiles/dem/[[path]].js
      // hits in production -- since `npm run dev` is plain Vite with no
      // Cloudflare Pages Functions support. .png is re-appended in rewrite
      // since Terrarium's actual S3 keys carry that extension (unlike the
      // extension-less client-side URL and the ArcGIS rule below).
      '/tiles/dem': {
        target: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles\/dem/, '') + '.png',
      },
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
