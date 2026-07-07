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

async function main() {
  console.log(`Fetching ${STYLE_URL} ...`);
  const res = await fetch(STYLE_URL);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const style = await res.json();

  const before = style.layers.length;
  style.layers = filterLayers(style.layers);
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
