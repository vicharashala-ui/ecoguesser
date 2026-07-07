// scripts/buildMapStyle.js
// Fetches the OpenFreeMap Liberty style, strips roads/buildings/POI/transit
// layers and irrelevant text labels, keeps only the boundary layers EcoGuesser
// needs, and writes the result to public/map-style.json.
//
// Run BEFORE simplifyBoundaries.js is irrelevant here -- this writes a style
// file, not a boundary geometry file. Safe to run any time; re-run if OFM
// changes their upstream Liberty style.

const fs  = require('fs');
const path = require('path');

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const OUT_PATH  = path.join(__dirname, '../public/map-style.json');

// NOTE: layer['admin_level'] is ALWAYS undefined on the layer object itself --
// admin_level lives in each *feature's* properties, not the layer definition.
// Filter by layer.id / layer['source-layer'], never layer.admin_level.

const REMOVE_ID_PATTERNS = [
  'road', 'tunnel', 'bridge', 'building', 'parking', 'transit', 'rail', 'aeroway',
  // Fill-type layers, not caught by id-substring alone -- previously leaked
  // green landcover/landuse blotches onto the map before being added here.
  'park', 'landuse', 'landcover',
];

const REMOVE_SYMBOL_SOURCE_LAYERS = [
  'poi', 'housenumber', 'address', 'place', 'transportation_name',
  'aerodrome_label', // airport name labels -- not caught by REMOVE_ID_PATTERNS
                      // since the layer id is just "airport", not "*aeroway*"
];

// Matched against layer.id ONLY when layer['source-layer'] === 'boundary'.
// Liberty's actual boundary layer ids use underscores: boundary_2, boundary_3,
// boundary_disputed -- NOT "boundary-2" (hyphen). A hyphenated pattern here
// silently matches nothing and drops the country-outline layer entirely.
const KEEP_BOUNDARY_PATTERNS = ['boundary_2', 'country', 'disputed', 'coastline'];
// 'country' and 'coastline' currently match no layer in Liberty (kept as
// future-proofing in case OFM adds dedicated layers under those names).

function filterLayers(layers) {
  return layers.filter(layer => {
    if (REMOVE_ID_PATTERNS.some(p => layer.id.includes(p))) return false;

    if (layer.type === 'symbol' &&
        REMOVE_SYMBOL_SOURCE_LAYERS.some(sl => layer['source-layer']?.includes(sl))) {
      return false;
    }

    if (layer['source-layer'] === 'boundary') {
      return KEEP_BOUNDARY_PATTERNS.some(p => layer.id.includes(p));
    }

    return true;
  });
}

// The blanket 'place' removal above also strips country labels (they share
// source-layer "place" with city/town labels; there's no layer-level way to
// tell admin classes apart). Re-added here as a hand-built layer.
function buildCountryLabelLayer() {
  return {
    id: 'country_label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
    minzoom: 3, filter: ['==', ['get', 'class'], 'country'],
    layout: {
      'text-field': ['case', ['has', 'name:nonlatin'],
        ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
        ['coalesce', ['get', 'name_en'], ['get', 'name']]],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 17],
    },
    paint: { 'text-color': '#374151', 'text-halo-color': 'rgba(255,255,255,0.8)', 'text-halo-width': 1.2 },
  };
}

// The blanket 'place' removal also strips city/town/village labels (used
// in-game as location context clues), not just country labels. Re-added
// here, alongside the country layer, with the same solid-white-fill /
// dark-halo treatment used everywhere else in the style so text stays
// legible over both the light base map and satellite imagery -- a plain
// dark-fill/white-halo combo (the OFM Liberty default) washes out badly
// over bright satellite terrain.
// White text with a soft, blurred dark shadow (not a hard outline ring) --
// matches the label treatment used in Google Maps' satellite view: the
// text reads as "floating" over the imagery rather than boxed in a ring.
const PLACE_TEXT_PAINT = {
  'text-color': '#ffffff',
  'text-halo-color': 'rgba(0,0,0,0.55)',
  'text-halo-width': 1,
  'text-halo-blur': 0.8,
};

const PLACE_TEXT_FIELD = ['case', ['has', 'name:nonlatin'],
  ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
  ['coalesce', ['get', 'name_en'], ['get', 'name']]];

function buildPlaceLabelLayer(id, cls, minzoom, sizeStops) {
  return {
    id, type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
    minzoom, filter: ['==', ['get', 'class'], cls],
    layout: {
      'text-field': PLACE_TEXT_FIELD,
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], ...sizeStops],
      'text-offset': [0, 0.8],
      'text-anchor': 'top',
    },
    paint: PLACE_TEXT_PAINT,
  };
}

// minzoom for every place category dropped by 1 from the original city:6/
// town:9/village:11 -- each label class now appears one zoom level earlier.
function buildCityLabelLayer() {
  return buildPlaceLabelLayer('place_city_label', 'city', 5, [4, 10, 8, 15]);
}

function buildTownLabelLayer() {
  return buildPlaceLabelLayer('place_town_label', 'town', 8, [7, 9, 10, 13]);
}

function buildVillageLabelLayer() {
  return buildPlaceLabelLayer('place_village_label', 'village', 10, [9, 8, 11, 11]);
}

// New: hamlet class wasn't previously re-added (only city/town/village were),
// so the smallest, most numerous OpenMapTiles place class was invisible.
// Adding it puts noticeably more named places on the map, especially useful
// context around rural protected areas where a hamlet may be the nearest
// named place. minzoom 11 (one below the pre-existing village-label
// baseline of 12, matching the same "-1" shift as the other three classes).
function buildHamletLabelLayer() {
  return buildPlaceLabelLayer('place_hamlet_label', 'hamlet', 11, [9, 7, 11, 10]);
}

async function main() {
  console.log(`Fetching ${STYLE_URL} ...`);
  const res = await fetch(STYLE_URL);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const style = await res.json();

  const before = style.layers.length;
  style.layers = filterLayers(style.layers);
  style.layers.push(buildCityLabelLayer());
  style.layers.push(buildTownLabelLayer());
  style.layers.push(buildVillageLabelLayer());
  style.layers.push(buildHamletLabelLayer());
  style.layers.push(buildCountryLabelLayer());
  const after = style.layers.length;

  fs.writeFileSync(OUT_PATH, JSON.stringify(style));

  console.log(`Layers: ${before} -> ${after} (removed ${before - after})`);
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
