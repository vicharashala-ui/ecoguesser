import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Brand mark: white tiger-head cutout on the app's dark-green boundary
// color (#1c3b28, the same shade already used for country-boundary lines
// in both map palettes -- see BASE_VISUAL.BOUNDARY_COLOR in config.js).
// Icons themselves are pre-rasterized PNGs in public/icons/ (generated
// from src/components/tigerMarkPath.js), not regenerated at build time.
const THEME_GREEN = '#1c3b28';

// DailyMap is only ever reached via a dynamic import() (it's lazy() so
// Header/BottomNav can paint before the map chunk blocks anything -- see
// App.jsx), so Vite has no static <script>-level reference to preload its
// graph from: the browser doesn't discover any of it until JS execution
// reaches that import() call, itself gated behind index.js + vendor-preact
// + config downloading AND running first.
//
// This used to hardcode two filename prefixes (vendor-maplibre-,
// DailyMap-) and call it done, but DailyMap.jsx's real static import graph
// is bigger than that -- useDailyRound.js alone pulls in boundaryCache.js,
// scoring.js, haptics.js, and sound.js, and MapContainer.jsx pulls in
// maplibre-gl.css. Every one of those still-missing chunks was only ever
// discovered via Vite's runtime __vitePreload dependency map (injected the
// moment the import() call actually fires), which is strictly later than a
// static <link> the HTML parser finds immediately. Walking bundle metadata
// instead of guessing names means this stays correct if that graph shifts
// (a new hook import, a renamed shared chunk) without needing to be
// manually re-diffed against the build output again.
//
// bundle[chunk].imports / .dynamicImports are Rollup's own resolved
// fileName lists -- authoritative, unlike re-deriving them by regexing
// source text. dynamicImports is deliberately NOT walked: resultLayer.js/
// stateHighlight.js are dynamic on purpose (DailyMap.jsx's own
// preloadRoundEffects() comment explains why -- they're real seconds
// ahead-of-need already, no reason to undo that split here.
//
// Fix: inject <link rel="modulepreload"> (JS) / <link rel="preload"
// as="style"> (CSS, not rel="stylesheet" -- that would apply-and-block
// same as the entry CSS deferAppCss() below exists to avoid, even though
// these rules have nothing to match yet) for the full static graph,
// skipping anything the html already references (Vite's own entry-graph
// modulepreload output, or an earlier run of this same replace). Can't be
// static tags in index.html -- the hashed filenames don't exist until this
// build produces them -- so this reads the finished bundle in
// generateBundle and patches the already-emitted dist/index.html directly.
// enforce: 'post' + generateBundle (not transformIndexHtml) so it runs
// after Vite's own html plugin and VitePWA have both finished
// writing/emitting index.html.
//
// No fetchpriority set: OFM planet/map-style.json/protected-areas.json
// already hold fetchpriority="high" in index.html for the map-render path;
// giving this the same priority could pull bandwidth from those instead of
// just running alongside them. Revisit if real-world timing says otherwise.
function preloadMapChunks() {
  return {
    name: 'preload-map-chunks',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;

      const dailyMapChunk = Object.values(bundle).find(
        (f) => f.type === 'chunk' && f.fileName.startsWith('assets/DailyMap-')
      );
      if (!dailyMapChunk) return; // lazy split renamed/removed -- nothing to inject, not an error

      const jsFiles = new Set();
      const cssFiles = new Set();
      const seen = new Set();
      function walk(fileName) {
        if (seen.has(fileName)) return;
        seen.add(fileName);
        const chunk = bundle[fileName];
        if (!chunk || chunk.type !== 'chunk') return;
        jsFiles.add(fileName);
        for (const css of chunk.viteMetadata?.importedCss ?? []) cssFiles.add(css);
        for (const imp of chunk.imports) walk(imp);
      }
      walk(dailyMapChunk.fileName);

      const htmlSource = String(html.source);
      const isNew = (f) => !htmlSource.includes(`/${f}`); // skip whatever Vite's own entry-graph modulepreload already covers
      const links = [
        ...[...jsFiles].filter(isNew).map((f) => `    <link rel="modulepreload" crossorigin href="/${f}">`),
        ...[...cssFiles].filter(isNew).map((f) => `    <link rel="preload" as="style" href="/${f}">`),
      ];
      if (links.length === 0) return;
      html.source = htmlSource.replace('</head>', `\n${links.join('\n')}\n  </head>`);
    },
  };
}

// index-*.css (the entry stylesheet Vite auto-injects for src/index.css) is
// render-blocking by default -- the browser won't paint ANYTHING, including
// #eg-splash's own inline-<style>'d markup in index.html, until this file
// has downloaded. That silently defeats the whole point of #eg-splash being
// inlined specifically so it "paints the instant the HTML parser reaches
// that point" (see index.html's comment) -- on a slow connection the splash
// was paying this same network round-trip anyway, just invisibly.
//
// Fix: mark the link media="print" so it's still fetched at full priority
// but doesn't block rendering, then main.jsx flips it to media="all" and
// gates #eg-splash's fade-out on its 'load' event (alongside the existing
// MIN_SPLASH_MS floor) -- so the original guarantee (app is never visible
// unstyled underneath the splash) is preserved exactly, just decoupled from
// *painting the splash itself*. data-eg-app-css is main.jsx's hook to find
// this exact link without hardcoding its hashed filename.
//
// Same generateBundle/enforce:'post' string-patch approach as
// preloadMapChunks() below, for the same reason: the hashed filename
// doesn't exist until this build produces it.
function deferAppCss() {
  return {
    name: 'defer-app-css',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;

      const before = String(html.source);
      const after = before.replace(
        /<link rel="stylesheet" crossorigin href="(\/assets\/index-[^"]+\.css)">/,
        '<link rel="stylesheet" crossorigin href="$1" media="print" data-eg-app-css>'
      );
      if (after === before) return; // entry CSS chunk renamed/removed -- nothing to patch, not an error
      html.source = after;
    },
  };
}

// index.html's dev comments (documenting *why* each preload/meta tag
// exists) are 65% of the file's bytes -- 8.7KB of 13.4KB -- and Vite's
// build only minifies JS/CSS, never HTML, so they ship to every player
// verbatim. That's not just dead weight: the browser's preload scanner
// discovers <link rel=preload>/the module <script> tag in byte order as
// the response streams, so those comments sit in front of every
// fetchpriority="high" hint on the wire. Measured with this stripped:
// 5.2KB gzip -> 1.5KB gzip. Comments stay untouched in the source
// index.html for the next person reading this file -- only the built
// artifact is affected. Regex is safe here specifically because nothing
// in this file's inline <script>/<style> blocks contains the literal
// substring "-->" (the theme-detector IIFE and JSON-LD are both
// comment-free); if that ever changes, this would need to stop being a
// blind strip.
function stripHtmlComments() {
  return {
    name: 'strip-html-comments',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;
      html.source = String(html.source).replace(/<!--[\s\S]*?-->/g, '');
    },
  };
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // maplibre-gl and preact (aliased from react/react-dom -- see
            // @preact/preset-vite below) change far less often than app
            // code and are the bulk of the 1.4MB main chunk (see the
            // chunk-size warning at build time) -- isolating them means a
            // routine app deploy only invalidates the small app chunk;
            // returning players keep the vendor chunk cached.
            if (id.includes('maplibre-gl')) return 'vendor-maplibre';
            if (id.includes('/preact/')) return 'vendor-preact';
          }
        },
      },
    },
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      // Off by default: vite-plugin-pwa's dev-mode SW (dev-sw.js, a
      // different codepath from the real production Workbox SW) has been
      // observed to break MapLibre's module worker fetch entirely --
      // /maplibre/maplibre-gl-worker.mjs gets served back as a classic
      // script ("Cannot use import statement outside a module"), hanging
      // the map forever. Not reproducible via `npm run build` + Pages
      // deploy, only under `npm run dev` with this SW active -- confirmed
      // by unregistering it (DevTools -> Application -> Service Workers)
      // and the map loading immediately after.
      //
      // Set PWA_DEV_SW=1 npm run dev on the rare occasion you need to test
      // InstallPrompt.jsx's native/Android beforeinstallprompt banner
      // locally (it needs a registered SW to fire at all) -- just don't
      // expect the map to load in that same session.
      devOptions: {
        enabled: process.env.PWA_DEV_SW === '1',
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
          // The app entry (index-*), the three vendor/runtime chunks, and
          // daily-* (below) are what manualChunks (above) + Rollup's
          // automatic shared-chunk splitting produce -- see the
          // modulepreload tags in a real `npm run build`'s dist/index.html
          // for the ground truth this list is meant to mirror.
          'assets/index-*.{js,css}',
          'assets/vendor-*.js',
          'assets/config-*.js',
          'assets/rolldown-runtime-*.js',
          // MapLibre's worker + the shared chunk it imports (see the
          // setWorkerUrl comment in MapContainer.jsx for why these are
          // shipped from public/ instead of relying on MapLibre's own
          // broken self-relative worker-URL guess). Eager, not runtime-
          // cached: every map load needs this pair, so a first visit that
          // opens straight into Daily shouldn't pay a cold cache miss on
          // the one thing that makes the map render at all.
          'maplibre/*.mjs',
          // game/daily.js (getTodayString/getDailySites/etc, used by both
          // eager stats.js and lazy DailySummary/Leaderboard/DailyMap) no
          // longer gets its own shared chunk -- it's small enough that
          // Rollup now inlines it directly into index-* instead, which
          // index-*.{js,css} above already covers. Confirmed via a real
          // build: no assets/daily-*.js exists to precache (the PWA plugin
          // errors loudly -- "glob pattern doesn't match any files" -- if
          // this list ever points at a chunk that stops existing, so a
          // stale entry here doesn't fail silently). If a future change
          // reintroduces a genuinely shared eager/lazy chunk under a new
          // name, add it here the same way, following the reasoning above.
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
    preloadMapChunks(),
    deferAppCss(),
    stripHtmlComments(),
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
