import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE, MAP_CONFIG } from '../config.js';

// @param mapRef: React.MutableRefObject<maplibregl.Map|null>
export default function MapContainer({ mapRef }) {
  const containerRef = useRef(null);

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

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
