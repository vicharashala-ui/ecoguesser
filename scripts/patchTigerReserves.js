// scripts/patchTigerReserves.js
// Replaces point-approximate tiger reserve geometries with real polygon boundaries
// sourced from national_parks.geojson and wildlife_sanctuaries.geojson.
//
// INPUT:  data/raw/India_TigerReserves_58_All.geojson
//         data/raw/national_parks.geojson
//         data/raw/wildlife_sanctuaries.geojson
// OUTPUT: data/raw/tiger_reserves.geojson
//
// Run BEFORE processData.js and simplifyBoundaries.js.
// No npm packages required — Node.js built-ins only.

const fs   = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '../data/raw');

// ---------------------------------------------------------------------------
// Explicit polygon sources for each point-only tiger reserve.
// Each entry maps Tiger_Reserve name (exact, as in the TR file) to one or
// more { type, name } lookups in the NP or WLS source files.
// Compound reserves (e.g. Pench MP = core NP + buffer WLS) are combined into
// a single MultiPolygon — not a true spatial union, but correct for display.
//
// Dholpur-Karauli and Veerangana Durgavati have no polygon source available —
// they remain as Point and will be flagged hasBoundary:false by processData.js.
// ---------------------------------------------------------------------------
const PATCH_MAP = {
  'Bandhavgarh': [
    { type: 'NP',  name: 'Bandhavgarh NP' },
  ],
  'Bor': [
    { type: 'WLS', name: 'Bor WLS' },
  ],
  'Guru Ghasidas-Tamor Pingla': [
    // Only Guru Ghasidas component found; Tamor Pingla WLS absent from source files
    { type: 'NP',  name: 'Guru Ghasidas (Sanjay) NP' },
  ],
  'Kanha': [
    { type: 'NP',  name: 'Kanha NP' },
  ],
  'Madhav': [
    { type: 'NP',  name: 'Madhav NP' },
  ],
  'Nawegaon-Nagzira': [
    { type: 'NP',  name: 'Nawegaon NP'  },
    { type: 'WLS', name: 'Nagzira WLS'  },
  ],
  'Pench': [
    // Madhya Pradesh Pench — two components
    { type: 'NP',  name: 'Pench (Priyadarshni) NP' },
    { type: 'WLS', name: 'Pench Moghli WLS'        },
  ],
  'Pench (Maharashtra)': [
    { type: 'NP',  name: 'Pench (Jawaharlal Nehru)' },
  ],
  'Ramgarh Vishdhari': [
    { type: 'WLS', name: 'Ramgarh Vishdhari WLS' },
  ],
  'Ranipur': [
    { type: 'WLS', name: 'Ranipur WLS' },
  ],
  'Ratapani': [
    { type: 'WLS', name: 'Ratapani WLS' },
  ],
  'Srivilliputhur-Megamalai': [
    { type: 'WLS', name: 'Srivilliputhur (Giant Squirrel) WLS' },
    { type: 'WLS', name: 'Megamalai'                           },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Combine one or more Polygon/MultiPolygon geometries into a single geometry.
// Returns Polygon if only one ring group, MultiPolygon if multiple.
function combineGeometries(features) {
  const ringGroups = [];
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon')      ringGroups.push(g.coordinates);
    if (g.type === 'MultiPolygon') ringGroups.push(...g.coordinates);
  }
  if (ringGroups.length === 0) return null;
  if (ringGroups.length === 1) return { type: 'Polygon',      coordinates: ringGroups[0] };
  return                              { type: 'MultiPolygon', coordinates: ringGroups    };
}

function findFeature(pool, name) {
  return pool.find(f => f.properties.Name === name) ?? null;
}

// ---------------------------------------------------------------------------
// Load sources
// ---------------------------------------------------------------------------
const trFile  = path.join(RAW, 'India_TigerReserves_58_All.geojson');
const npFile  = path.join(RAW, 'national_parks.geojson');
const wlsFile = path.join(RAW, 'wildlife_sanctuaries.geojson');

for (const f of [trFile, npFile, wlsFile]) {
  if (!fs.existsSync(f)) {
    console.error('MISSING:', f);
    process.exit(1);
  }
}

const trGeoJSON  = JSON.parse(fs.readFileSync(trFile,  'utf8'));
const npFeatures = JSON.parse(fs.readFileSync(npFile,  'utf8')).features;
const wlsFeatures= JSON.parse(fs.readFileSync(wlsFile, 'utf8')).features;

const pool = { NP: npFeatures, WLS: wlsFeatures };

// ---------------------------------------------------------------------------
// Process each feature
// ---------------------------------------------------------------------------
let patched = 0, alreadyPoly = 0, noSource = 0;
const warnings = [];

const outFeatures = trGeoJSON.features.map(feature => {
  const geomType = feature.geometry?.type;

  // Already has a real polygon — pass through unchanged
  if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
    alreadyPoly++;
    return feature;
  }

  const trName = feature.properties.Tiger_Reserve;
  const sources = PATCH_MAP[trName];

  // Not in patch map — remains as Point, will be flagged hasBoundary:false
  if (!sources) {
    noSource++;
    warnings.push(`  hasBoundary:false — no polygon source: ${trName} (${feature.properties.State})`);
    return {
      ...feature,
      properties: { ...feature.properties, Geometry_Type: 'point_approximate' },
    };
  }

  // Resolve each source entry to a feature
  const resolved = sources.map(({ type, name }) => {
    const f = findFeature(pool[type], name);
    if (!f) warnings.push(`  ⚠  lookup failed: [${type}] "${name}" for TR "${trName}"`);
    return f;
  }).filter(Boolean);

  if (resolved.length === 0) {
    noSource++;
    warnings.push(`  hasBoundary:false — all lookups failed: ${trName}`);
    return feature;
  }

  const combinedGeom = combineGeometries(resolved);
  if (!combinedGeom) {
    noSource++;
    warnings.push(`  hasBoundary:false — geometry combination failed: ${trName}`);
    return feature;
  }

  patched++;
  const sourceNames = resolved.map(f => f.properties.Name).join(' + ');
  console.log(`  ✓  Patched: ${trName.padEnd(32)} ← ${sourceNames}`);

  return {
    ...feature,
    geometry: combinedGeom,
    properties: {
      ...feature.properties,
      Geometry_Type: resolved.length > 1 ? 'polygon_combined' : 'polygon_patched',
    },
  };
});

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------
const outPath = path.join(RAW, 'tiger_reserves.geojson');
const outGeoJSON = { ...trGeoJSON, name: 'tiger_reserves', features: outFeatures };
fs.writeFileSync(outPath, JSON.stringify(outGeoJSON), 'utf8');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const div = '─'.repeat(60);
console.log('\n' + div);
console.log(`Output → data/raw/tiger_reserves.geojson`);
console.log(div);
console.log(`  Already polygon : ${alreadyPoly}`);
console.log(`  Patched to poly : ${patched}`);
console.log(`  Remain as point : ${noSource}  (hasBoundary:false in final output)`);
console.log(`  Total features  : ${outFeatures.length}`);
if (warnings.length > 0) {
  console.log('\nWarnings:');
  warnings.forEach(w => console.log(w));
}
console.log(div + '\n');
