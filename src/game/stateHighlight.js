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

const PULSE_PERIOD_MS = 1400;
const NO_HINT2_FILTER = ['in', ['get', 'st_nm'], ['literal', []]];

// Per-map pulse state -- WeakMap, not a single module-level variable.
// ClassicMap and DailyMap each hold their own MapLibre map instance but
// both import this one module and stay mounted simultaneously (App.jsx
// keeps every mode's map alive via display:none, never unmounted), so a
// shared boolean/frame-id here would let one mode's hideHint2 stop the
// other mode's still-running pulse if both happened to have Hint 2 up at
// once. Keyed by map instance so each pulse loop only ever observes (and
// stops on) its own map's flag.
const pulseActive = new WeakMap();

function startPulse(map) {
  const start = performance.now();

  function frame(now) {
    if (pulseActive.get(map) !== true) return; // hideHint2 already stopped this map's pulse
    const phase = ((now - start) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
    const opacity = 0.4 + 0.6 * Math.abs(Math.sin(phase * Math.PI));
    map.setPaintProperty(LAYER_IDS.HINT_OUTLINE, 'line-opacity', opacity);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/**
 * Highlights every state in `site.state` (always an array, even for
 * single-state sites). Always visible regardless of the Political
 * (Borders) toggle, since HINT_FILL/HINT_OUTLINE are independent layers
 * with no `visibility: 'none'` tie to STATE_LINES.
 *
 * HINT_FILL/HINT_OUTLINE are added once, ever, by useMapState.js
 * (mode!=='blitz') -- this function only ever calls setFilter on them now.
 * Cycling them via addLayer/removeLayer on every show/hide (the previous
 * approach) risked the same flicker Blitz's region hint had: a freshly
 * addLayer'd layer's first painted frame can still reflect the previous
 * round's filter result for one frame before the new filter applies.
 */
export function showHint2(map, site) {
  if (!map || !map.getLayer(LAYER_IDS.HINT_FILL)) return;

  const filter = ['in', ['get', 'st_nm'], ['literal', site.state]];
  map.setFilter(LAYER_IDS.HINT_FILL, filter);
  map.setFilter(LAYER_IDS.HINT_OUTLINE, filter);

  if (!pulseActive.get(map)) {
    pulseActive.set(map, true);
    startPulse(map);
  }
}

/** Called at LOADING start. */
export function hideHint2(map) {
  if (!map) return;
  pulseActive.set(map, false); // frame() sees this on its next tick and stops scheduling itself
  if (!map.getLayer(LAYER_IDS.HINT_FILL)) return;
  map.setFilter(LAYER_IDS.HINT_FILL, NO_HINT2_FILTER);
  map.setFilter(LAYER_IDS.HINT_OUTLINE, NO_HINT2_FILTER);
}
