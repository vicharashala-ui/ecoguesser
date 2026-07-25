import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { LS_KEYS } from './config.js';
import './index.css';

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
// adds, and it's free: App/DailyMap/MapContainer above have already
// mounted and kicked off their own fetches (map style, sites JSON, tiles)
// by this point, so the game keeps loading at full speed behind the
// splash the entire time -- nothing here gates or slows that down.
//
// Kept short rather than long on purpose: DailyMap's own MapLoadingOverlay
// throbber now covers "map still loading" once the splash fades (it was
// previously the splash's implicit job to hide that gap), so there's no
// reason to hold the logo on screen any longer than the brand-moment floor
// itself needs.
const MIN_SPLASH_MS = 350;
const splashShownAt = performance.now();
requestAnimationFrame(() => {
  const splash = document.getElementById('eg-splash');
  if (!splash) return;
  const remaining = MIN_SPLASH_MS - (performance.now() - splashShownAt);
  setTimeout(() => {
    splash.classList.add('eg-splash-hide');
    // Belt-and-suspenders: transitionend can fail to fire (e.g. the tab
    // was backgrounded mid-fade), which would leave a display:none-free but
    // opacity:0/pointer-events:none div sitting in the DOM harmlessly --
    // fine visually, but this removes it outright so it can't linger.
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    setTimeout(() => splash.remove(), 500);
  }, Math.max(0, remaining));
});
