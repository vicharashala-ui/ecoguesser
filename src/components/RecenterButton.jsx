// src/components/RecenterButton.jsx
//
// Resets the map to its default India-wide view -- the same fitBounds call
// MapContainer.jsx makes on initial load (MAP_CONFIG.INDIA_BOUNDS). Shared
// by ClassicMap.jsx and DailyMap.jsx rather than duplicated, since both
// already hold the same mapRef contract.
//
// Hidden during REVEALING at both call sites: dragPan is locked then
// (useMapState's lockInteraction), and the map is already auto-fit to the
// result via resultLayer.js's showResult -- recentering would just fight
// that, and the expanded BottomCard would overlap this button's fixed
// position anyway.

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

export default function RecenterButton({ mapRef }) {
  const handleClick = () => {
    mapRef.current?.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: 20 });
  };

  return (
    <button
      type="button"
      className="eg-recenter-btn"
      onClick={handleClick}
      aria-label="Reset map view"
      title="Reset map view"
    >
      <IconCrosshair />
    </button>
  );
}
