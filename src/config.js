export const FEEDBACK_FORM_URL = import.meta.env.VITE_FEEDBACK_FORM_URL;
export const FEEDBACK_ENTRY_ID = import.meta.env.VITE_FEEDBACK_ENTRY_ID;
export const APP_URL   = 'https://ecoguesser.pages.dev';
export const MAP_STYLE = '/map-style.json';

export const MAP_CONFIG = {
  INDIA_BOUNDS:       [[68.1,6.4],[97.4,37.1]],
  MAX_BOUNDS:         [[55,4],[102,40]],
  INDIA_CENTER:       [82.5,22.5],     // flyTo() Reset button only
  INDIA_ZOOM:         4.5,             // flyTo() Reset button only
  MIN_ZOOM: 4, MAX_ZOOM: 10,
  SATELLITE_MAX_ZOOM: 9,
};
// Do NOT pass INDIA_CENTER/INDIA_ZOOM to MapLibre constructor.

export const SATELLITE_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';
export const SATELLITE_ATTRIBUTION = 'Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)';

// v8.9 -- full satellite visual spec. hillshade "multiply blend" is NOT a literal
// MapLibre paint property -- closest available parameter is hillshade-exaggeration,
// which controls shading strength, not a true blend mode.
export const SATELLITE_VISUAL = {
  BACKGROUND: '#021B3A',
  RASTER_PAINT: {
    saturation:     0.10,
    contrast:       0.07,
    brightnessMin:  0.02,
    brightnessMax:  0.90,
    resampling:     'linear',
  },
  WATER_COLOR:    '#043A6B',
  WATER_OPACITY:  0.32,
  RIVER_COLOR:    '#5A95B8',
  RIVER_OPACITY:  0.55,
  BOUNDARY_COLOR:   '#E8ECEF',
  BOUNDARY_OPACITY: 0.55,
  BOUNDARY_WIDTH:   1,
  TERRAIN_TILES:    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  TERRAIN_ENCODING: 'terrarium',
  HILLSHADE: {
    illuminationDirection: 335,
    illuminationAnchor:    'viewport',
    exaggeration:          0.22,
    shadowColor:           '#50554A',
    highlightColor:        '#F5F7F7',
    accentColor:           '#D8E3EA',
  },
  VIGNETTE: { innerStopRatio: 0.28, outerStopRatio: 0.74, maxOpacity: 0.12 },
  GLOW:     { color: '123,196,255', innerStopRatio: 0.35, outerStopRatio: 0.72, maxOpacity: 0.10 },
};

// Base-mode (non-satellite) colors/expressions, needed to restore on satellite OFF --
// must match public/map-style.json EXACTLY, including the zoom-interpolated
// expressions for boundary opacity/width (NOT flat numbers, or restoring after
// satellite OFF would look wrong at every zoom level except where the flat
// override happened to coincide with the real curve).
export const BASE_VISUAL = {
  RIVER_COLOR:   '#a0c8f0',
  RIVER_OPACITY: 1,
  WATER_COLOR:   'rgb(158,189,255)',
  BACKGROUND:    '#f8f4f0',
  BOUNDARY_COLOR:    'hsl(248,1%,41%)',
  BOUNDARY_OPACITY_EXPR: ['interpolate', ['linear'], ['zoom'], 0, 0.4, 4, 1],
  BOUNDARY_WIDTH_EXPR:   ['interpolate', ['linear'], ['zoom'], 3, 1, 5, 1.2, 12, 3],
  STATE_LINE_COLOR: '#6b7280',
  STATE_LINE_WIDTH: 0.8,
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
};

export const SCORING = { MAX_SCORE: 5000, DECAY_KM: 50, HINT_PENALTY: 500 };

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
