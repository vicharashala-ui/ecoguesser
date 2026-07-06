import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
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
export default function MapContainer({ mapRef, onMapClick, guess, mapStyle = MAP_STYLE }) {
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
      maxParallelImageRequests: 6,
      maxBounds: MAP_CONFIG.MAX_BOUNDS,
      minZoom: MAP_CONFIG.MIN_ZOOM,
      maxZoom: MAP_CONFIG.MAX_ZOOM,
      attributionControl: { compact: true },
      // Do NOT pass center/zoom here -- fitBounds handles it in the load event below.
    });

    mapRef.current.once('load', () => {
      mapRef.current.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: MAP_CONFIG.FIT_PADDING, animate: false });
    });

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
  // the drop-in animation (Decision #8) only plays on first placement.
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

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
