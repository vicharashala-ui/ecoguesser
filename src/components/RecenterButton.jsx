// src/components/RecenterButton.jsx
//
// Resets the map to its default India-wide view -- the same fitBounds call
// MapContainer.jsx makes on initial load (MAP_CONFIG.INDIA_BOUNDS). Shared
// by ClassicMap.jsx and DailyMap.jsx rather than duplicated, since both
// already hold the same mapRef contract.
//
// Stays visible through REVEALING (per direct request) -- the caller passes
// a `style` override with a `bottom` computed from BottomCard's real
// measured height during REVEALING (same cardRef.getBoundingClientRect()
// pattern already used for resultLayer.js's fitPadding), so this never sits
// underneath the expanded card. Outside REVEALING, no override is passed and
// RecenterButton.css's fixed 64px-pill-clearance default applies.

import { MAP_CONFIG } from '../config.js';
import './RecenterButton.css';

function IconCrosshair({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function RecenterButton({ mapRef, style }) {
  const handleClick = () => {
    mapRef.current?.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: 20 });
  };

  return (
    <button
      type="button"
      className="eg-recenter-btn"
      style={style}
      onClick={handleClick}
      aria-label="Reset map view"
      title="Reset map view"
    >
      <IconCrosshair />
    </button>
  );
}
