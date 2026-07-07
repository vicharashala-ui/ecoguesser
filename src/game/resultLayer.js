// src/game/resultLayer.js
// Post-guess visualization: draws the line/pin/boundary reveal after a
// guess is confirmed.
//
// Wire-up (round state machine):
//   PLACING -> REVEALING:  await showResult(map, guess, site, { distanceKmOverride, fitPadding })
//   REVEALING -> LOADING:  clearResult(map)   (call BEFORE picking the next site)
//
// `guess` shape: { lat, lng }  (same shape MapContainer's marker already tracks)
// `site` shape: see config.js's `Site` type (uses centroid_lat/centroid_lng, NOT lat/lng)
//
// Distance is recomputed internally via haversine() so this module only needs
// (map, guess, site) -- pass opts.distanceKmOverride if you'd rather hand it the
// authoritative value already computed by useClassicRound's scoring call.

import { LAYER_IDS, CATEGORY_META, MAP_CONFIG } from '../config.js';
import { haversine } from './scoring.js';
import { fetchBoundary } from './boundaryCache.js';

const LINE_ANIMATION_MS = 600;
const FALLBACK_COLOR = '#16a34a';

// Fallback only -- ClassicMap.jsx normally passes a measured fitPadding
// based on BottomCard's actual rendered height (its expanded-card height
// varies with site.desc length, daily-only lines, etc., so a static guess
// here would be wrong for most sites). This is just what's used if no
// override is given.
const DEFAULT_FIT_PADDING = { top: 60, bottom: 260, left: 40, right: 40 };
const RESULT_FIT_DURATION_MS = 1700;
// easeInOutCubic -- gentle acceleration/deceleration rather than MapLibre's
// default easing, which reads as abrupt for a camera move this size.
const RESULT_FIT_EASING = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// MODULE-LEVEL state per spec -- reset on every LOADING entry via clearResult().
let boundaryPromise = null;
let animationFrameId = null;

function buildResultData(guess, site, distanceKm) {
  const from = [guess.lng, guess.lat];
  const to = [site.centroid_lng, site.centroid_lat];
  const distanceLabel = `${Math.round(distanceKm).toLocaleString()} km away`;

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        // `distance` lives here (not a separate midpoint point) so
        // RESULT_LABEL can use symbol-placement: 'line-center' -- that
        // centers the text directly on this line and auto-rotates/flips it
        // to stay upright no matter which way the line points.
        properties: { kind: 'line', distance: distanceLabel },
        // Starts collapsed to a zero-length line at `from` -- animateLine()
        // grows this out to `to` over LINE_ANIMATION_MS.
        geometry: { type: 'LineString', coordinates: [from, from] },
      },
      {
        type: 'Feature',
        properties: { kind: 'pin' },
        geometry: { type: 'Point', coordinates: to },
      },
      {
        type: 'Feature',
        properties: { kind: 'guess' },
        geometry: { type: 'Point', coordinates: from },
      },
    ],
  };
}

// Grows the 'line' feature's geometry from `from` to `to` in place, calling
// source.setData() each frame. Resolves once the line has fully drawn in --
// the caller uses this to know when it's safe to add RESULT_LABEL (spec step 2).
function animateLine(map, data, from, to) {
  return new Promise((resolve) => {
    const source = map.getSource(LAYER_IDS.RESULT_DATA);
    const start = performance.now();

    function step(now) {
      const t = Math.min(1, (now - start) / LINE_ANIMATION_MS);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      data.features[0].geometry.coordinates = [
        from,
        [from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased],
      ];
      source.setData(data);

      if (t < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        animationFrameId = null;
        resolve();
      }
    }
    animationFrameId = requestAnimationFrame(step);
  });
}

// Walks any GeoJSON Feature/FeatureCollection/Geometry and returns the
// [[west,south],[east,north]] bounding box of every coordinate in it. No
// turf dependency -- boundary files are small (a single park/reserve
// outline), so a flat walk is plenty fast.
function boundsOfGeoJSON(geo) {
  const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };

  const visitPoint = ([lng, lat]) => {
    if (lng < bounds.west) bounds.west = lng;
    if (lng > bounds.east) bounds.east = lng;
    if (lat < bounds.south) bounds.south = lat;
    if (lat > bounds.north) bounds.north = lat;
  };
  const visitCoords = (coords) => {
    if (typeof coords[0] === 'number') visitPoint(coords);
    else coords.forEach(visitCoords);
  };
  const visitGeometry = (geometry) => {
    if (geometry?.coordinates) visitCoords(geometry.coordinates);
  };

  if (geo.type === 'FeatureCollection') geo.features.forEach((f) => visitGeometry(f.geometry));
  else if (geo.type === 'Feature') visitGeometry(geo.geometry);
  else visitGeometry(geo);

  if (!Number.isFinite(bounds.west)) return null; // no coordinates found
  return [[bounds.west, bounds.south], [bounds.east, bounds.north]];
}

// Extends a [[w,s],[e,n]] box to also cover the given [lng,lat] points.
function extendBounds(box, points) {
  let [[west, south], [east, north]] = box;
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  }
  return [[west, south], [east, north]];
}

/**
 * Runs the full PLACING -> REVEALING reveal sequence: draws the line/pin,
 * kicks off the boundary fetch, and fits the camera to the reveal.
 * Safe to `await` -- resolves once the boundary fetch has settled (or been skipped).
 *
 * @param {object} [opts]
 * @param {number|null} [opts.distanceKmOverride] - use the hook's already-computed
 *   distanceKm instead of recomputing via haversine.
 * @param {object|null} [opts.fitPadding] - {top,bottom,left,right} px passed to
 *   fitBounds, e.g. BottomCard's measured height so the card never covers the
 *   reveal. Falls back to DEFAULT_FIT_PADDING if omitted.
 */
export async function showResult(map, guess, site, opts = {}) {
  if (!map) return;
  const { distanceKmOverride = null, fitPadding = null } = opts;
  const padding = fitPadding ?? DEFAULT_FIT_PADDING;

  // Kick off the boundary fetch immediately -- it runs in parallel with the
  // line/pin animation below (see the module-level boundaryPromise).
  boundaryPromise = fetchBoundary(site);

  const distanceKm =
    distanceKmOverride ?? haversine(guess.lat, guess.lng, site.centroid_lat, site.centroid_lng);
  const from = [guess.lng, guess.lat];
  const to = [site.centroid_lng, site.centroid_lat];
  const color = CATEGORY_META[site.category]?.color ?? FALLBACK_COLOR;
  const data = buildResultData(guess, site, distanceKm);

  // Zoom to the guess<->site pair right away, in parallel with the line/pin
  // animation below. This framing is what stays on screen through the whole
  // reveal now -- see the note above zoomToSiteBoundary() for why a later
  // boundary load no longer re-fits the camera on its own.
  map.fitBounds(extendBounds([from, from], [to]), {
    padding,
    duration: RESULT_FIT_DURATION_MS,
    easing: RESULT_FIT_EASING,
    maxZoom: MAP_CONFIG.MAX_ZOOM,
  });

  // Step 1: line + pin together.
  map.addSource(LAYER_IDS.RESULT_DATA, { type: 'geojson', data });

  map.addLayer({
    id: LAYER_IDS.RESULT_LINE,
    type: 'line',
    source: LAYER_IDS.RESULT_DATA,
    filter: ['==', ['get', 'kind'], 'line'],
    paint: {
      'line-color': '#f59e0b',
      'line-width': 2.5,
      'line-dasharray': [2, 3],
    },
  });

  map.addLayer({
    id: LAYER_IDS.CORRECT_PIN,
    type: 'circle',
    source: LAYER_IDS.RESULT_DATA,
    filter: ['==', ['get', 'kind'], 'pin'],
    paint: {
      'circle-radius': 7,
      'circle-color': color,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });

  map.addLayer({
    id: LAYER_IDS.GUESS_PIN,
    type: 'circle',
    source: LAYER_IDS.RESULT_DATA,
    filter: ['==', ['get', 'kind'], 'guess'],
    paint: {
      'circle-radius': 7,
      'circle-color': '#EA4335',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });

  await animateLine(map, data, from, to);

  // showResult could theoretically be superseded mid-animation (e.g. a very
  // fast Next Site click triggering clearResult). Bail rather than re-adding
  // layers onto a source that's already been torn down.
  if (!map.getSource(LAYER_IDS.RESULT_DATA)) return;

  // Step 2: label, only after the line has finished drawing. Reads
  // `distance` off the same 'line' feature RESULT_LINE uses -- placing it
  // with symbol-placement: 'line-center' centers the text on the line and
  // rotates it to match the line's bearing, flipping automatically to stay
  // upright, so it reads correctly over the line no matter which direction
  // the guess missed in.
  map.addLayer({
    id: LAYER_IDS.RESULT_LABEL,
    type: 'symbol',
    source: LAYER_IDS.RESULT_DATA,
    filter: ['==', ['get', 'kind'], 'line'],
    layout: {
      'text-field': ['get', 'distance'],
      'symbol-placement': 'line-center',
      'text-font': ['Noto Sans Bold'],
      'text-size': 16,
      'text-offset': [0, -1.1],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#1f2937',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2.8,
    },
  });

  // Step 3: boundary reveal, once the parallel fetch settles.
  const geo = await boundaryPromise;
  if (!geo || !map.getSource(LAYER_IDS.RESULT_DATA)) return;

  // Spec describes RESULT_BOUNDARY as a single "fill + outline" layer, but
  // fill-outline-color can't carry a custom width -- split into a fill layer
  // and a line layer sharing one source (LAYER_IDS.RESULT_BOUNDARY) so the
  // outline can be the specified 2px. Both derived ids are removed together
  // in clearResult().
  map.addSource(LAYER_IDS.RESULT_BOUNDARY, { type: 'geojson', data: geo });
  map.addLayer({
    id: `${LAYER_IDS.RESULT_BOUNDARY}-fill`,
    type: 'fill',
    source: LAYER_IDS.RESULT_BOUNDARY,
    paint: { 'fill-color': color, 'fill-opacity': 0.2 },
  });
  map.addLayer({
    id: `${LAYER_IDS.RESULT_BOUNDARY}-outline`,
    type: 'line',
    source: LAYER_IDS.RESULT_BOUNDARY,
    paint: { 'line-color': color, 'line-opacity': 0.7, 'line-width': 2 },
  });

  // Deliberately NOT auto-fitting to the boundary's own (usually much
  // tighter) bounds here -- that used to run unconditionally the moment the
  // fetch resolved, which yanked the camera in close enough to read the
  // polygon's exact shape but lost the guess<->site line in the process
  // (small park, guess several hundred km off: the "you missed by 300km"
  // framing from the fit above would vanish, replaced by a close-up of just
  // the site). The boundary fill/outline layers above are still drawn at
  // the current (wider, distance-showing) zoom -- visible as a small shape,
  // not necessarily legible in detail. zoomToSiteBoundary() below does the
  // tight fit this used to do automatically, on demand, for BottomCard's
  // "Show Site Boundary" button.
}

/**
 * Zooms in tight on the just-revealed site's boundary polygon -- the fit
 * showResult() used to always perform the instant its boundary fetch
 * resolved, now opt-in via BottomCard's "Show Site Boundary" button so the
 * initial reveal can stay at the wider guess<->site framing instead.
 *
 * Reuses showResult()'s own in-flight/already-settled boundaryPromise
 * rather than re-fetching -- awaiting an already-resolved promise resolves
 * on the next microtask, so this is effectively instant once the original
 * fetch has landed. No-ops if the current site has no boundary
 * (boundaryPromise is null, per showResult()) or its fetch failed/is still
 * pending when clearResult() tears it down.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {object|null} [fitPadding] - same shape as showResult()'s opts.fitPadding;
 *   pass the caller's current measured card height so the card doesn't cover the reveal.
 */
export async function zoomToSiteBoundary(map, fitPadding = null) {
  if (!map || !boundaryPromise) return;
  const geo = await boundaryPromise;
  if (!geo || !map.getSource(LAYER_IDS.RESULT_BOUNDARY)) return; // torn down mid-await

  const boundaryBounds = boundsOfGeoJSON(geo);
  if (!boundaryBounds) return;

  map.fitBounds(boundaryBounds, {
    padding: fitPadding ?? DEFAULT_FIT_PADDING,
    duration: RESULT_FIT_DURATION_MS,
    easing: RESULT_FIT_EASING,
    maxZoom: MAP_CONFIG.MAX_ZOOM,
  });
}

/** LOADING cleanup -- call before picking the next site. */
export function clearResult(map) {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  boundaryPromise = null;
  if (!map) return;

  for (const id of [
    LAYER_IDS.RESULT_LINE,
    LAYER_IDS.RESULT_LABEL,
    `${LAYER_IDS.RESULT_BOUNDARY}-fill`,
    `${LAYER_IDS.RESULT_BOUNDARY}-outline`,
    LAYER_IDS.CORRECT_PIN,
    LAYER_IDS.GUESS_PIN,
  ]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [LAYER_IDS.RESULT_DATA, LAYER_IDS.RESULT_BOUNDARY]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}
