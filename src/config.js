export const FEEDBACK_FORM_URL = import.meta.env.VITE_FEEDBACK_FORM_URL;
export const FEEDBACK_ENTRY_ID = import.meta.env.VITE_FEEDBACK_ENTRY_ID;
export const APP_URL   = 'https://ecoguesser.pages.dev';
export const MAP_STYLE = '/map-style.json';
// Blitz used to load a second, hand-maintained static style file
// (map-style-ofm.json) since state-fill/outline highlighting reads worse
// over the terrain/hillshade look. That file had quietly drifted stale
// (missing bilingual name:nonlatin label support added to map-style.json
// later) without anything surfacing it. Retired in favor of BlitzMap.jsx's
// blitzStyleTransform, which derives the same flat look from MAP_STYLE at
// runtime -- one source of truth, can't drift silently again.

export const MAP_CONFIG = {
  INDIA_BOUNDS:       [[68.1,6.4],[97.4,37.1]],
  MAX_BOUNDS:         [[45,-18],[112,52]],
  // INDIA_CENTER/INDIA_ZOOM removed: their "flyTo() Reset button only"
  // comments had gone stale -- RecenterButton.jsx resets via
  // fitBounds(INDIA_BOUNDS, FIT_PADDING), same as every other framing
  // call site, so nothing consumed them (verified repo-wide).
  MIN_ZOOM: 3, MAX_ZOOM: 12,
  SATELLITE_MAX_ZOOM: 11,
  // Daily AND Classic both use this now -- state names stay hidden until
  // zoomed in this far, with no manual toggle in either mode. Blitz is
  // unaffected (its own "State Names" toggle shows/hides immediately,
  // independent of zoom).
  STATE_LABEL_MIN_ZOOM: 4,
  // Portrait viewports are much taller than INDIA_BOUNDS' aspect ratio, so
  // fitBounds always has vertical slack left over after the width fits.
  // Uneven top/bottom padding biases where that slack goes -- less above
  // (Central Asia) and more below (ocean) -- instead of the flat `20` every
  // fitBounds(MAP_CONFIG.INDIA_BOUNDS, ...) call used to share.
  // top: fitBounds centers INDIA_BOUNDS within the (top, height-bottom) box,
  // so raising top shifts that box's center down, pushing J&K further from
  // the header. Was 100 (header height 72 + layer-panel's top offset 10 +
  // panel's own top padding 10 + half a toggle row), from when the top-right
  // stack was a single toggle row. Raised to 210 (72 + 10 + ~38 for the
  // Borders-only panel + 10 gap + ~67 for the Terrain/Satellite square row
  // and its captions + ~15 margin) now that the stack is two rows tall, so
  // India's north edge clears the whole stack -- the squares sit over
  // Tibet/China above Arunachal Pradesh instead of overlapping J&K/the
  // northeast. Built the same additive-pixel way as the original estimate,
  // not visually verified against a live render, so nudge it further if the
  // squares still land on Indian territory in the browser. Shared by every
  // fitBounds(INDIA_BOUNDS, ...) call site (Classic/Daily/Blitz initial
  // load + reset, RecenterButton), so this one value keeps the framing
  // consistent across all three modes.
  FIT_PADDING: { top: 210, bottom: 260, left: 24, right: 24 },
  // Terrain/Satellite layer-toggle fade duration. Two things must agree with
  // this number: map-style.json's root-level "transition" (every paint
  // property in the style animates over this long by default -- background/
  // water/boundary/waterway/place-label colors all ride it for free) and the
  // setTimeout delays in useMapState.js that wait for a fade-out to finish
  // before actually hiding a layer (stops fetching its tiles) or tearing
  // down the satellite source. If you change one, change all three.
  TRANSITION_MS: 300,
  // How long useMapState.js waits with no 'load' event before flipping
  // mapLoadSlow true -- escalates DailyMap.jsx's loading pill from a quiet
  // "Loading map..." to a "check your connection" warning. Was a bare
  // 8000 inline in useMapState.js; pulled out here so it's tunable
  // alongside every other timing constant instead of hidden in hook logic.
  LOAD_SLOW_TIMEOUT_MS: 8000,
};
// Do NOT pass INDIA_CENTER/INDIA_ZOOM to MapLibre constructor.

// Satellite source is ArcGIS World Imagery, routed through our own edge-
// caching proxy (functions/tiles/[[path]].js) to stay within a 2M-tile/
// month ArcGIS quota -- repeat requests for the same tile (likely, since
// locations are a fixed set of protected areas) are served from
// Cloudflare's cache instead of hitting ArcGIS.
export const SATELLITE_TILES = '/tiles/{z}/{y}/{x}';
export const SATELLITE_ATTRIBUTION = 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

// Shared AWS Terrarium DEM source feeding both satellite's optional
// hillshade and the base map's always-on hillshade + hypsometric tint
// (public/map-style.json: 'terrain-dem' source, 'hypsometric-tint' /
// 'base-hillshade' layers). Hoisted here once instead of duplicated per-mode.
//
// Routed through our own edge-caching proxy (functions/tiles/dem/[[path]].js),
// same pattern as SATELLITE_TILES below -- was a raw s3.amazonaws.com URL,
// which cost every session a separate external DNS+TCP+TLS connection (its
// own preconnect in index.html) with no edge caching of its own. Terrarium's
// bucket is public with no quota to protect (unlike ArcGIS), but same-origin
// + Cloudflare edge cache is still a real win for repeat z/x/y requests
// across players, since India's protected areas cluster the same regions.
// No trailing .png here, matching SATELLITE_TILES' extension-less style --
// the proxy's own upstream fetch appends it (see handleDemTileProxy).
export const TERRAIN_TILES    = '/tiles/dem/{z}/{x}/{y}';
export const TERRAIN_ENCODING = 'terrarium';

// Full satellite visual spec. hillshade "multiply blend" is not a literal
// MapLibre paint property -- closest available parameter is
// hillshade-exaggeration, which controls shading strength, not a true blend mode.
export const SATELLITE_VISUAL = {
  // Matches BASE_VISUAL.BACKGROUND -- previously a dark navy override
  // (#021B3A) that tinted the whole view; removed so satellite has no
  // background color of its own beyond the raw imagery.
  BACKGROUND: '#f8f4f0',
  // Scoped to the satellite raster layer only (raster-* paint properties), not a
  // canvas-wide CSS filter -- MapLibre draws satellite + boundaries + hints into one
  // shared canvas, so a container-level filter would also tint boundary/hint colors.
  // No processing applied -- raw Esri imagery, unfiltered. (Previously
  // carried a "punchier" contrast(1.15) saturate(1.1) style adjustment via
  // these raster-paint values; removed per request to see the original
  // source imagery as-is.)
  RASTER_PAINT: {
    saturation:     0,
    contrast:       0,
    brightnessMin:  0.0,
    brightnessMax:  1.0,
    resampling:     'linear',
  },
  // Water/river tint overlays removed (opacity 0) -- water and rivers now
  // show raw imagery color instead of a navy/blue color layered on top.
  WATER_COLOR:    '#043A6B',
  WATER_OPACITY:  0,
  RIVER_COLOR:    '#5A95B8',
  RIVER_OPACITY:  0,
  BOUNDARY_COLOR:   '#E8ECEF',
  BOUNDARY_OPACITY: 0.55,
  BOUNDARY_WIDTH:   1,
  // Dark casing drawn directly beneath the (near-white) boundary lines,
  // satellite-mode only. Without it the pale BOUNDARY_COLOR line all but
  // disappears over bright/snow-covered terrain (Himalayan north -- Ladakh,
  // Aksai Chin, the Nepal/China frontier), since a light line at 0.55
  // opacity has almost no contrast against light-colored imagery. The dark
  // casing guarantees contrast against ANY background brightness: it reads
  // as an outline on light terrain, and simply sits invisible behind the
  // light line over dark terrain. Same technique as road-casing in
  // cartography. Only added to the three international-boundary line
  // layers (boundary_2 / boundary_disputed / INDIA_BOUNDARY_LINE) -- state
  // lines (STATE_LINE_COLOR) are a warm tan, not near-white, and don't have
  // this problem.
  BOUNDARY_CASING_COLOR:   '#04101c',
  BOUNDARY_CASING_OPACITY: 0.65,
  BOUNDARY_CASING_WIDTH:   3,      // vs. the flat BOUNDARY_WIDTH:1 used by boundary_2/disputed in satellite
  INDIA_BOUNDARY_CASING_WIDTH: 3.5, // INDIA_BOUNDARY_LINE's own width is a constant 2, unaffected by BOUNDARY_WIDTH
  // Deliberately its own tone, not BOUNDARY_COLOR -- state lines (the
  // "Borders" toggle) must still read as a distinct gameplay hint overlay
  // from the international border, not a second copy of it, even on
  // satellite. A warm light tan (vs. the boundary's cool pale grey) keeps
  // that distinction while actually showing up against the darkened raster
  // -- BASE_VISUAL's dark hint color is invisible there.
  STATE_LINE_COLOR:   '#e8d9ad',
  STATE_LINE_OPACITY: 0.85,
  STATE_LINE_WIDTH:   1.3,
  // Not currently used -- the reference look has no 3D terrain. Config kept
  // intact so re-enabling later is a one-line flip of HILLSHADE_ENABLED.
  HILLSHADE_ENABLED: false,
  HILLSHADE: {
    illuminationDirection: 335,
    illuminationAnchor:    'viewport',
    exaggeration:          0.22,
    shadowColor:           '#50554A',
    highlightColor:        '#F5F7F7',
    accentColor:           '#D8E3EA',
  },
};

// Base-mode (non-satellite) colors/expressions, needed to restore on satellite OFF --
// must match public/map-style.json EXACTLY, including the zoom-interpolated
// expressions for boundary opacity/width (NOT flat numbers, or restoring after
// satellite OFF would look wrong at every zoom level except where the flat
// override happened to coincide with the real curve).
export const BASE_VISUAL = {
  RIVER_COLOR:   '#7996ac',
  RIVER_OPACITY: 1,
  // Lowered so hypsometric-tint's ocean-depth gradient (same terrain-dem
  // source, negative-elevation stops) shows through as a bathymetry effect
  // instead of being hidden under a flat tint.
  WATER_COLOR:   '#8fadc7',
  WATER_OPACITY: 0.4,
  BACKGROUND:    '#f8f4f0',
  BOUNDARY_COLOR:    '#1c3b28',
  BOUNDARY_OPACITY_EXPR: ['interpolate', ['linear'], ['zoom'], 0, 0.8, 3, 1],
  BOUNDARY_WIDTH_EXPR:   ['interpolate', ['linear'], ['zoom'], 3, 2, 5, 2.5, 12, 4.5],
  // Deliberately NOT tied to BOUNDARY_COLOR (country border) -- state lines are a
  // gameplay hint overlay and must stay muted so they never compete visually with
  // protected-area boundaries. See useMapState.js restyleBordersAndRivers.
  // Darkened + made near-opaque (was #6b7280 @ 0.6) -- the old muted grey at 0.6
  // opacity sat too close in luminance to the terrain palette's mid-tone greens/
  // tans and nearly vanished once blended with hillshade underneath.
  STATE_LINE_COLOR:   '#4a4438',
  STATE_LINE_WIDTH:   1.1,
  STATE_LINE_OPACITY: 0.85,
  // Light casing behind boundary_2/boundary_disputed/INDIA_BOUNDARY_LINE --
  // mirrors SATELLITE_VISUAL's dark casing, just inverted, since here it's a
  // DARK line (BOUNDARY_COLOR) that can vanish over dark terrain (the
  // 3200-4800m hypsometric-tint band + hillshade shadow in the Himalayan
  // north / Northeast hills), not a light one. Same technique either way:
  // a casing of the opposite tone guarantees contrast regardless of what's
  // underneath.
  BOUNDARY_CASING_COLOR:   '#fdf8ec',
  BOUNDARY_CASING_OPACITY: 0.78,
  // Was a flat 3 -- at zoom 12 the (now-bolder) boundary line itself reaches
  // 4.5, which would make the casing narrower than the line it's meant to
  // outline. Interpolated so the casing stays wider than BOUNDARY_WIDTH_EXPR
  // at every zoom stop, keeping the halo effect intact when zoomed in.
  BOUNDARY_CASING_WIDTH_EXPR: ['interpolate', ['linear'], ['zoom'], 3, 4, 5, 4.5, 12, 6.5],
  INDIA_BOUNDARY_CASING_WIDTH: 5,
};

// "Terrain off" palette -- Classic/Daily's Terrain toggle switches to this,
// and BlitzMap.jsx's blitzStyleTransform bakes it in permanently (Blitz has
// no Terrain toggle). Originally hand-copied from a second static style
// file (map-style-ofm.json) that Blitz used to load on its own; that file
// had quietly gone stale -- missing buildMapStyle.js's later bilingual
// (name:nonlatin) text-field support -- so it was retired in favor of this
// single constant applied at runtime. See useMapState.js's
// applyTerrainVisual for how "terrain on" restores (a mix of BASE_VISUAL
// and the live style's own captured original paint) and BlitzMap.jsx for
// how Blitz applies this same object before the map is even constructed.
export const BARE_VISUAL = {
  BACKGROUND: '#ffffff',
  WATER_COLOR: 'rgb(158,189,255)',
  WATER_OPACITY: 0.6,
  // The bare/Blitz look has no ocean exclusion -- with hypsometric-tint
  // hidden there's no bathymetry gradient to show through underneath, so
  // the ocean needs to render as flat water like every other body of water.
  WATER_FILTER: ['!=', ['get', 'brunnel'], 'tunnel'],
  BOUNDARY_COLOR: 'hsl(248,1%,41%)',
  BOUNDARY_OPACITY_EXPR: ['interpolate', ['linear'], ['zoom'], 0, 0.4, 4, 1],
  BOUNDARY_WIDTH_EXPR:   ['interpolate', ['linear'], ['zoom'], 3, 1, 5, 1.2, 12, 3],
  RIVER_COLOR: '#a0c8f0',
  // place_city/town/village/hamlet_label all share this exact paint object
  // -- dark text/light halo, inverse of Classic/Daily's white-text/
  // dark-halo (buildMapStyle.js's PLACE_TEXT_PAINT).
  PLACE_LABEL_PAINT: {
    'text-color': '#1f2937',
    'text-halo-color': 'rgba(255,255,255,0.85)',
    'text-halo-width': 1.3,
    'text-halo-blur': 0.4,
  },
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
  CORRECT_PIN_HALO:    'correct-pin-halo',
  CORRECT_PIN:         'correct-pin',
  GUESS_PIN_HALO:      'guess-pin-halo',
  GUESS_PIN:           'guess-pin',
  INDIA_BOUNDARY_LINE: 'india-boundary-line',
  BOUNDARY_2_CASING:      'boundary-2-casing',
  BOUNDARY_DISPUTED_CASING: 'boundary-disputed-casing',
  INDIA_BOUNDARY_CASING:  'india-boundary-line-casing',
  BLITZ_FILL:          'blitz-fill',
  BLITZ_OUTLINE:       'blitz-outline',
  BLITZ_BOUNDARY:      'blitz-boundary',
  BLITZ_HINT_FILL:     'blitz-hint-fill',
  BLITZ_HINT_OUTLINE:  'blitz-hint-outline',
};

// DECAY_KM=92, not 100 -- distance is now measured to the site's boundary
// rather than its centroid, which acts as a per-site score bonus of
// roughly exp(effectiveRadius/DECAY_KM) for guesses that miss outside the
// site. Averaged over all 825 sites' real area_km2 (effectiveRadius =
// sqrt(area/pi)), that bonus was ~x1.08 at the old DECAY_KM=100 -- 92
// (100/1.081) cancels it back out for the typical "missed by more than the
// site's own radius" round, while still letting near-misses on the
// largest reserves (Great Rann of Kutch etc.) score noticeably better than
// before, which is the intended effect of the boundary-distance change.
export const SCORING = { MAX_SCORE: 5000, DECAY_KM: 92, HINT_PENALTY: 500 };

export const DAILY = {
  CATEGORIES: ['np','wls','tr','br','ramsar'],
  COLLISION_KM: 50, TIMER_SECONDS: 120,
};

// State name labels are no longer difficulty-gated -- Classic shows them by
// zoom alone (STATE_LABEL_MIN_ZOOM, same as Daily), same as every other
// difficulty level. Only the Borders toggle default still varies by level.
export const DIFFICULTY_DEFAULTS = {
  easy:   { political:true  },
  normal: { political:true  },
  hard:   { political:false },
};

export const CATEGORY_META = {
  np:     { label:'National Park',      color:'#ea580c' },
  br:     { label:'Biosphere Reserve',  color:'#db2777' },
  wls:    { label:'Wildlife Sanctuary', color:'#7c3aed' },
  tr:     { label:'Tiger Reserve',      color:'#92400e' },
  ramsar: { label:'Ramsar Site',        color:'#0284c7' },
};

// Ramsar site names (e.g. "Chilika Lake") don't carry a category word the
// way NP/WLS/TR/BR names do, so the guess panel and Daily Recap card both
// append this suffix for that category only. Shared here so the two call
// sites can't drift out of sync.
export function formatSiteName(site) {
  return site.category === 'ramsar' ? `${site.name} (Ramsar Site)` : site.name;
}

export const LS_KEYS = {
  UUID:        'ecoguesser_uuid',
  NAME:        'ecoguesser_name',
  DIFFICULTY:  'ecoguesser_difficulty',
  // Bumped to _v2: distance is now measured to the site boundary instead
  // of the centroid, so old bestDist/history entries aren't comparable to
  // new ones -- a version suffix naturally starts every player clean
  // rather than mixing the two metrics. loadNormalStats()/loadDailyStats()
  // already default-fall-back via try/catch on JSON.parse, so no separate
  // migration code is needed for the old key to just go unread.
  STATS_DAILY: 'stats_daily_v2',
  STATS_NORM:  'stats_normal_v2',
  STATS_BLITZ: 'stats_blitz',
  RANK_TODAY:  'ecoguesser_rank_today', // { date, rank } -- rank only valid when date === today
  RECAP_SHOWN: 'ecoguesser_recap_shown', // plain date string -- the day the recap modal last auto-opened
  INSTALL_PROMPT_SHOWN: 'ecoguesser_install_prompt_shown', // plain date string -- the day the Add-to-Home-Screen toast last auto-opened
  // Array of distinct site ids the player has encountered in Classic/Blitz
  // (a completed, Confirm'd round -- see recordSiteEncounter in stats.js).
  // Deliberately NOT written from Daily: Daily's 5 sites/day are the same
  // for every player, not a free choice from the full pool, so they don't
  // fit the same "exploring the collection" framing Classic/Blitz's
  // fully-random site picks do.
  SITES_SEEN:  'ecoguesser_sites_seen',
  SOUND:       'ecoguesser_sound',
  HAPTICS:     'ecoguesser_haptics',
};
