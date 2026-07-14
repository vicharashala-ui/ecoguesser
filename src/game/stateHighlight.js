// src/game/stateHighlight.js
// Hint 2: highlights a site's state(s) on the map.
//
// Wire-up (round state machine):
//   Hint 2 tapped:     showHint2(map, site)
//   Any -> LOADING:    hideHint2(map)
//
// Hint 1 (state name in the bottom-card pill) has no MapLibre layer and lives
// entirely in BottomCard's UI state -- nothing for this module to do there.
//
// Relies on the 'india-states' source added once by useMapState.js -- never
// re-added here.

import { LAYER_IDS } from '../config.js';

const STATE_SOURCE_ID = 'india-states';
const PULSE_PERIOD_MS = 1400;

let pulseFrameId = null;

function startPulse(map) {
  const start = performance.now();

  function frame(now) {
    if (!map.getLayer(LAYER_IDS.HINT_OUTLINE)) {
      pulseFrameId = null;
      return;
    }
    const phase = ((now - start) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
    const opacity = 0.4 + 0.6 * Math.abs(Math.sin(phase * Math.PI));
    map.setPaintProperty(LAYER_IDS.HINT_OUTLINE, 'line-opacity', opacity);
    pulseFrameId = requestAnimationFrame(frame);
  }
  pulseFrameId = requestAnimationFrame(frame);
}

/**
 * Highlights every state in `site.state` (always an array, even for
 * single-state sites). Always visible regardless of the Political
 * (Borders) toggle, since HINT_FILL/HINT_OUTLINE are independent layers
 * with no `visibility: 'none'` tie to STATE_LINES.
 */
export function showHint2(map, site) {
  if (!map || !map.getSource(STATE_SOURCE_ID)) return;

  const filter = ['in', ['get', 'st_nm'], ['literal', site.state]];

  if (map.getLayer(LAYER_IDS.HINT_FILL)) {
    map.setFilter(LAYER_IDS.HINT_FILL, filter);
  } else {
    map.addLayer({
      id: LAYER_IDS.HINT_FILL,
      type: 'fill',
      source: STATE_SOURCE_ID,
      filter,
      paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.25 },
    });
  }

  if (map.getLayer(LAYER_IDS.HINT_OUTLINE)) {
    map.setFilter(LAYER_IDS.HINT_OUTLINE, filter);
  } else {
    map.addLayer({
      id: LAYER_IDS.HINT_OUTLINE,
      type: 'line',
      source: STATE_SOURCE_ID,
      filter,
      paint: {
        'line-color': '#8b5cf6', 'line-width': 1.5, 'line-opacity': 1,
        // startPulse below drives line-opacity itself every frame -- map-style.json's
        // root-level "transition" would otherwise turn each of those 60/sec writes
        // into its own 300ms animation, and since a new one starts before the last
        // finishes, the rendered result is a heavily damped, near-flat opacity
        // instead of the intended sine pulse. duration:0 opts this one property
        // back out to instant, same as before that root transition existed.
        'line-opacity-transition': { duration: 0, delay: 0 },
      },
    });
    startPulse(map);
  }
}

/** Called at LOADING start. */
export function hideHint2(map) {
  if (pulseFrameId !== null) {
    cancelAnimationFrame(pulseFrameId);
    pulseFrameId = null;
  }
  if (!map) return;

  if (map.getLayer(LAYER_IDS.HINT_FILL)) map.removeLayer(LAYER_IDS.HINT_FILL);
  if (map.getLayer(LAYER_IDS.HINT_OUTLINE)) map.removeLayer(LAYER_IDS.HINT_OUTLINE);
}
