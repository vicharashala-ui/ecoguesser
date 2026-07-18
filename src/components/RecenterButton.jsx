// src/components/RecenterButton.jsx
//
// Resets the map to its default India-wide view -- the same
// MAP_CONFIG.INDIA_BOUNDS/FIT_PADDING framing MapContainer.jsx sets up front
// (via the constructor's bounds/fitBoundsOptions, so it's already in place
// on the very first frame). Shared by ClassicMap.jsx and DailyMap.jsx rather
// than duplicated, since both already hold the same mapRef contract.
//
// Stays visible through REVEALING -- the caller passes a `style` override
// with a `bottom` computed from BottomCard's real measured height during
// REVEALING (same cardRef.getBoundingClientRect() pattern already used for
// resultLayer.js's fitPadding), so this never sits underneath the expanded
// card. Outside REVEALING, no override is passed and RecenterButton.css's
// fixed 64px-pill-clearance default applies.

import { memo } from 'react';
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

// @param disabled: boolean -- Daily passes `paused` here. The pause effect
// in DailyMap.jsx only disables MapLibre's own pan/zoom handlers, which
// doesn't cover this button's direct fitBounds() call (handler-enabled
// state has no bearing on programmatic camera moves), so this needs its
// own guard to keep the map frozen while paused.
// memo(): same per-second countdown-tick reasoning as MapContainer.jsx's
// memo -- during an active round, `style` is undefined (the object-literal
// override only exists during REVEALING, when the timer is paused anyway)
// and mapRef/disabled are tick-stable, so every tick's re-render here was
// a no-op reconcile this now skips.
export default memo(RecenterButton);

function RecenterButton({ mapRef, style, disabled = false }) {
  const handleClick = () => {
    if (disabled) return;
    mapRef.current?.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: MAP_CONFIG.FIT_PADDING });
  };

  return (
    <button
      type="button"
      className="eg-recenter-btn"
      style={style}
      onClick={handleClick}
      disabled={disabled}
      aria-label="Reset map view"
      title="Reset map view"
    >
      <IconCrosshair />
    </button>
  );
}
