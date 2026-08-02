import { useState, useRef, useEffect, useCallback } from 'react';
import { feature as topoFeature } from 'topojson-client';
import {
  MAP_CONFIG, LAYER_IDS, SATELLITE_TILES, SATELLITE_ATTRIBUTION,
  SATELLITE_VISUAL, BASE_VISUAL, BARE_VISUAL, TERRAIN_TILES, TERRAIN_ENCODING,
} from '../config.js';
import { loadSharedGeoJsonOnce } from './sharedMapData.js';

// The 4 place-label layers that switch paint (not visibility) between
// BASE_VISUAL's white-text/dark-halo and BARE_VISUAL's dark-text/light-halo
// treatment when the Terrain toggle flips -- see applyTerrainVisual below.
export const TERRAIN_PLACE_LABEL_IDS = ['place_city_label', 'place_town_label', 'place_village_label', 'place_hamlet_label'];
export const TERRAIN_PLACE_LABEL_PROPS = ['text-color', 'text-halo-color', 'text-halo-width', 'text-halo-blur'];

// One-time capture of the live style's own baked-in paint for the layers
// applyTerrainVisual doesn't have a BASE_VISUAL equivalent for (water's
// fill-color/opacity/filter and the 4 place-label layers -- boundary_2/
// boundary_disputed/waterway_river/waterway_other/background all already
// have an active BASE_VISUAL restore path via restyleBordersAndRivers, so
// don't need capturing here). Reading it straight from the loaded style
// instead of hand-transcribing into config.js means this can never drift
// out of sync with public/map-style.json.
function captureOriginalPaint(map) {
  const out = {};
  if (map.getLayer('water')) {
    out.water = {
      'fill-color':   map.getPaintProperty('water', 'fill-color'),
      'fill-opacity': map.getPaintProperty('water', 'fill-opacity'),
    };
  }
  if (map.getLayer('water_ocean')) {
    out.water_ocean = {
      'fill-color':   map.getPaintProperty('water_ocean', 'fill-color'),
      'fill-opacity': map.getPaintProperty('water_ocean', 'fill-opacity'),
    };
  }
  for (const id of TERRAIN_PLACE_LABEL_IDS) {
    if (!map.getLayer(id)) continue;
    out[id] = {};
    for (const prop of TERRAIN_PLACE_LABEL_PROPS) out[id][prop] = map.getPaintProperty(id, prop);
  }
  if (map.getLayer('base-hillshade')) {
    out['base-hillshade'] = {};
    for (const prop of Object.keys(HILLSHADE_TRANSPARENT)) {
      out['base-hillshade'][prop] = map.getPaintProperty('base-hillshade', prop);
    }
  }
  return out;
}

// Alpha-0 versions of base-hillshade's own paint colors (map-style.json) --
// interpolating alpha-only (same RGB, 1 -> 0) instead of toward an unrelated
// transparent color keeps the fade a clean dim-out with no hue shift partway
// through. Keep in sync with base-hillshade's paint block: #3f4638,
// #f6f4ec, #a4a08f.
const HILLSHADE_TRANSPARENT = {
  'hillshade-shadow-color':    'rgba(63,70,56,0)',
  'hillshade-highlight-color': 'rgba(246,244,236,0)',
  'hillshade-accent-color':    'rgba(164,160,143,0)',
};

// Swaps hypsometric-tint/base-hillshade visibility plus the handful of
// shared-layer paint properties that define "the Blitz look" (background,
// water, boundary_2/disputed, waterway rivers, place labels) between their
// terrain-on and BARE_VISUAL terrain-off values. Boundary/waterway/
// background terrain-on values reuse BASE_VISUAL -- the same constants
// restyleBordersAndRivers already restores them to on satellite-off, so
// calling this after that function is a harmless redundant write when
// terrain is on, and the deciding write when terrain is off. Water and
// place labels have no such existing restore path, so their terrain-on
// values come from originalPaint (captureOriginalPaint's snapshot) instead.
// Callers must only invoke this while satellite is off -- these same
// layers are under SATELLITE_VISUAL's control while it's on.
//
// hypsometric-tint/base-hillshade fade rather than snap, unlike everything
// else this function touches -- those ride map-style.json's root-level
// "transition" for free since they're ordinary paint properties, but
// MapLibre's hillshade layer type has no opacity paint property, and
// 'visibility' (a layout property) never animates regardless of type. So
// hypsometric-tint fades via color-relief-opacity (a real paint property)
// and base-hillshade via alpha-only color transitions (HILLSHADE_TRANSPARENT
// above) instead. 'visibility' still gates whether terrain-dem tiles get
// fetched at all, though -- flipping these to permanently 'visible' would
// mean the DEM source keeps downloading tiles for wherever the map pans/
// zooms to even while Terrain is toggled off, exactly the bandwidth this
// toggle exists to save. So visibility only flips to 'none' after a fade-out
// finishes (hideTimerRef, cleared/rescheduled on every call so rapid
// re-toggling can't leave a stale timer fighting a newer one) and to
// 'visible' right before a fade-in starts (revealRafRef, same cancel-and-
// reschedule treatment) -- tiles were already deferred up to that point, and
// starting the opacity transition doesn't need to wait for them; individual
// tiles still pop in as they decode, same as always, via fadeDuration:0 on
// the map itself.
function applyTerrainVisual(map, on, originalPaint, hideTimerRef, revealRafRef) {
  const orig = originalPaint || {};

  if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  if (revealRafRef.current) { cancelAnimationFrame(revealRafRef.current); revealRafRef.current = null; }

  const hypso = map.getLayer('hypsometric-tint');
  const hillshade = map.getLayer('base-hillshade');
  const currentlyOn = !!hypso
    && map.getLayoutProperty('hypsometric-tint', 'visibility') !== 'none'
    && map.getPaintProperty('hypsometric-tint', 'color-relief-opacity') === 1;

  if (on && !currentlyOn) {
    if (hypso) {
      map.setLayoutProperty('hypsometric-tint', 'visibility', 'visible');
      map.setPaintProperty('hypsometric-tint', 'color-relief-opacity', 0);
    }
    if (hillshade) {
      map.setLayoutProperty('base-hillshade', 'visibility', 'visible');
      for (const prop of Object.keys(HILLSHADE_TRANSPARENT)) {
        map.setPaintProperty('base-hillshade', prop, HILLSHADE_TRANSPARENT[prop]);
      }
    }
    // Paint property changes made in the same tick as the 'visible' flip
    // above would have nothing to transition FROM (the layer's first-ever
    // paint value just appears, it doesn't animate in) -- deferring the
    // "on" values one frame gives them a real 0 -> 1 change to animate.
    revealRafRef.current = requestAnimationFrame(() => {
      revealRafRef.current = null;
      if (map.getLayer('hypsometric-tint')) map.setPaintProperty('hypsometric-tint', 'color-relief-opacity', 1);
      if (map.getLayer('base-hillshade')) {
        for (const prop of Object.keys(HILLSHADE_TRANSPARENT)) {
          map.setPaintProperty('base-hillshade', prop, orig['base-hillshade']?.[prop]);
        }
      }
    });
  } else if (!on && currentlyOn) {
    if (hypso) map.setPaintProperty('hypsometric-tint', 'color-relief-opacity', 0);
    if (hillshade) {
      for (const prop of Object.keys(HILLSHADE_TRANSPARENT)) {
        map.setPaintProperty('base-hillshade', prop, HILLSHADE_TRANSPARENT[prop]);
      }
    }
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      if (map.getLayer('hypsometric-tint')) map.setLayoutProperty('hypsometric-tint', 'visibility', 'none');
      if (map.getLayer('base-hillshade')) map.setLayoutProperty('base-hillshade', 'visibility', 'none');
    }, MAP_CONFIG.TRANSITION_MS);
  }

  if (map.getLayer('background')) {
    map.setPaintProperty('background', 'background-color', on ? BASE_VISUAL.BACKGROUND : BARE_VISUAL.BACKGROUND);
  }

  if (map.getLayer('water')) {
    map.setPaintProperty('water', 'fill-color', on ? orig.water?.['fill-color'] : BARE_VISUAL.WATER_COLOR);
    map.setPaintProperty('water', 'fill-opacity', on ? orig.water?.['fill-opacity'] : BARE_VISUAL.WATER_OPACITY);
  }
  if (map.getLayer('water_ocean')) {
    map.setPaintProperty('water_ocean', 'fill-color', on ? orig.water_ocean?.['fill-color'] : BARE_VISUAL.OCEAN_COLOR);
    map.setPaintProperty('water_ocean', 'fill-opacity', on ? orig.water_ocean?.['fill-opacity'] : BARE_VISUAL.WATER_OPACITY);
  }

  for (const id of ['boundary_2', 'boundary_disputed']) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, 'line-color', on ? BASE_VISUAL.BOUNDARY_COLOR : BARE_VISUAL.BOUNDARY_COLOR);
    map.setPaintProperty(id, 'line-width', on ? BASE_VISUAL.BOUNDARY_WIDTH_EXPR : BARE_VISUAL.BOUNDARY_WIDTH_EXPR);
  }
  // Only boundary_2 defines line-opacity -- boundary_disputed uses dasharray instead.
  if (map.getLayer('boundary_2')) {
    map.setPaintProperty('boundary_2', 'line-opacity', on ? BASE_VISUAL.BOUNDARY_OPACITY_EXPR : BARE_VISUAL.BOUNDARY_OPACITY_EXPR);
  }

  for (const id of ['waterway_river', 'waterway_other']) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, 'line-color', on ? BASE_VISUAL.RIVER_COLOR : BARE_VISUAL.RIVER_COLOR);
  }

  for (const id of TERRAIN_PLACE_LABEL_IDS) {
    if (!map.getLayer(id)) continue;
    for (const prop of TERRAIN_PLACE_LABEL_PROPS) {
      map.setPaintProperty(id, prop, on ? orig[id]?.[prop] : BARE_VISUAL.PLACE_LABEL_PAINT[prop]);
    }
  }
}

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };

// india-states.geojson (340KB gzip -- every shared border between two
// adjacent states was stored twice, once per state) is generated into
// india-states.topojson by scripts/convertStatesTopo.js (209KB gzip, shared
// borders stored once; verified byte-for-byte equivalent geometry -- see
// that script's comments). This fetches + expands it back into a regular
// GeoJSON FeatureCollection and pushes it into the already-created
// 'india-states' source below via setData(). Deliberately fire-and-forget:
// callers don't await this, so a slow/failed fetch delays or loses the
// state border lines and labels, never mapReady or pin placement further
// down in onLoad.
function loadIndiaStatesTopology(map) {
  loadSharedGeoJsonOnce('/india-states.topojson', (topology) =>
    topoFeature(topology, topology.objects['india-states'])
  )
    .then((geojson) => map.getSource('india-states')?.setData(geojson))
    .catch(() => {}); // Borders/labels just don't appear; nothing else depends on this.
}

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
// @param mode: 'classic'|'daily'|'blitz'
export function useMapState(mapRef, mode) {
  const [state, setState] = useState({
    satellite: false,
    political: false,
    politicalNames: false,
    satelliteUnavailable: false,
    mapReady: false,
    mapLoadSlow: false,
    // Terrain (hypsometric-tint + base-hillshade + the BASE_VISUAL/
    // BARE_VISUAL palette swap) defaults ON, matching the map's baked-in
    // static style -- Classic/Daily's default look is unchanged from
    // before this toggle existed. Not persisted -- resets to ON each
    // session, same as Satellite.
    terrain: true,
  });

  // One-time latch: true once 'load' has fired and never goes back to false.
  // isStyleLoaded()/loaded() were tried here before, but both also reflect
  // any in-flight style update (e.g. resultLayer.js's source.setData() calls
  // during its line-draw animation make isStyleLoaded() return false for the
  // *whole* style, not just that one source) -- so they flicker false during
  // completely unrelated activity and silently no-op whichever setter below
  // happened to be called in that window. The setters only actually need
  // "has initial load happened", which is what this ref captures once.
  const mapReadyRef = useRef(false);

  // Refs mirror state for stale-closure safety -- all required.
  const politicalRef      = useRef(false); // mirrors state.political
  const politicalNamesRef = useRef(false); // mirrors state.politicalNames
  const terrainRef        = useRef(true);  // mirrors state.terrain
  const satelliteRef      = useRef(false); // mirrors state.satellite -- lets setTerrain know whether to touch the map or stay inert
  // captureOriginalPaint's snapshot, taken once in onLoad -- see its comment.
  const originalPaintRef  = useRef({});
  // applyTerrainVisual's pending hide-after-fade timer / reveal rAF -- see
  // that function's comment. Live here (not inside applyTerrainVisual
  // itself) so a call from one call site can cancel a timer/rAF left
  // pending by a different call site (e.g. Satellite turning off and
  // restoring terrain before an earlier Terrain-toggle fade-out finished).
  const terrainHideTimerRef = useRef(null);
  const terrainRevealRafRef = useRef(null);

  // MapContainer.jsx now fetches+patches the style JSON before constructing
  // the map, so mapRef.current is set asynchronously (inside a .then(),
  // after this hook has already mounted) rather than synchronously during
  // MapContainer's own mount. Writing to a ref doesn't trigger React to
  // re-check the effect below's [mapRef.current, mode] dependency -- that
  // trick only ever worked because *something else* caused a re-render
  // shortly after mapRef.current was set synchronously in the old
  // architecture. This tiny poll (bounded by mapRef.current itself, so it
  // stops within a frame or two of MapContainer finishing) replaces that
  // implicit reliance with an explicit one.
  const [, forceRecheck] = useState(0);
  useEffect(() => {
    if (mapRef.current) return;
    let rafId;
    const check = () => {
      if (mapRef.current) {
        forceRecheck((n) => n + 1);
      } else {
        rafId = requestAnimationFrame(check);
      }
    };
    rafId = requestAnimationFrame(check);
    return () => cancelAnimationFrame(rafId);
  }, [mapRef, mode]);

  // Stabilises the satellite error listener so it can be targeted by .off() --
  // .once('error', ...) would be consumed by ANY map error, not just an ArcGIS-specific one.
  const onSatelliteErrorRef = useRef(null);
  // Satellite ON->OFF is a crossfade, not an instant swap -- see setSatellite's
  // comment. satelliteFadeInRafRef defers the raster's opacity 0->1 write one
  // frame (same reason applyTerrainVisual's revealRafRef does); satelliteHideBaseTimerRef
  // delays hiding the base layers underneath until the satellite fade-in has
  // actually finished covering them; satelliteCleanupTimerRef delays the real
  // removeLayer/removeSource teardown until the fade-out has finished, so a
  // quick re-toggle can cancel it and fade back in instead of re-adding from scratch.
  const satelliteFadeInRafRef    = useRef(null);
  const satelliteHideBaseTimerRef = useRef(null);
  const satelliteCleanupTimerRef  = useRef(null);

  // Applies/reverts the full satellite visual spec: ArcGIS raster color
  // grading, navy water tint, and a recolored border/river set shared with
  // INDIA_BOUNDARY_LINE + STATE_LINES (so Borders, if also toggled on, matches
  // the satellite palette rather than clashing with it). Hillshade is dropped for
  // now (SV.HILLSHADE_ENABLED) but the config/code path is kept for later re-add.
  const setSatellite = useCallback((on) => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const SV = SATELLITE_VISUAL;
    const BV = BASE_VISUAL;

    function restyleBordersAndRivers(toSatellite) {
      // boundary_2 / boundary_disputed live in map-style.json; INDIA_BOUNDARY_LINE
      // is added by this hook's init effect. Both follow the satellite palette so
      // the international border doesn't clash with it.
      const lineIds = ['boundary_2', 'boundary_disputed', LAYER_IDS.INDIA_BOUNDARY_LINE];
      for (const id of lineIds) {
        if (!map.getLayer(id)) continue;
        map.setPaintProperty(id, 'line-color', toSatellite ? SV.BOUNDARY_COLOR : BV.BOUNDARY_COLOR);
      }
      // Opacity/width only apply to boundary_2/boundary_disputed -- INDIA_BOUNDARY_LINE
      // doesn't define these in its base paint, leave it alone.
      for (const id of ['boundary_2', 'boundary_disputed']) {
        if (!map.getLayer(id)) continue;
        map.setPaintProperty(id, 'line-opacity', toSatellite ? SV.BOUNDARY_OPACITY : BV.BOUNDARY_OPACITY_EXPR);
        map.setPaintProperty(id, 'line-width', toSatellite ? SV.BOUNDARY_WIDTH : BV.BOUNDARY_WIDTH_EXPR);
      }
      // Casing layers stay visible in both modes now -- only the color/width
      // swaps. Satellite uses a dark casing behind its light border line;
      // base mode uses a light casing (BASE_VISUAL.BOUNDARY_CASING_*) behind
      // its dark one, so the border doesn't vanish over dark high-elevation
      // terrain either (see config.js's BOUNDARY_CASING_* comment).
      for (const id of [LAYER_IDS.BOUNDARY_2_CASING, LAYER_IDS.BOUNDARY_DISPUTED_CASING]) {
        if (!map.getLayer(id)) continue;
        map.setPaintProperty(id, 'line-color', toSatellite ? SV.BOUNDARY_CASING_COLOR : BV.BOUNDARY_CASING_COLOR);
        map.setPaintProperty(id, 'line-opacity', toSatellite ? SV.BOUNDARY_CASING_OPACITY : BV.BOUNDARY_CASING_OPACITY);
        map.setPaintProperty(id, 'line-width', toSatellite ? SV.BOUNDARY_CASING_WIDTH : BV.BOUNDARY_CASING_WIDTH_EXPR);
      }
      if (map.getLayer(LAYER_IDS.INDIA_BOUNDARY_CASING)) {
        map.setPaintProperty(LAYER_IDS.INDIA_BOUNDARY_CASING, 'line-color', toSatellite ? SV.BOUNDARY_CASING_COLOR : BV.BOUNDARY_CASING_COLOR);
        map.setPaintProperty(LAYER_IDS.INDIA_BOUNDARY_CASING, 'line-opacity', toSatellite ? SV.BOUNDARY_CASING_OPACITY : BV.BOUNDARY_CASING_OPACITY);
        map.setPaintProperty(LAYER_IDS.INDIA_BOUNDARY_CASING, 'line-width', toSatellite ? SV.INDIA_BOUNDARY_CASING_WIDTH : BV.INDIA_BOUNDARY_CASING_WIDTH);
      }
      for (const id of ['waterway_river', 'waterway_other']) {
        if (!map.getLayer(id)) continue;
        map.setPaintProperty(id, 'line-color', toSatellite ? SV.RIVER_COLOR : BV.RIVER_COLOR);
        map.setPaintProperty(id, 'line-opacity', toSatellite ? SV.RIVER_OPACITY : BV.RIVER_OPACITY);
      }
      // STATE_LINES (Borders toggle) gets its own satellite-specific values
      // -- not SV.BOUNDARY_COLOR -- so it stays a visually distinct, muted
      // gameplay hint rather than a second international border, but is
      // still actually visible: BASE_VISUAL's dark hint color disappears
      // against the darkened satellite raster.
      if (map.getLayer(LAYER_IDS.STATE_LINES)) {
        map.setPaintProperty(LAYER_IDS.STATE_LINES, 'line-color', toSatellite ? SV.STATE_LINE_COLOR : BV.STATE_LINE_COLOR);
        map.setPaintProperty(LAYER_IDS.STATE_LINES, 'line-opacity', toSatellite ? SV.STATE_LINE_OPACITY : BV.STATE_LINE_OPACITY);
        map.setPaintProperty(LAYER_IDS.STATE_LINES, 'line-width', toSatellite ? SV.STATE_LINE_WIDTH : BV.STATE_LINE_WIDTH);
      }
    }

    function setBaseLayersVisible(visible) {
      // "All other vector layers (roads, labels, POIs, land-cover fills): hidden,
      // so raw satellite shows through on land." Roads/POIs/landcover are already
      // gone from map-style.json entirely -- only water + labels remain to
      // actually hide here.
      const ids = ['water', 'water_ocean', 'waterway_line_label', 'water_name_point_label', 'water_name_line_label',
                   'country_label', 'hypsometric-tint', 'base-hillshade'];
      for (const id of ids) {
        if (!map.getLayer(id)) continue;
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    }

    // Crossfades base map <-> satellite instead of swapping instantly: the
    // satellite raster fades in ON TOP of the still-visible base layers
    // (firstNonBgId keeps it above them in z-order), which only get hidden
    // once that fade has actually finished covering them -- and symmetrically
    // on the way out, base layers reappear underneath *before* satellite
    // starts fading, so there's never a frame where neither is showing.
    // restyleBordersAndRivers/the background-color write below aren't special-
    // cased for this -- they're ordinary paint properties, so they already
    // ride map-style.json's root-level "transition" for free.
    if (on) {
      if (satelliteCleanupTimerRef.current) {
        // A very recent OFF's fade-out hadn't finished tearing things down
        // yet -- cancel that and fade back in instead of re-adding from scratch.
        clearTimeout(satelliteCleanupTimerRef.current);
        satelliteCleanupTimerRef.current = null;
      }
      if (satelliteHideBaseTimerRef.current) {
        clearTimeout(satelliteHideBaseTimerRef.current);
        satelliteHideBaseTimerRef.current = null;
      }
      if (map.getSource('satellite-raster')) {
        // Already exists (fully on, or was mid-fade-out and got cancelled
        // above) -- just make sure it's heading toward fully opaque, and
        // (re)schedule hiding the base layers once it gets there. Without
        // this, cancelling a fade-out partway through would leave the base
        // layers -- hypsometric-tint/base-hillshade included -- visible
        // forever underneath the now-opaque satellite raster, silently
        // fetching DEM tiles for every future pan/zoom for no visible reason.
        if (satelliteFadeInRafRef.current) {
          cancelAnimationFrame(satelliteFadeInRafRef.current);
          satelliteFadeInRafRef.current = null;
        }
        if (map.getLayer(LAYER_IDS.SATELLITE)) map.setPaintProperty(LAYER_IDS.SATELLITE, 'raster-opacity', 1);
        satelliteHideBaseTimerRef.current = setTimeout(() => {
          satelliteHideBaseTimerRef.current = null;
          setBaseLayersVisible(false);
        }, MAP_CONFIG.TRANSITION_MS);
        satelliteRef.current = true;
        setState(prev => ({ ...prev, satellite: true }));
        return;
      }
      try {
        const firstNonBgId = map.getStyle().layers.find(l => l.type !== 'background')?.id;

        // 1. ArcGIS satellite raster (via our tile-caching proxy), with the
        //    color-grading paint properties from config.js. Starts fully
        //    transparent and fades to raster-opacity 1 a frame below -- a
        //    freshly-added layer's first paint value has nothing to
        //    transition FROM, so starting at the target opacity would just
        //    pop in instantly instead of fading (same reasoning as
        //    applyTerrainVisual's revealRafRef).
        map.addSource('satellite-raster', {
          type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256,
          maxzoom: MAP_CONFIG.SATELLITE_MAX_ZOOM,
        });
        map.addLayer({
          id: LAYER_IDS.SATELLITE, type: 'raster', source: 'satellite-raster',
          paint: {
            'raster-opacity':            0,
            'raster-opacity-transition': { duration: MAP_CONFIG.TRANSITION_MS, delay: 0 },
            'raster-saturation':     SV.RASTER_PAINT.saturation,
            'raster-contrast':       SV.RASTER_PAINT.contrast,
            'raster-brightness-min': SV.RASTER_PAINT.brightnessMin,
            'raster-brightness-max': SV.RASTER_PAINT.brightnessMax,
            'raster-resampling':     SV.RASTER_PAINT.resampling,
          },
        }, firstNonBgId);

        // 2. AWS Terrarium hillshade, stacked directly above the satellite raster.
        //    Not currently enabled -- see SV.HILLSHADE_ENABLED comment in config.js.
        //    NOTE: hillshade-exaggeration controls shading strength, NOT a literal
        //    "multiply blend" -- MapLibre's style spec has no blend-mode paint
        //    property. This is the closest real parameter to the spec's intent.
        if (SV.HILLSHADE_ENABLED) {
          if (!map.getSource('terrarium-dem')) {
            map.addSource('terrarium-dem', {
              type: 'raster-dem', tiles: [TERRAIN_TILES], tileSize: 256,
              encoding: TERRAIN_ENCODING,
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
        }

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

        restyleBordersAndRivers(true);
        map.setPaintProperty('background', 'background-color', SV.BACKGROUND);
        appendAttribution(map, SATELLITE_ATTRIBUTION);

        satelliteFadeInRafRef.current = requestAnimationFrame(() => {
          satelliteFadeInRafRef.current = null;
          if (map.getLayer(LAYER_IDS.SATELLITE)) map.setPaintProperty(LAYER_IDS.SATELLITE, 'raster-opacity', 1);
        });
        // Base layers stay visible (rendering underneath the satellite raster,
        // which sits above them via firstNonBgId) until the fade-in has
        // actually finished, so hiding them here is invisible rather than a cut.
        satelliteHideBaseTimerRef.current = setTimeout(() => {
          satelliteHideBaseTimerRef.current = null;
          setBaseLayersVisible(false);
        }, MAP_CONFIG.TRANSITION_MS);

        onSatelliteErrorRef.current = (e) => {
          if (e.sourceId !== 'satellite-raster') return;
          map.off('error', onSatelliteErrorRef.current);
          onSatelliteErrorRef.current = null;
          if (satelliteFadeInRafRef.current) { cancelAnimationFrame(satelliteFadeInRafRef.current); satelliteFadeInRafRef.current = null; }
          if (satelliteHideBaseTimerRef.current) { clearTimeout(satelliteHideBaseTimerRef.current); satelliteHideBaseTimerRef.current = null; }
          if (satelliteCleanupTimerRef.current) { clearTimeout(satelliteCleanupTimerRef.current); satelliteCleanupTimerRef.current = null; }
          if (map.getLayer(LAYER_IDS.SATELLITE)) map.removeLayer(LAYER_IDS.SATELLITE);
          if (map.getSource('satellite-raster')) map.removeSource('satellite-raster');
          if (map.getLayer('satellite-hillshade')) map.removeLayer('satellite-hillshade');
          if (map.getSource('terrarium-dem')) map.removeSource('terrarium-dem');
          if (map.getLayer('satellite-water-tint')) map.removeLayer('satellite-water-tint');
          setBaseLayersVisible(true);
          restyleBordersAndRivers(false);
          map.setPaintProperty('background', 'background-color', BV.BACKGROUND);
          satelliteRef.current = false;
          applyTerrainVisual(map, terrainRef.current, originalPaintRef.current, terrainHideTimerRef, terrainRevealRafRef);
          removeAttribution(map, SATELLITE_ATTRIBUTION);
          setState(prev => ({ ...prev, satellite: false, satelliteUnavailable: true }));
        };
        map.on('error', onSatelliteErrorRef.current);

        satelliteRef.current = true;
        setState(prev => ({ ...prev, satellite: true }));
      } catch {
        satelliteRef.current = false;
        setState(prev => ({ ...prev, satellite: false, satelliteUnavailable: true }));
      }
    } else {
      if (onSatelliteErrorRef.current) {
        map.off('error', onSatelliteErrorRef.current);
        onSatelliteErrorRef.current = null;
      }
      if (satelliteFadeInRafRef.current) { cancelAnimationFrame(satelliteFadeInRafRef.current); satelliteFadeInRafRef.current = null; }
      if (satelliteHideBaseTimerRef.current) { clearTimeout(satelliteHideBaseTimerRef.current); satelliteHideBaseTimerRef.current = null; }

      // Base layers reappear now, underneath the satellite raster (still
      // fully opaque for one more instant below), so they're already there
      // by the time it finishes fading out -- same crossfade, opposite direction.
      setBaseLayersVisible(true);
      restyleBordersAndRivers(false);
      map.setPaintProperty('background', 'background-color', BV.BACKGROUND);
      satelliteRef.current = false;
      applyTerrainVisual(map, terrainRef.current, originalPaintRef.current, terrainHideTimerRef, terrainRevealRafRef);
      if (map.getLayer(LAYER_IDS.SATELLITE)) map.setPaintProperty(LAYER_IDS.SATELLITE, 'raster-opacity', 0);
      removeAttribution(map, SATELLITE_ATTRIBUTION);
      setState(prev => ({ ...prev, satellite: false }));

      if (satelliteCleanupTimerRef.current) clearTimeout(satelliteCleanupTimerRef.current);
      satelliteCleanupTimerRef.current = setTimeout(() => {
        satelliteCleanupTimerRef.current = null;
        if (map.getLayer(LAYER_IDS.SATELLITE)) map.removeLayer(LAYER_IDS.SATELLITE);
        if (map.getSource('satellite-raster')) map.removeSource('satellite-raster');
        if (map.getLayer('satellite-hillshade')) map.removeLayer('satellite-hillshade');
        if (map.getSource('terrarium-dem')) map.removeSource('terrarium-dem');
        if (map.getLayer('satellite-water-tint')) map.removeLayer('satellite-water-tint');
      }, MAP_CONFIG.TRANSITION_MS);
    }
  }, [mapRef]);

  // Toggles hypsometric-tint/base-hillshade + the shared-layer palette
  // between the terrain-on and BARE_VISUAL looks -- see applyTerrainVisual's
  // comment for the full mechanism. No-op for Blitz, which has no Terrain
  // toggle (its look is permanently BARE_VISUAL, baked in at construction
  // by blitzStyleTransform).
  const setTerrain = useCallback((on) => {
    if (mode === 'blitz') return;
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    terrainRef.current = on; // sync ref BEFORE setState
    setState(prev => ({ ...prev, terrain: on }));

    // Inert while satellite is on -- background/boundary/water are under
    // SATELLITE_VISUAL's control there. The preference is still recorded
    // (terrainRef above), so setSatellite's off-path applies the right
    // look the moment satellite turns back off, with no flash in between.
    if (satelliteRef.current) return;

    applyTerrainVisual(map, on, originalPaintRef.current, terrainHideTimerRef, terrainRevealRafRef);
  }, [mapRef, mode]);

  const setPolitical = useCallback((on) => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

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
    if (!map || !mapReadyRef.current) return;

    politicalNamesRef.current = on; // sync ref BEFORE setState
    setState(prev => ({ ...prev, politicalNames: on }));

    if (!politicalRef.current) return; // borders off -> STATE_LABELS already hidden
    map.setLayoutProperty(LAYER_IDS.STATE_LABELS, 'visibility', on ? 'visible' : 'none');
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return; // MapContainer must mount (and set mapRef.current) before this runs

    function onLoad() {
      map.addSource('india-states', {
        type: 'geojson',
        // Real data streams in a moment later, via loadIndiaStatesTopology()
        // below -- see its comment. All the layers referencing this source
        // (STATE_LINES here, BLITZ_FILL/BLITZ_OUTLINE further down) are
        // still created synchronously, in the same order as before, so
        // nothing about layer ordering/z-index changes.
        data: EMPTY_FEATURE_COLLECTION,
        promoteId: 'st_nm', // lets blitzHighlight.js key setFeatureState off each state's own name
      });
      loadIndiaStatesTopology(map);

      map.addLayer({
        id: LAYER_IDS.STATE_LINES, type: 'line', source: 'india-states',
        layout: { visibility: 'none' },
        paint: {
          'line-color':   BASE_VISUAL.STATE_LINE_COLOR,
          'line-width':   BASE_VISUAL.STATE_LINE_WIDTH,
          'line-opacity': BASE_VISUAL.STATE_LINE_OPACITY,
          'line-dasharray': [3, 2],
        },
      });

      if (mode !== 'blitz') {
        // Hint 2 (stateHighlight.js) fill+outline pair -- added once here,
        // same persistent add-once idiom as BLITZ_FILL/BLITZ_OUTLINE and
        // BLITZ_HINT_FILL/BLITZ_HINT_OUTLINE below, instead of
        // stateHighlight.js calling addLayer/removeLayer on every
        // showHint2/hideHint2. Blitz has no Hint 2 (its own region-hint
        // mechanism is the BLITZ_HINT_* pair above), so this only applies
        // to Classic/Daily. line-opacity-transition:0 is still needed here
        // (not just on first add) since startPulse drives that property by
        // hand every frame -- see stateHighlight.js's comment.
        const NO_HINT2_FILTER = ['in', ['get', 'st_nm'], ['literal', []]];
        map.addLayer({
          id: LAYER_IDS.HINT_FILL, type: 'fill', source: 'india-states', filter: NO_HINT2_FILTER,
          paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.25 },
        });
        map.addLayer({
          id: LAYER_IDS.HINT_OUTLINE, type: 'line', source: 'india-states', filter: NO_HINT2_FILTER,
          paint: {
            'line-color': '#8b5cf6', 'line-width': 1.5, 'line-opacity': 1,
            'line-opacity-transition': { duration: 0, delay: 0 },
          },
        });
      }

      // Dedicated one-point-per-state source for name labels, instead of
      // symbol-labeling india-states' polygons directly. GeoJSON sources are
      // internally split into a tile pyramid (geojson-vt) -- a polygon
      // symbol layer places a label anchor per tile the polygon touches, so
      // any state whose landmass straddles an internal tile boundary at the
      // current zoom gets its name rendered once per tile fragment (Odisha's
      // long north-south shape crosses one at zoom 4+, showing "Odisha"
      // twice). A Point can't be split across a tile boundary, so sourcing
      // labels from points instead guarantees exactly one label per state
      // regardless of zoom. Each point is the largest sub-polygon's
      // representative_point() (pre-computed, not centroid -- centroid can
      // fall outside a concave/crescent state), so it always lands on the
      // state's main landmass rather than an offshore island or the sea.
      map.addSource('india-state-labels', {
        type: 'geojson',
        // Real data streams in a moment later, same fetch-once-share-across-
        // instances pattern as india-states above (this file is small, but
        // there's no reason to special-case it out of the shared cache).
        data: EMPTY_FEATURE_COLLECTION,
      });
      loadSharedGeoJsonOnce('/india-state-labels.geojson', (geojson) => geojson)
        .then((geojson) => map.getSource('india-state-labels')?.setData(geojson))
        .catch(() => {});

      map.addLayer({
        id: LAYER_IDS.STATE_LABELS, type: 'symbol', source: 'india-state-labels',
        // Daily and Classic both force politicalNames on (below) since neither
        // has a Names toggle -- minzoom is what actually keeps labels hidden
        // until the player has zoomed in far enough to want them. Blitz keeps
        // minzoom 0 -- its "State Names" toggle shows/hides immediately at any zoom.
        minzoom: (mode === 'daily' || mode === 'classic') ? MAP_CONFIG.STATE_LABEL_MIN_ZOOM : 0,
        layout: {
          'text-field': ['get', 'st_nm'],
          'text-font': ['Noto Sans Bold'],
          // Sized down ~15% from the original [3,12 / 6,15 / 9,18] stops so
          // state names read as background context rather than competing
          // with place labels / hint highlights for attention.
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 13, 9, 15],
          'text-letter-spacing': 0.02,
          visibility: 'none',
        },
        // Opaque near-black text + a thick, fully-opaque white halo (not the
        // previous thin translucent one) so the name holds up over BOTH the
        // light base map AND satellite imagery -- same "always contrasts
        // regardless of background" casing technique used for the
        // international boundary lines above.
        // Solid white fill with a dark halo outline (inverse of the previous
        // dark-fill/white-halo combo) -- reads clearly over both satellite
        // imagery and the tan base map without looking washed out.
        // text-opacity slightly under 1 (paired with the smaller text-size
        // above) so names sit further into the background -- still fully
        // legible, just visibly less prominent than before.
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#1f2937',
          'text-halo-width': 1.3,
          'text-halo-blur': 0.2,
          'text-opacity': 0.85,
        },
      });

      if (mode === 'blitz') {
        // Feature-state-driven fill+outline pair, added once, ever, for this
        // map instance -- blitzHighlight.js only ever calls setFeatureState
        // against these, never addLayer/removeLayer. Also doubles as the
        // queryRenderedFeatures hit-test target for tap-to-state resolution
        // (BlitzMap.jsx), since it's a fill layer covering every state.
        // 'match' can't use null as a label (strings/numbers only) -- using
        // it here silently failed addLayer, so BLITZ_FILL never rendered
        // and queryRenderedFeatures always came back empty. 'case' with an
        // explicit '==' comparison handles the unset (null) state correctly.
        const BLITZ_COLOR = [
          'case',
          ['==', ['feature-state', 'blitzStatus'], 'selected'], '#227743',
          ['==', ['feature-state', 'blitzStatus'], 'correct'], '#22c55e',
          ['==', ['feature-state', 'blitzStatus'], 'wrong'], '#dc2626',
          'transparent',
        ];
        // 160ms, not MAP_CONFIG.TRANSITION_MS (300ms, used for the slower
        // basemap crossfade) -- this fires on every tap, so it needs to
        // read as responsive, just no longer an instant color snap.
        const BLITZ_TRANSITION = { duration: 160, delay: 0 };
        map.addLayer({
          id: LAYER_IDS.BLITZ_FILL, type: 'fill', source: 'india-states',
          paint: {
            'fill-color': BLITZ_COLOR,
            'fill-opacity': ['case', ['==', ['feature-state', 'blitzStatus'], null], 0, 0.35],
            'fill-color-transition': BLITZ_TRANSITION,
            'fill-opacity-transition': BLITZ_TRANSITION,
          },
        });
        map.addLayer({
          id: LAYER_IDS.BLITZ_OUTLINE, type: 'line', source: 'india-states',
          paint: {
            'line-color': BLITZ_COLOR,
            'line-width': 2,
            'line-opacity': ['case', ['==', ['feature-state', 'blitzStatus'], null], 0, 1],
            'line-color-transition': BLITZ_TRANSITION,
            'line-opacity-transition': BLITZ_TRANSITION,
          },
        });

        // Hint fill+outline pair -- added once here, same persistent
        // add-once idiom as BLITZ_FILL/BLITZ_OUTLINE above, instead of
        // blitzHighlight.js calling addLayer/removeLayer on every hint
        // show/hide. That cycling was the source of a visible flicker: a
        // freshly addLayer'd layer starts with the *previous* round's
        // now-stale filter result still in MapLibre's internal tile-feature
        // cache for one paint, so the old highlighted states flashed before
        // the new filter took over. An empty literal-list filter matches no
        // features and costs nothing to keep mounted between rounds --
        // showHintRegion/hideHintRegion now only ever call setFilter.
        const NO_HINT_FILTER = ['in', ['get', 'st_nm'], ['literal', []]];
        map.addLayer({
          id: LAYER_IDS.BLITZ_HINT_FILL, type: 'fill', source: 'india-states', filter: NO_HINT_FILTER,
          paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.25 },
        });
        map.addLayer({
          id: LAYER_IDS.BLITZ_HINT_OUTLINE, type: 'line', source: 'india-states', filter: NO_HINT_FILTER,
          paint: { 'line-color': '#f59e0b', 'line-width': 1.5, 'line-opacity': 0.9 },
        });
      }

      // Casing for boundary_2/boundary_disputed (both already present in
      // map-style.json by the time 'load' fires), inserted directly beneath
      // each via the `before` id so it renders as an outline, not a
      // duplicate line. Visible by default with BASE_VISUAL's light casing
      // paint -- restyleBordersAndRivers swaps it to SATELLITE_VISUAL's dark
      // casing on satellite toggle (see config.js's BOUNDARY_CASING_* comment).
      if (map.getLayer('boundary_2')) {
        map.addLayer({
          id: LAYER_IDS.BOUNDARY_2_CASING, type: 'line', source: 'openmaptiles', 'source-layer': 'boundary',
          filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1], ['!', ['has', 'claimed_by']]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color':   BASE_VISUAL.BOUNDARY_CASING_COLOR,
            'line-opacity': BASE_VISUAL.BOUNDARY_CASING_OPACITY,
            'line-width':   BASE_VISUAL.BOUNDARY_CASING_WIDTH_EXPR,
          },
        }, 'boundary_2');
      }
      if (map.getLayer('boundary_disputed')) {
        map.addLayer({
          id: LAYER_IDS.BOUNDARY_DISPUTED_CASING, type: 'line', source: 'openmaptiles', 'source-layer': 'boundary',
          filter: ['all', ['!=', ['get', 'maritime'], 1], ['==', ['get', 'disputed'], 1]],
          paint: {
            'line-color':   BASE_VISUAL.BOUNDARY_CASING_COLOR,
            'line-opacity': BASE_VISUAL.BOUNDARY_CASING_OPACITY,
            'line-width':   BASE_VISUAL.BOUNDARY_CASING_WIDTH_EXPR,
          },
        }, 'boundary_disputed');
      }

      // Data streams in via the shared cache below, same reasoning as
      // india-states/india-state-labels above -- a raw URL here would let
      // MapLibre fetch it itself, once per map instance, with no dedup.
      map.addSource('india-boundary', { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
      loadSharedGeoJsonOnce('/india-boundary.geojson', (geojson) => geojson)
        .then((geojson) => map.getSource('india-boundary')?.setData(geojson))
        .catch(() => {});

      // Casing added immediately before INDIA_BOUNDARY_LINE (both appended in
      // order below, nothing else renders between them) so it sits directly
      // underneath as an outline, same technique as the two layers above.
      map.addLayer({
        id: LAYER_IDS.INDIA_BOUNDARY_CASING, type: 'line', source: 'india-boundary',
        paint: {
          'line-color':   BASE_VISUAL.BOUNDARY_CASING_COLOR,
          'line-opacity': BASE_VISUAL.BOUNDARY_CASING_OPACITY,
          'line-width':   BASE_VISUAL.INDIA_BOUNDARY_CASING_WIDTH,
        },
      });
      map.addLayer({
        id: LAYER_IDS.INDIA_BOUNDARY_LINE, type: 'line', source: 'india-boundary',
        paint: { 'line-color': BASE_VISUAL.BOUNDARY_COLOR, 'line-width': 2 },
      });
      // Always visible, both modes, both difficulties -- draws the compliance-patched
      // Aksai Chin/PoK border on top of OFM's boundary line. Not user-toggleable.

      // Latch BEFORE the calls below -- setPolitical reads
      // mapReadyRef.current as its own guard now.
      mapReadyRef.current = true;
      setState(prev => ({ ...prev, mapReady: true }));

      // Blitz never shows hypsometric-tint/base-hillshade (permanently
      // hidden by map-style.json's own default, plus blitzStyleTransform
      // already bakes BARE_VISUAL straight into its style object before
      // construction) and has no Terrain toggle, so it has nothing to
      // capture or reveal here.
      if (mode !== 'blitz') {
        originalPaintRef.current = captureOriginalPaint(map);
        // hypsometric-tint/base-hillshade default to hidden in
        // map-style.json now (see that file's comment) specifically so
        // 'load' doesn't wait on their DEM tiles -- reveal them right
        // after the map settles instead of blocking first paint on them.
        // Guarded on satellite: if the person toggles Satellite on inside
        // this brief window, applyTerrainVisual must not fight
        // SATELLITE_VISUAL's colors -- setSatellite's own off-path calls
        // this same function once satellite is turned back off instead.
        map.once('idle', () => {
          if (satelliteRef.current) return;
          applyTerrainVisual(map, terrainRef.current, originalPaintRef.current, terrainHideTimerRef, terrainRevealRafRef);
        });
      }

      if (mode === 'daily') {
        setPolitical(true); // mandatory, non-togglable -- Daily always shows state borders now
        setPoliticalNames(true); // labels themselves gated by the layer's minzoom above, not this toggle
      } else if (mode === 'blitz') {
        setPolitical(true); // mandatory, non-togglable -- state shapes must read clearly
      } else {
        // Classic: no more Names toggle -- force politicalNames on so labels
        // follow the layer's minzoom (STATE_LABEL_MIN_ZOOM) alone, same as
        // Daily. Borders defaults on but stays manually toggleable (see the
        // Borders checkbox in ClassicMap.jsx).
        setPoliticalNames(true);
        setPolitical(true);
      }
    }

    // Defensive addition beyond the literal spec pseudocode: if 'load' already fired
    // before this effect attached its listener, .once('load', ...) would never call
    // onLoad. Same fragility class as the documented map.once('error') gotcha.
    let slowLoadTimer = null;
    if (map.loaded()) {
      onLoad();
    } else {
      map.once('load', onLoad);
      // 'load' has no built-in timeout -- it simply doesn't fire until every
      // first-render resource (OpenFreeMap vector tiles/sprite/glyphs) has
      // downloaded, however long that takes. AWS terrain-dem tiles are NOT
      // among these -- hypsometric-tint/base-hillshade default to hidden in
      // map-style.json, so their tiles are deferred to the idle-triggered
      // reveal above instead of gating 'load' itself. This
      // doesn't fix a slow network/CDN, but it stops the map from sitting
      // there with zero feedback: past this point the UI can tell the
      // person something's still in progress instead of looking stuck.
      slowLoadTimer = setTimeout(() => {
        setState(prev => (prev.mapReady ? prev : { ...prev, mapLoadSlow: true }));
      }, MAP_CONFIG.LOAD_SLOW_TIMEOUT_MS);
    }

    return () => {
      map.off('load', onLoad); // remove only the listener this hook added
      if (slowLoadTimer) clearTimeout(slowLoadTimer);
      // Do NOT call map.remove() -- owned by MapContainer.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef.current, mode]);

  return {
    ...state,
    setSatellite,
    setPolitical,
    setPoliticalNames,
    setTerrain,
  };
}
