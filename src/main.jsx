import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { LS_KEYS } from './config.js';
import { watchSystemTheme } from './utils/theme.js';
import './utils/installPromptCapture.js';
import './index.css';

watchSystemTheme();

// index.css's <link> is patched to media="print" at build time (see
// deferAppCss() in vite.config.js) so it doesn't block #eg-splash's first
// paint. Flipping it back to "all" here lets it actually apply as soon as
// it finishes downloading -- this doesn't trigger a second fetch, the
// browser already started downloading it the moment the tag was parsed,
// media only ever gated whether it blocked rendering / applied. appCssReady
// is awaited below (alongside the existing MIN_SPLASH_MS floor) before the
// splash is allowed to fade, so the app is still never shown unstyled
// underneath it -- just decoupled from painting the splash itself.
const appCssLink = document.querySelector('link[data-eg-app-css]');
const appCssReady = !appCssLink || appCssLink.sheet
  ? Promise.resolve()
  : new Promise((resolve) => appCssLink.addEventListener('load', resolve, { once: true }));
if (appCssLink) appCssLink.media = 'all';

// vite-plugin-pwa's virtual module -- only emits a real service worker at
// build time (`npm run build`); a no-op in `npm run dev` so local dev never
// fights a stale cached bundle. registerType: 'autoUpdate' (vite.config.js)
// means a new deploy's SW activates and takes over silently on next load --
// no "update available" prompt needed for a game with no unsaved state to
// lose mid-session.
//
// NOT { immediate: true }: that flag forces SW registration (and its
// ~1.84MB precache install fetch) to start the instant this script
// executes -- the exact moment MapLibre is also racing to fetch vector
// tiles/sprite/glyphs/DEM tiles for first paint. Two big fetch batches
// competing for one mobile pipe was a real contributor to slow first
// loads. Omitting the flag defers registration to the window 'load'
// event (vite-plugin-pwa's default), so the map's own critical-path
// requests get the bandwidth first and the SW installs quietly after.
registerSW();

// Dev-only cleanup: registerSW() above is a no-op in `npm run dev`, but a
// real SW registered by an earlier `npm run build` + `vite preview` (or a
// PWA_DEV_SW=1 run) on this same origin/port persists in the browser across
// unrelated dev sessions. That leftover SW intercepts the dev server's
// module requests and serves maplibre-gl-worker.mjs back as a classic
// script, breaking MapLibre with "Cannot use import statement outside a
// module". Auto-unregistering on every dev boot means this can't bite
// without anyone touching DevTools.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) reg.unregister();
  });
}

// Must run before the first render. DailySummary.jsx's POST /api/score
// reads LS_KEYS.UUID unconditionally; without this it stays null forever
// and every submission fails validation server-side.
if (!localStorage.getItem(LS_KEYS.UUID)) {
  localStorage.setItem(LS_KEYS.UUID, crypto.randomUUID());
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// index.html's #eg-splash paints before any of this file has even finished
// downloading, let alone executed -- it's not waiting on React. This just
// fades it back out once the real app has had its first paint underneath
// it, with a floor (MIN_SPLASH_MS) so the brand moment doesn't just flash
// by on a fast machine/cached load. That floor is the only "delay" this
// adds on a normal load, and it's free: App/DailyMap/MapContainer above
// have already mounted and kicked off their own fetches (map style, sites
// JSON, tiles) by this point, so the game keeps loading at full speed
// behind the splash the entire time -- nothing here gates or slows that
// down. appCssReady (above) is awaited alongside the floor purely as a
// FOUC guard for slow connections -- see deferAppCss()'s comment in
// vite.config.js -- and resolves immediately on any connection fast enough
// for index.css to have already beaten the floor.
//
// Kept short rather than long on purpose: DailyMap's own MapLoadingOverlay
// throbber now covers "map still loading" once the splash fades (it was
// previously the splash's implicit job to hide that gap), so there's no
// reason to hold the logo on screen any longer than the brand-moment floor
// itself needs.
const MIN_SPLASH_MS = 120;
const splashShownAt = performance.now();
requestAnimationFrame(() => {
  const splash = document.getElementById('eg-splash');
  if (!splash) return;
  const remaining = MIN_SPLASH_MS - (performance.now() - splashShownAt);
  const timeGate = new Promise((resolve) => setTimeout(resolve, Math.max(0, remaining)));
  Promise.all([timeGate, appCssReady]).then(() => {
    splash.classList.add('eg-splash-hide');
    // Belt-and-suspenders: transitionend can fail to fire (e.g. the tab
    // was backgrounded mid-fade), which would leave a display:none-free but
    // opacity:0/pointer-events:none div sitting in the DOM harmlessly --
    // fine visually, but this removes it outright so it can't linger.
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    setTimeout(() => splash.remove(), 500);
  });
});
