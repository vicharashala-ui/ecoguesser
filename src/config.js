export const FEEDBACK_FORM_URL = import.meta.env.VITE_FEEDBACK_FORM_URL;
export const FEEDBACK_ENTRY_ID = import.meta.env.VITE_FEEDBACK_ENTRY_ID;
export const APP_URL   = 'https://ecoguesser.pages.dev';
export const MAP_STYLE = '/map-style.json';

export const MAP_CONFIG = {
  INDIA_BOUNDS:       [[68.1,6.4],[97.4,37.1]],
  MAX_BOUNDS:         [[45,-8],[112,52]],
  INDIA_CENTER:       [82.5,22.5],     // flyTo() Reset button only
  INDIA_ZOOM:         4.5,             // flyTo() Reset button only
  MIN_ZOOM: 3, MAX_ZOOM: 12,
  SATELLITE_MAX_ZOOM: 8,
};
// Do NOT pass INDIA_CENTER/INDIA_ZOOM to MapLibre constructor.

// v9.0 -- satellite source switched from EOX Sentinel-2 cloudless to ArcGIS World
// Imagery, routed through our own edge-caching proxy (functions/tiles/[[path]].js)
// to stay within a 2M-tile/month ArcGIS quota as player count grows -- repeat
// requests for the same tile (very likely, since locations are a fixed set of
// protected areas) are served from Cloudflare's cache instead of hitting ArcGIS.
export const SATELLITE_TILES = '/tiles/{z}/{y}/{x}';
export const SATELLITE_ATTRIBUTION = 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

// Rollback path -- if ArcGIS quality/quota doesn't work out, swap SATELLITE_TILES
// and SATELLITE_ATTRIBUTION back to these two. See spec v9.0 section 6.
export const SATELLITE_TILES_EOX = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';
export const SATELLITE_ATTRIBUTION_EOX = 'Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)';

// v9.1 -- shared AWS Terrarium DEM source feeding BOTH satellite's optional
// hillshade and the base map's always-on hillshade + hypsometric tint
// (public/map-style.json: 'terrain-dem' source, 'hypsometric-tint' /
// 'base-hillshade' layers). Hoisted here once instead of duplicated per-mode.
export const TERRAIN_TILES    = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const TERRAIN_ENCODING = 'terrarium';

// v9.0 -- full satellite visual spec. hillshade "multiply blend" is NOT a literal
// MapLibre paint property -- closest available parameter is hillshade-exaggeration,
// which controls shading strength, not a true blend mode.
export const SATELLITE_VISUAL = {
  BACKGROUND: '#021B3A',
  // Scoped to the satellite raster layer only (raster-* paint properties), not a
  // canvas-wide CSS filter -- MapLibre draws satellite + boundaries + hints into one
  // shared canvas, so a container-level filter would also tint boundary/hint colors.
  // Values below target the same "punchier, slightly darkened" feel as a CSS
  // contrast(1.15) saturate(1.1) brightness(0.85) filter, mapped onto MapLibre's
  // raster-paint scale rather than a literal unit conversion -- re-tune against
  // real ArcGIS tiles if the look needs adjusting (spec v9.0 open item).
  RASTER_PAINT: {
    saturation:     0.15,
    contrast:       0.15,
    brightnessMin:  0.0,
    brightnessMax:  0.88,
    resampling:     'linear',
  },
  WATER_COLOR:    '#043A6B',
  WATER_OPACITY:  0.32,
  RIVER_COLOR:    '#5A95B8',
  RIVER_OPACITY:  0.55,
  BOUNDARY_COLOR:   '#E8ECEF',
  BOUNDARY_OPACITY: 0.55,
  BOUNDARY_WIDTH:   1,
  // Dropped for v9.0 (not deleted) -- reference look (test7.html) has no 3D terrain
  // at all. Config kept intact so re-enabling later is a one-line flip of
  // HILLSHADE_ENABLED, not a rebuild.
  HILLSHADE_ENABLED: false,
  HILLSHADE: {
    illuminationDirection: 335,
    illuminationAnchor:    'viewport',
    exaggeration:          0.22,
    shadowColor:           '#50554A',
    highlightColor:        '#F5F7F7',
    accentColor:           '#D8E3EA',
  },
  // v9.0 -- stronger, two-stop vignette matching the reference's steeper edge
  // darkening (near-transparent center, ~45% black at the mid stop, ~85% black at
  // the edge) -- v8.9's single falloff to 12% barely read as intentional.
  VIGNETTE: {
    innerStopRatio: 0.28,
    midStopRatio:   0.68,
    midOpacity:     0.45,
    outerStopRatio: 1.0,
    maxOpacity:     0.85,
  },
  GLOW: { color: '123,196,255', innerStopRatio: 0.35, outerStopRatio: 0.72, maxOpacity: 0.10 },
};

// Base-mode (non-satellite) colors/expressions, needed to restore on satellite OFF --
// must match public/map-style.json EXACTLY, including the zoom-interpolated
// expressions for boundary opacity/width (NOT flat numbers, or restoring after
// satellite OFF would look wrong at every zoom level except where the flat
// override happened to coincide with the real curve).
export const BASE_VISUAL = {
  RIVER_COLOR:   '#a0c8f0',
  RIVER_OPACITY: 1,
  WATER_COLOR:   '#4a80ab',
  BACKGROUND:    '#f8f4f0',
  BOUNDARY_COLOR:    '#2d5a3f',
  BOUNDARY_OPACITY_EXPR: ['interpolate', ['linear'], ['zoom'], 0, 0.4, 4, 1],
  BOUNDARY_WIDTH_EXPR:   ['interpolate', ['linear'], ['zoom'], 3, 1, 5, 1.2, 12, 3],
  // Deliberately NOT tied to BOUNDARY_COLOR (country border) -- state lines are a
  // gameplay hint overlay and must stay muted so they never compete visually with
  // protected-area boundaries. See useMapState.js restyleBordersAndRivers.
  STATE_LINE_COLOR:   '#6b7280',
  STATE_LINE_WIDTH:   0.8,
  STATE_LINE_OPACITY: 0.6,
};

export const LAYER_IDS = {
  SATELLITE:           'satellite-layer',
  STATE_LINES:         'state-boundaries',
  STATE_LABELS:        'state-labels',
  HINT_FILL:           'hint-state-fill',
  HINT_OUTLINE:        'hint-state-outline',
  RESULT_DATA:         'result-data',
  RESULT_LINE:         'result-line',
  RESULT_LABEL:        'result-label',
  RESULT_BOUNDARY:     'result-boundary',
  CORRECT_PIN:         'correct-pin',
  INDIA_BOUNDARY_LINE: 'india-boundary-line',
  BLITZ_FILL:          'blitz-fill',
  BLITZ_OUTLINE:       'blitz-outline',
  BLITZ_BOUNDARY:      'blitz-boundary',
};

export const SCORING = { MAX_SCORE: 5000, DECAY_KM: 100, HINT_PENALTY: 500 };

export const DAILY = {
  CATEGORIES: ['np','wls','tr','br','ramsar'],
  COLLISION_KM: 50, TIMER_SECONDS: 120,
};

export const DIFFICULTY_DEFAULTS = {
  easy:   { political:true,  politicalNames:true  },
  normal: { political:true,  politicalNames:false },
  hard:   { political:false, politicalNames:false },
};

export const CATEGORY_META = {
  np:     { label:'National Park',      color:'#16a34a' },
  wls:    { label:'Wildlife Sanctuary', color:'#059669' },
  tr:     { label:'Tiger Reserve',      color:'#dc2626' },
  br:     { label:'Biosphere Reserve',  color:'#7c3aed' },
  ramsar: { label:'Ramsar Site',        color:'#0284c7' },
};

export const LS_KEYS = {
  UUID:        'ecoguesser_uuid',
  NAME:        'ecoguesser_name',
  DIFFICULTY:  'ecoguesser_difficulty',
  STATS_DAILY: 'stats_daily',
  STATS_NORM:  'stats_normal',
  RANK_TODAY:  'ecoguesser_rank_today', // { date, rank } -- rank only valid when date === today
};
