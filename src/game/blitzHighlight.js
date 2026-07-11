// src/game/blitzHighlight.js
//
// Blitz's map feedback -- deliberately does NOT follow
// stateHighlight.js's addLayer-once/setFilter idiom. That pattern fits
// Hint 2 well because only one highlight set is ever active at a time.
// Blitz needs up to two simultaneous sets (green correct + a red
// wrong state) that change on every tap and every round, so this uses
// MapLibre's setFeatureState instead: one fill layer + one outline layer,
// added once by useMapState.js (mode==='blitz'), each state polygon
// carrying a `blitzStatus` ('selected'|'correct'|'wrong'|null) as
// per-feature state. Changing a highlight is a setFeatureState call --
// no addLayer/removeLayer/setFilter here at all.
//
// Relies on the 'india-states' source's `promoteId: 'st_nm'` (added by
// useMapState.js) so each state's own name works directly as its
// feature-state id.

import { LAYER_IDS } from '../config.js';

const STATE_SOURCE_ID = 'india-states';
// Boundary polygon color -- deliberately NOT CATEGORY_META[site.category].color,
// to avoid clashing with the correct/wrong highlight palette regardless of
// which category is active. This blue matches useMapState.js's BLITZ_COLOR
// 'selected' entry -- already part of this feature's palette, and unused by
// the time REVEALING draws the boundary (selection only shows pre-Confirm),
// so it never collides.
const BOUNDARY_COLOR = '#3b82f6';
// Fallback only -- BlitzMap.jsx now passes zoomToBoundary() a fitPadding
// built from BlitzCard's real measured height (same pattern as
// resultLayer.js's zoomToSiteBoundary), since the expanded card's height
// varies with content (correctStates can list more than one state for
// border-spanning sites). This constant only applies if a caller omits
// fitPadding entirely.
const BOUNDARY_FIT_PADDING = { top: 60, bottom: 260, left: 40, right: 40 };

let paintedStates = []; // st_nm values currently carrying a non-null status
// Resolves once REVEALING's boundary fetch settles; null if the current
// site has none, or once clearBoundary() resets it for the next round.
// Same module-level shape as resultLayer.js's boundaryPromise.
let boundaryPromise = null;

function paint(map, stateName, status) {
  map.setFeatureState({ source: STATE_SOURCE_ID, id: stateName }, { blitzStatus: status });
  paintedStates.push(stateName);
}

/** SELECTING preview -- one state, blue. Called on every state tap. */
export function showSelection(map, stateName) {
  clearAll(map); // only one state is ever selected at a time
  if (stateName) paint(map, stateName, 'selected');
}

/**
 * REVEALING. Colors every state in `correctStates` green, plus `guessedState`
 * red if wrong. Then -- mirroring resultLayer.js's showResult() step 3 --
 * fetches and draws the site's actual boundary polygon automatically if it
 * has one (site.hasBoundary), same as Classic/Daily. Not click-gated: the
 * "Show Boundary" button (zoomToBoundary below) only zooms to whatever this
 * already drew.
 */
export async function showReveal(map, correctStates, guessedState, isCorrect, site) {
  clearAll(map);
  correctStates.forEach((s) => paint(map, s, 'correct'));
  if (!isCorrect && guessedState) paint(map, guessedState, 'wrong');

  boundaryPromise = site?.hasBoundary
    ? fetch(`/boundaries/${site.id}.geojson`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    : null;
  const geo = await boundaryPromise;
  if (!geo || !map.getSource(STATE_SOURCE_ID)) return; // no boundary, or map torn down mid-fetch

  map.addSource(LAYER_IDS.BLITZ_BOUNDARY, { type: 'geojson', data: geo });
  map.addLayer({
    id: `${LAYER_IDS.BLITZ_BOUNDARY}-fill`, type: 'fill', source: LAYER_IDS.BLITZ_BOUNDARY,
    paint: { 'fill-color': BOUNDARY_COLOR, 'fill-opacity': 0.2 },
  });
  map.addLayer({
    id: `${LAYER_IDS.BLITZ_BOUNDARY}-outline`, type: 'line', source: LAYER_IDS.BLITZ_BOUNDARY,
    paint: { 'line-color': BOUNDARY_COLOR, 'line-opacity': 0.7, 'line-width': 2 },
  });
}

/** Called at LOADING start (next site) and before every showSelection/showReveal. */
export function clearAll(map) {
  if (!map || !map.getSource(STATE_SOURCE_ID)) return;
  for (const s of paintedStates) {
    map.setFeatureState({ source: STATE_SOURCE_ID, id: s }, { blitzStatus: null });
  }
  paintedStates = [];
}

// Walks any GeoJSON Feature/FeatureCollection/Geometry and returns the
// [[west,south],[east,north]] bbox of every coordinate -- same flat-walk
// approach as resultLayer.js's boundsOfGeoJSON, duplicated locally rather
// than imported so this file stays decoupled from Classic/Daily's module
// (per BlitzMap.jsx's file-header note).
function boundsOfGeoJSON(geo) {
  const b = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      if (lng < b.west) b.west = lng;
      if (lng > b.east) b.east = lng;
      if (lat < b.south) b.south = lat;
      if (lat > b.north) b.north = lat;
    } else {
      coords.forEach(visit);
    }
  };
  (geo.type === 'FeatureCollection' ? geo.features : [geo]).forEach((f) => visit((f.geometry ?? f).coordinates));
  return Number.isFinite(b.west) ? [[b.west, b.south], [b.east, b.north]] : null;
}

/**
 * "Show Boundary" button -- zooms in tight on the polygon showReveal()
 * already drew. Reuses its boundaryPromise rather than re-fetching (an
 * already-resolved promise resolves on the next microtask, so this is
 * effectively instant once the fetch has landed). No-ops if the site has
 * no boundary, or nothing was drawn.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {object|null} [fitPadding] - same shape as BOUNDARY_FIT_PADDING;
 *   pass the caller's current measured card height so the guess panel
 *   doesn't cover the zoomed-in boundary. Falls back to the static
 *   BOUNDARY_FIT_PADDING if omitted.
 */
export async function zoomToBoundary(map, fitPadding = null) {
  if (!map || !boundaryPromise) return;
  const geo = await boundaryPromise;
  if (!geo || !map.getSource(LAYER_IDS.BLITZ_BOUNDARY)) return; // torn down mid-await
  const bounds = boundsOfGeoJSON(geo);
  if (bounds) map.fitBounds(bounds, { padding: fitPadding ?? BOUNDARY_FIT_PADDING, duration: 1200 });
}

/** Call on LOADING (next site) so a stale boundary never survives into the next round. */
export function clearBoundary(map) {
  boundaryPromise = null;
  if (!map) return;
  for (const id of [`${LAYER_IDS.BLITZ_BOUNDARY}-fill`, `${LAYER_IDS.BLITZ_BOUNDARY}-outline`]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(LAYER_IDS.BLITZ_BOUNDARY)) map.removeSource(LAYER_IDS.BLITZ_BOUNDARY);
}

// Hint button -- deliberately a filter-based layer pair (mirrors
// stateHighlight.js's HINT_FILL/HINT_OUTLINE idiom), NOT another
// setFeatureState blitzStatus value. It has to render simultaneously with
// whatever blitzStatus is already painted (a blue 'selected' state can sit
// inside the hinted region), and setFeatureState only holds one value per
// feature at a time -- a 'hint' status would stomp 'selected' the instant a
// tap lands inside the region. An independent filtered layer avoids that
// collision entirely and needs no per-feature bookkeeping.
const HINT_COLOR = '#f59e0b'; // amber -- distinct from selected(blue)/correct(green)/wrong(red)/boundary(blue)

/** Region-level hint -- fills+outlines every state in `regionStates` amber. Caller owns the 3s auto-hide timer. */
export function showHintRegion(map, regionStates) {
  if (!map || !map.getSource(STATE_SOURCE_ID) || !regionStates?.length) return;
  const filter = ['in', ['get', 'st_nm'], ['literal', regionStates]];

  if (map.getLayer(LAYER_IDS.BLITZ_HINT_FILL)) {
    map.setFilter(LAYER_IDS.BLITZ_HINT_FILL, filter);
  } else {
    map.addLayer({
      id: LAYER_IDS.BLITZ_HINT_FILL, type: 'fill', source: STATE_SOURCE_ID, filter,
      paint: { 'fill-color': HINT_COLOR, 'fill-opacity': 0.25 },
    });
  }

  if (map.getLayer(LAYER_IDS.BLITZ_HINT_OUTLINE)) {
    map.setFilter(LAYER_IDS.BLITZ_HINT_OUTLINE, filter);
  } else {
    map.addLayer({
      id: LAYER_IDS.BLITZ_HINT_OUTLINE, type: 'line', source: STATE_SOURCE_ID, filter,
      paint: { 'line-color': HINT_COLOR, 'line-width': 1.5, 'line-opacity': 0.9 },
    });
  }
}

/** Called after the 3s auto-hide timer, and defensively on LOADING (next site) so a stale hint never survives a round change. */
export function hideHintRegion(map) {
  if (!map) return;
  if (map.getLayer(LAYER_IDS.BLITZ_HINT_FILL)) map.removeLayer(LAYER_IDS.BLITZ_HINT_FILL);
  if (map.getLayer(LAYER_IDS.BLITZ_HINT_OUTLINE)) map.removeLayer(LAYER_IDS.BLITZ_HINT_OUTLINE);
}
