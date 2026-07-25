// src/components/MapLoadingOverlay.jsx
// Centered loading overlay shown over the map area in Daily/Classic/Blitz
// while `mapReady` is false -- gives animated feedback during the first
// style/tile/sprite/glyph load, which otherwise looks stuck. Shared by all
// three modes rather than duplicated per-component (single rotation-timer
// implementation).

import { useEffect, useState } from 'react';
import BrandSpinner from './BrandSpinner.jsx';
import './MapLoadingOverlay.css';

const ROTATION_MS = 2000;
// Cosmetic/time-based only -- not tied to real load milestones (decided:
// no per-message meaning, just reassurance that something's happening).
const LOADING_MESSAGES = [
  'Loading map…',
  'Fetching terrain…',
  'Drawing borders…',
  'Placing landmarks…',
  'Loading imagery…',
  'Preparing sites…',
  'Rendering layers…',
  'Loading labels…',
  'Syncing data…',
  'Almost ready…',
];
const SLOW_MESSAGE = 'Still loading — check your connection';

export default function MapLoadingOverlay({ active, slow }) {
  const [index, setIndex] = useState(0);

  // Stops rotating and freezes on SLOW_MESSAGE once `slow` flips true
  // (MAP_CONFIG.LOAD_SLOW_TIMEOUT_MS in config.js) -- cycling filler text
  // under a real "something's wrong" signal would bury it.
  useEffect(() => {
    if (!active || slow) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [active, slow]);

  if (!active) return null;

  return (
    <div className="eg-map-loading-overlay">
      <BrandSpinner size={40} />
      <p className="eg-map-loading-text" role="status" aria-live="polite">
        {slow ? SLOW_MESSAGE : LOADING_MESSAGES[index]}
      </p>
    </div>
  );
}
