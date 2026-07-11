import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import '../styles/maplibre-gl-trimmed.css';
import { MAP_STYLE, MAP_CONFIG } from '../config.js';
import { TIGER_MARK_VIEWBOX, TIGER_MARK_PATH } from './tigerMarkPath';
import './MapContainer.css';

// Guess marker: just the tiger head, nothing else. Its own shape tapers to
// a point at the chin, the same role the old teardrop's tip played, and
// anchor: 'bottom' aligns the box's bottom edge to the guess coordinate.
//
// The path data is fundamentally line-art (thin connected strokes), not a
// solid silhouette with a few cutout holes -- fill-rule:nonzero fills the
// whole enclosed shape solid, while fill-rule:evenodd renders only the thin
// strokes themselves. So: red nonzero underneath for the solid dominant
// fill, white evenodd on top for the thin outline/eyes/nose/stripe detail
// lines -- two copies of the same TIGER_MARK_PATH, no separate outline
// asset to hand-trace, no backing shape, no shadow.
const GUESS_PIN_SVG = `
  <svg width="32" height="37" viewBox="${TIGER_MARK_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
    <path d="${TIGER_MARK_PATH}" fill="#EA4335" fill-rule="nonzero"/>
    <path d="${TIGER_MARK_PATH}" fill="#ffffff" fill-rule="evenodd"/>
  </svg>`;

// @param mapRef: React.MutableRefObject<maplibregl.Map|null>
// @param onMapClick: (lat: number, lng: number) => void -- fired on map tap;
//   wire this straight to useClassicRound's handleMapClick.
// @param guess: {lat:number, lng:number} | null -- the player's current pin
//   position from useClassicRound. null removes the marker (e.g. on LOADING).
// @param mapStyle: string -- style URL/path, defaults to MAP_STYLE. BlitzMap.jsx
//   overrides this with MAP_STYLE_BLITZ (see config.js).
// @param guessMarkerVisible: boolean -- hides the tiger-head marker without
//   removing it, so resultLayer.js's plain guess dot (drawn at the same
//   coordinate during REVEALING) is the only thing shown at that spot.
export default function MapContainer({ mapRef, onMapClick, guess, mapStyle = MAP_STYLE, guessMarkerVisible = true }) {
  const containerRef = useRef(null);
  const markerRef = useRef(null);

  // onMapClick is read through a ref inside the 'click' listener below so a
  // new callback identity on re-render doesn't require tearing down and
  // re-attaching the listener -- same stale-closure fix already applied to
  // useCountdownTimer.js's onExpire, after useMapState's setPoliticalNames
  // hit this exact class of bug.
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      // DEM (hillshade + color-relief) and vector tiles are separate
      // sources fetched independently -- 6 was throttling both below
      // MapLibre's own default (16), which is why DEM tiles lagged behind
      // vector tiles on first paint (the ocean-tint flash). Raising this
      // lets the browser's HTTP/2 connection actually run tiles in
      // parallel instead of queuing them.
      maxParallelImageRequests: 16,
      // Default 300ms cross-fade between tile fade-in states adds a
      // visible transition frame on every tile load, most noticeable on
      // the DEM layers. 0 makes tiles paint immediately once decoded.
      fadeDuration: 0,
      // Skips the HTTP revalidation round-trip for tiles already in the
      // browser cache (e.g. re-opening Classic/Daily after Blitz, or a
      // page refresh) -- pure win since none of these tile sources change.
      refreshExpiredTiles: false,
      maxBounds: MAP_CONFIG.MAX_BOUNDS,
      minZoom: MAP_CONFIG.MIN_ZOOM,
      maxZoom: MAP_CONFIG.MAX_ZOOM,
      attributionControl: { compact: true },
      dragRotate: false, // no rotate-via-right-click-drag/two-finger-drag
      touchPitch: false, // paired with dragRotate: false -- no drag-up/down pitch either
      // bounds + fitBoundsOptions (not center/zoom) -- MapLibre's
      // constructor resolves these into a camera position synchronously,
      // using the container's already-laid-out CSS size, before the style
      // has been fetched or the first frame painted. That's what was
      // missing before: with no center/zoom/bounds at all, the map fell
      // back to its hardcoded default (center [0,0], zoom 0) for every
      // frame between construction and the 'load' event that used to run
      // fitBounds -- a whole-world view with India off to the right that
      // then visibly snapped to center once the style finished loading
      // (sprite/glyphs/first tiles), which on a slow connection could take
      // a second or more. Setting bounds here means the very first frame
      // already shows India in place -- nothing to snap to later.
      bounds: MAP_CONFIG.INDIA_BOUNDS,
      fitBoundsOptions: { padding: MAP_CONFIG.FIT_PADDING, animate: false },
    });

    // dragRotate: false above only covers the drag gesture. Touch-pinch
    // rotation and the Shift+arrow keyboard shortcut are separate handlers
    // with their own rotation flags, so each needs its own disableRotation()
    // call -- per MapLibre's own "Disable map rotation" example. These flags
    // are independent of the handler's enable()/disable() (used by
    // DailyMap.jsx's pause/resume effect), so rotation stays off even after
    // a pause/resume cycle re-enables the rest of the handler.
    mapRef.current.touchZoomRotate.disableRotation();
    mapRef.current.keyboard.disableRotation();

    mapRef.current.on('click', (e) => {
      onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Syncs the player's guess pin to the map. A move (re-tap before Confirm)
  // updates the existing marker's position rather than recreating it, so
  // the drop-in animation only plays on first placement.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (guess == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLngLat([guess.lng, guess.lat]);
    } else {
      const el = document.createElement('div');
      el.className = 'eg-guess-marker';
      el.innerHTML = GUESS_PIN_SVG;
      el.style.width = '32px';
      el.style.height = '37px';
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([guess.lng, guess.lat])
        .addTo(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guess]);

  useEffect(() => {
    const el = markerRef.current?.getElement();
    if (el) el.style.display = guessMarkerVisible ? '' : 'none';
  }, [guess, guessMarkerVisible]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
