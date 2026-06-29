import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE, MAP_CONFIG } from '../config.js';
import './MapContainer.css';

// Google Maps-style teardrop pin. Inline SVG + inline sizing (rather than
// relying on .eg-guess-marker's CSS) so this doesn't depend on whatever
// shape/color rules already exist there for the old plain dot.
const GUESS_PIN_SVG = `
  <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="15" cy="37.5" rx="4" ry="1.6" fill="#000000" opacity="0.22"/>
    <path
      d="M15 1C7.8 1 2 6.8 2 14c0 9.5 11.2 21.6 12.1 22.6.5.5 1.3.5 1.8 0C16.8 35.6 28 23.5 28 14 28 6.8 22.2 1 15 1Z"
      fill="#EA4335" stroke="#B0291D" stroke-width="0.5"
    />
    <circle cx="15" cy="14" r="5.2" fill="#ffffff"/>
  </svg>`;

// @param mapRef: React.MutableRefObject<maplibregl.Map|null>
// @param onMapClick: (lat: number, lng: number) => void -- fired on map tap;
//   wire this straight to useClassicRound's handleMapClick.
// @param guess: {lat:number, lng:number} | null -- the player's current pin
//   position from useClassicRound. null removes the marker (e.g. on LOADING).
export default function MapContainer({ mapRef, onMapClick, guess }) {
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
      style: MAP_STYLE,
      maxParallelImageRequests: 6,
      maxBounds: MAP_CONFIG.MAX_BOUNDS,
      minZoom: MAP_CONFIG.MIN_ZOOM,
      maxZoom: MAP_CONFIG.MAX_ZOOM,
      attributionControl: { compact: true },
      // Do NOT pass center/zoom here -- fitBounds handles it in the load event below.
    });

    mapRef.current.once('load', () => {
      mapRef.current.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: 20, animate: false });
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
      // Inline overrides in case .eg-guess-marker's CSS still sizes/colors
      // it as the old dot (e.g. a fixed small width/height + border-radius).
      el.style.width = '30px';
      el.style.height = '40px';
      el.style.background = 'transparent';
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([guess.lng, guess.lat])
        .addTo(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guess]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
