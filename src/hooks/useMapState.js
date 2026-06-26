import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MAP_CONFIG, LAYER_IDS, SATELLITE_TILES, SATELLITE_ATTRIBUTION,
  SATELLITE_VISUAL, BASE_VISUAL, DIFFICULTY_DEFAULTS, LS_KEYS,
} from '../config.js';

// Scope querySelector to map container -- supports two simultaneous map instances.
function appendAttribution(mapInstance, text) {
  const ctrl = mapInstance._controls.find(c => c._container?.classList.contains('maplibregl-ctrl-attrib'));
  const inner = ctrl
    ? ctrl._container.querySelector('.maplibregl-ctrl-attrib-inner')
    : mapInstance.getContainer().querySelector('.maplibregl-ctrl-attrib-inner');
  if (!inner || inner.textContent.includes(text)) return;
  inner.textContent = inner.textContent + ' | ' + text;
}

function removeAttribution(mapInstance, text) {
  const ctrl = mapInstance._controls.find(c => c._container?.classList.contains('maplibregl-ctrl-attrib'));
  const inner = ctrl
    ? ctrl._container.querySelector('.maplibregl-ctrl-attrib-inner')
    : mapInstance.getContainer().querySelector('.maplibregl-ctrl-attrib-inner');
  if (!inner) return;
  inner.textContent = inner.textContent.replace(' | ' + text, '').trim();
}

// @param mapRef: React.MutableRefObject<maplibregl.Map|null> -- same ref passed to <MapContainer>
// @param mode: 'classic'|'daily'
export function useMapState(mapRef, mode) {
  const [state, setState] = useState({
    satellite: false,
    political: false,
    politicalNames: false,
    satelliteUnavailable: false,
  });

  // Two refs mirror state for stale-closure safety -- both required.
  const politicalRef      = useRef(false); // mirrors state.political
  const politicalNamesRef = useRef(false); // mirrors state.politicalNames

  // Stabilises the satellite error listener so it can be targeted by .off() --
  // .once('error', ...) would be consumed by ANY map error, not just an EOX-specific one.
  const onSatelliteErrorRef = useRef(null);

  // v8.9 -- applies/reverts the full satellite visual spec: EOX raster color grading,
  // AWS Terrarium hillshade, navy water tint, and a recolored border/river set shared
  // with INDIA_BOUNDARY_LINE + STATE_LINES (so Borders, if also toggled on, matches
  // the satellite palette rather than clashing with it).
  const setSatellite = useCallback((on) => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    const SV = SATELLITE_VISUAL;
    const BV = BASE_VISUAL;

    function restyleBordersAndRivers(toSatellite) {
      // boundary_2 / boundary_disputed live in map-style.json; INDIA_BOUNDARY_LINE
      // and STATE_LINES are added by this hook's init effect. All four follow the
      // same satellite palette so Borders, if also on, doesn't clash visually.
      const lineIds = ['boundary_2', 'boundary_disputed', LAYER_IDS.INDIA_BOUNDARY_LINE, LAYER_IDS.STATE_LINES];
      for (const id of lineIds) {
        if (!map.getLayer(id)) continue;
        map.setPaintProperty(id, 'line-color', toSatellite ? SV.BOUNDARY_COLOR : BV.BOUNDARY_COLOR);
      }
      // Opacity/width only apply to boundary_2/boundary_disputed -- INDIA_BOUNDARY_LINE
      // and STATE_LINES don't define these in their base paint, leave them alone.
      for (const id of ['boundary_2', 'boundary_disputed']) {
        if (!map.getLayer(id)) continue;
        map.setPaintProperty(id, 'line-opacity', toSatellite ? SV.BOUNDARY_OPACITY : BV.BOUNDARY_OPACITY_EXPR);
        map.setPaintProperty(id, 'line-width', toSatellite ? SV.BOUNDARY_WIDTH : BV.BOUNDARY_WIDTH_EXPR);
      }
      for (const id of ['waterway_river', 'waterway_other']) {
        if (!map.getLayer(id)) continue;
        map.setPaintProperty(id, 'line-color', toSatellite ? SV.RIVER_COLOR : BV.RIVER_COLOR);
        map.setPaintProperty(id, 'line-opacity', toSatellite ? SV.RIVER_OPACITY : BV.RIVER_OPACITY);
      }
    }

    function setBaseLayersVisible(visible) {
      // "All other vector layers (roads, labels, POIs, land-cover fills): hidden,
      // so raw satellite shows through on land." Roads/POIs/landcover are already
      // gone from map-style.json entirely (Section 7) -- only water + labels remain
      // to actually hide here.
      const ids = ['water', 'waterway_line_label', 'water_name_point_label', 'water_name_line_label',
                   'country_label', 'natural_earth'];
      for (const id of ids) {
        if (!map.getLayer(id)) continue;
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    }

    if (on) {
      if (map.getSource('eox-satellite')) return; // already on, no-op
      try {
        const firstNonBgId = map.getStyle().layers.find(l => l.type !== 'background')?.id;

        // 1. EOX satellite raster, with the v8.9 color-grading paint properties.
        map.addSource('eox-satellite', {
          type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256,
          maxzoom: MAP_CONFIG.SATELLITE_MAX_ZOOM,
        });
        map.addLayer({
          id: LAYER_IDS.SATELLITE, type: 'raster', source: 'eox-satellite',
          paint: {
            'raster-opacity':        1.0,
            'raster-saturation':     SV.RASTER_PAINT.saturation,
            'raster-contrast':       SV.RASTER_PAINT.contrast,
            'raster-brightness-min': SV.RASTER_PAINT.brightnessMin,
            'raster-brightness-max': SV.RASTER_PAINT.brightnessMax,
            'raster-resampling':     SV.RASTER_PAINT.resampling,
          },
        }, firstNonBgId);

        // 2. AWS Terrarium hillshade, stacked directly above the satellite raster.
        //    NOTE: hillshade-exaggeration controls shading strength, NOT a literal
        //    "multiply blend" -- MapLibre's style spec has no blend-mode paint
        //    property. This is the closest real parameter to the spec's intent.
        if (!map.getSource('terrarium-dem')) {
          map.addSource('terrarium-dem', {
            type: 'raster-dem', tiles: [SV.TERRAIN_TILES], tileSize: 256,
            encoding: SV.TERRAIN_ENCODING,
          });
        }
        map.addLayer({
          id: 'satellite-hillshade', type: 'hillshade', source: 'terrarium-dem',
          paint: {
            'hillshade-illumination-direction': SV.HILLSHADE.illuminationDirection,
            'hillshade-illumination-anchor':    SV.HILLSHADE.illuminationAnchor,
            'hillshade-exaggeration':           SV.HILLSHADE.exaggeration,
            'hillshade-shadow-color':           SV.HILLSHADE.shadowColor,
            'hillshade-highlight-color':        SV.HILLSHADE.highlightColor,
            'hillshade-accent-color':           SV.HILLSHADE.accentColor,
          },
        }, firstNonBgId);

        // 3. Navy water tint, drawn on top of both, so water reads as solid color
        //    rather than raw imagery or hillshade-over-ocean noise.
        map.addLayer({
          id: 'satellite-water-tint', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
          filter: ['!=', ['get', 'brunnel'], 'tunnel'],
          paint: {
            'fill-color':   SV.WATER_COLOR,
            'fill-opacity': SV.WATER_OPACITY,
            'fill-outline-color': 'rgba(0,0,0,0)', // outline hidden per spec
          },
        }, firstNonBgId);

        setBaseLayersVisible(false);
        restyleBordersAndRivers(true);
        map.setPaintProperty('background', 'background-color', SV.BACKGROUND);
        appendAttribution(map, SATELLITE_ATTRIBUTION);

        onSatelliteErrorRef.current = (e) => {
          if (e.sourceId !== 'eox-satellite') return;
          map.off('error', onSatelliteErrorRef.current);
          onSatelliteErrorRef.current = null;
          if (map.getLayer(LAYER_IDS.SATELLITE)) map.removeLayer(LAYER_IDS.SATELLITE);
          if (map.getSource('eox-satellite')) map.removeSource('eox-satellite');
          if (map.getLayer('satellite-hillshade')) map.removeLayer('satellite-hillshade');
          if (map.getSource('terrarium-dem')) map.removeSource('terrarium-dem');
          if (map.getLayer('satellite-water-tint')) map.removeLayer('satellite-water-tint');
          setBaseLayersVisible(true);
          restyleBordersAndRivers(false);
          map.setPaintProperty('background', 'background-color', BV.BACKGROUND);
          removeAttribution(map, SATELLITE_ATTRIBUTION);
          setState(prev => ({ ...prev, satellite: false, satelliteUnavailable: true }));
        };
        map.on('error', onSatelliteErrorRef.current);

        setState(prev => ({ ...prev, satellite: true }));
      } catch {
        setState(prev => ({ ...prev, satellite: false, satelliteUnavailable: true }));
      }
    } else {
      if (onSatelliteErrorRef.current) {
        map.off('error', onSatelliteErrorRef.current);
        onSatelliteErrorRef.current = null;
      }
      if (map.getLayer(LAYER_IDS.SATELLITE)) map.removeLayer(LAYER_IDS.SATELLITE);
      if (map.getSource('eox-satellite')) map.removeSource('eox-satellite');
      if (map.getLayer('satellite-hillshade')) map.removeLayer('satellite-hillshade');
      if (map.getSource('terrarium-dem')) map.removeSource('terrarium-dem');
      if (map.getLayer('satellite-water-tint')) map.removeLayer('satellite-water-tint');
      setBaseLayersVisible(true);
      restyleBordersAndRivers(false);
      map.setPaintProperty('background', 'background-color', BV.BACKGROUND);
      removeAttribution(map, SATELLITE_ATTRIBUTION);
      setState(prev => ({ ...prev, satellite: false }));
    }
  }, [mapRef]);

  const setPolitical = useCallback((on) => {
    const map = mapRef.current;
    if (!map?.loaded()) return;

    map.setLayoutProperty(LAYER_IDS.STATE_LINES, 'visibility', on ? 'visible' : 'none');
    if (!on) {
      map.setLayoutProperty(LAYER_IDS.STATE_LABELS, 'visibility', 'none');
    } else {
      // Restore via ref (stale-closure safe), not state.politicalNames
      map.setLayoutProperty(
        LAYER_IDS.STATE_LABELS, 'visibility',
        politicalNamesRef.current ? 'visible' : 'none'
      );
    }

    politicalRef.current = on; // sync ref BEFORE setState
    setState(prev => ({ ...prev, political: on }));
  }, [mapRef]);

  const setPoliticalNames = useCallback((on) => {
    const map = mapRef.current;
    if (!map?.loaded()) return;

    politicalNamesRef.current = on; // sync ref BEFORE setState
    setState(prev => ({ ...prev, politicalNames: on }));

    if (!politicalRef.current) return; // borders off -> STATE_LABELS already hidden
    map.setLayoutProperty(LAYER_IDS.STATE_LABELS, 'visibility', on ? 'visible' : 'none');
  }, [mapRef]);

  const setDifficulty = useCallback((level) => {
    if (mode === 'daily') return; // Key Decision #3: difficulty is Classic-only
    const d = DIFFICULTY_DEFAULTS[level];
    // Scoped to Borders+Names only -- never touches satellite (independently user-toggled,
    // must survive a difficulty switch).
    setPolitical(d.political);
    setPoliticalNames(d.politicalNames);
    localStorage.setItem(LS_KEYS.DIFFICULTY, level);
  }, [mode, setPolitical, setPoliticalNames]);

  const lockInteraction = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.dragPan.disable();
    map.scrollZoom.disable();
    map.doubleClickZoom.disable();
  }, [mapRef]);

  const unlockInteraction = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.doubleClickZoom.enable();
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return; // MapContainer must mount (and set mapRef.current) before this runs

    function onLoad() {
      map.addSource('india-states', { type: 'geojson', data: '/india-states.geojson' });

      map.addLayer({
        id: LAYER_IDS.STATE_LINES, type: 'line', source: 'india-states',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#6b7280', 'line-width': 0.8, 'line-dasharray': [3, 2] },
      });

      map.addLayer({
        id: LAYER_IDS.STATE_LABELS, type: 'symbol', source: 'india-states',
        layout: { 'text-field': ['get', 'st_nm'], 'text-size': 11, visibility: 'none' },
        paint: { 'text-color': '#374151', 'text-halo-color': '#fff', 'text-halo-width': 1 },
      });

      map.addSource('india-boundary', { type: 'geojson', data: '/india-boundary.geojson' });

      map.addLayer({
        id: LAYER_IDS.INDIA_BOUNDARY_LINE, type: 'line', source: 'india-boundary',
        paint: { 'line-color': '#555555', 'line-width': 1.5 },
      });
      // Always visible, both modes, both difficulties -- draws the compliance-patched
      // Aksai Chin/PoK border on top of OFM's boundary line. Not user-toggleable.

      if (mode === 'daily') {
        setPolitical(false);
      } else {
        const saved = localStorage.getItem(LS_KEYS.DIFFICULTY) || 'normal';
        setDifficulty(saved);
      }
    }

    // Defensive addition beyond the literal spec pseudocode: if 'load' already fired
    // before this effect attached its listener, .once('load', ...) would never call
    // onLoad. Same fragility class as the documented map.once('error') gotcha.
    if (map.loaded()) {
      onLoad();
    } else {
      map.once('load', onLoad);
    }

    return () => {
      map.off('load', onLoad); // remove only the listener this hook added
      // Do NOT call map.remove() -- owned by MapContainer.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef.current, mode]);

  return {
    ...state,
    setSatellite,
    setPolitical,
    setPoliticalNames,
    setDifficulty,
    lockInteraction,
    unlockInteraction,
  };
}
