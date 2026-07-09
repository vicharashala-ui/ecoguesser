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
registerSW({ immediate: true });

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
