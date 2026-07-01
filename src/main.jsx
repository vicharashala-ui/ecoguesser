import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { LS_KEYS } from './config.js';
import './index.css';

// Section 9 -- must run before the first render. DailySummary.jsx's POST
// /api/score reads LS_KEYS.UUID unconditionally; without this it stays
// null forever and every submission fails validation server-side. This was
// missing until v8.19 -- caught cross-checking main.jsx against the spec
// while building the side drawer that was supposed to live next to it.
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
