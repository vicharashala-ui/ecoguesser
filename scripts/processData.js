// scripts/processData.js
// Processes all raw protected-area GeoJSON sources into:
//   public/boundaries/<id>.geojson  — one Feature per site
//   src/data/protected-areas.json   — metadata array
//
// Run AFTER patchTigerReserves.js, BEFORE simplifyBoundaries.js.
// No npm packages required — Node.js built-ins only.

const fs   = require('fs');
const path = require('path');

const RAW    = path.join(__dirname, '../data/raw');
const BOUNDS = path.join(__dirname, '../public/boundaries');
const OUT    = path.join(__dirname, '../src/data');

fs.mkdirSync(BOUNDS, { recursive: true });
fs.mkdirSync(OUT,    { recursive: true });

// ---------------------------------------------------------------------------
// Source definitions — field extractors keyed by category
// ---------------------------------------------------------------------------
const SOURCES = [
  {
    category: 'np',
    prefix:   'np',
    file:     'national_parks.geojson',
    extract:  f => ({
      name:  f.properties.Name,
      state: [f.properties.State_Name],
      area:  f.properties.Area_sqkm,
    }),
  },
  {
    category: 'wls',
    prefix:   'ws',
    file:     'wildlife_sanctuaries.geojson',
    extract:  f => ({
      name:  f.properties.Name,
      state: [f.properties.State_Name],
      area:  f.properties.Area_sqkm,
    }),
  },
  {
    category: 'tr',
    prefix:   'tr',
    file:     'tiger_reserves.geojson',  // output of patchTigerReserves.js
    extract:  f => ({
      name:        f.properties.Tiger_Reserve,
      state:       [f.properties.State],
      area:        f.properties.Area_sqkm,
      hasBoundary: f.properties.Geometry_Type !== 'point_approximate',
      // For point-approximate sites use the point coords directly
      forceCentroid: f.geometry?.type === 'Point'
        ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }
        : null,
    }),
  },
  {
    category: 'br',
    prefix:   'br',
    file:     'biosphere_reserves.geojson',
    extract:  f => ({
      name:          f.properties.name,
      state:         f.properties.state_ut.split(',').map(s => s.trim()),
      area:          f.properties.area_km2,
      // Pre-supplied centroids are more accurate than vertex averaging
      forceCentroid: { lat: f.properties.centroid_lat, lng: f.properties.centroid_lng },
    }),
  },
  {
    category: 'ramsar',
    prefix:   'rs',
    folder:   'ramsar',   // folder of individual files — no `file` key
    extract:  f => ({
      name:  f.properties.name,
      state: [f.properties.state],
      area:  +(f.properties.area_ha / 100).toFixed(2),
    }),
  },
];

// ---------------------------------------------------------------------------
// State normalisation (must match `st_nm` in public/india-states.geojson)
// ---------------------------------------------------------------------------
const STATE_NORM = {
  'Andaman and Nicobar Islands': 'Andaman & Nicobar Islands',  // typo variant, source data ("and" not "&")
  'Daman & Diu':                 'Dadra & Nagar Haveli and Daman & Diu',
  'Dadra & Nagar Haveli':        'Dadra & Nagar Haveli and Daman & Diu',
  'Uttaranchal':                 'Uttarakhand',
};

function normalizeState(stateArr) {
  return stateArr.map(s => STATE_NORM[s] ?? s);
}

// Ramsar source data ships some sites with an empty `state` field.
// Patched here, keyed by the *final* site id (prefix + slugified name),
// since the raw `properties.state` value can't be trusted for these.
// Researched against current Ramsar / state-government designations.
const RAMSAR_STATE_FALLBACK = {
  rs_anaghasamudra:        'Karnataka',
  rs_gogabil_lake:         'Bihar',
  rs_kacheopalri:          'Sikkim',
  rs_karaivettai:          'Tamil Nadu',
  rs_nagi:                 'Bihar',
  rs_nakti:                'Bihar',
  rs_patna_bird_sancutary: 'Uttar Pradesh',
  rs_silserah_lake:        'Rajasthan',
  rs_theerthangal:         'Tamil Nadu',
  rs_udhwa_lake:           'Jharkhand',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function slugify(str) {
  return str.toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Simple centroid: mean of all exterior-ring vertices across all polygons.
// Good enough for distance-scoring in gameplay.
function computeCentroid(geometry) {
  const coords = [];
  if (geometry.type === 'Polygon') {
    coords.push(...geometry.coordinates[0]);
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach(poly => coords.push(...poly[0]));
  }
  if (coords.length === 0) return null;
  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return {
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
  };
}

// Combine multiple Polygon/MultiPolygon geometries into one MultiPolygon.
// Used for multi-feature Ramsar files (e.g. main wetland + buffer zone).
// The largest polygon (by exterior ring vertex count) contributes properties.
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

function getFeatures(geojson) {
  if (geojson.type === 'FeatureCollection') return geojson.features ?? [];
  if (geojson.type === 'Feature')           return [geojson];
  return [];
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------
const metadata    = [];        // accumulates protected-areas.json entries
const usedIds     = new Set(); // collision guard
const errors      = [];        // skipped features
const stats       = {};        // per-category counts

function processFeature(feature, source) {
  const { category, prefix, extract } = source;
  const fields = extract(feature);

  if (!fields.name || !fields.name.trim()) {
    errors.push({ category, reason: 'missing name', properties: feature.properties });
    return;
  }

  // Normalize state names to match india-states.geojson `st_nm` values
  // (was specced but never actually applied at build time -- see Critical Gotchas)
  if (fields.state) fields.state = normalizeState(fields.state);

  const hasBoundary = fields.hasBoundary !== undefined ? fields.hasBoundary : true;

  // Geometry — skip only if hasBoundary is expected but geometry is absent/invalid
  const geom = feature.geometry;
  if (hasBoundary && (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon'))) {
    errors.push({ category, name: fields.name, reason: 'expected polygon but got ' + geom?.type });
    return;
  }

  // ID with collision fallback
  let id = `${prefix}_${slugify(fields.name)}`;
  if (usedIds.has(id)) {
    const stateSlug = slugify(fields.state?.[0] ?? 'unknown');
    id = `${id}_${stateSlug}`;
  }
  if (usedIds.has(id)) {
    // Second collision (extremely rare) — append category
    id = `${id}_${prefix}`;
  }
  usedIds.add(id);

  // Patch Ramsar sites whose source `state` field shipped empty
  // (separate bug from STATE_NORM -- a gap in the Ramsar field mapping, not a naming mismatch)
  if (category === 'ramsar' && (!fields.state || !fields.state[0] || !fields.state[0].trim())) {
    const fallback = RAMSAR_STATE_FALLBACK[id];
    if (fallback) {
      fields.state = [fallback];
    } else {
      errors.push({ category, name: fields.name, reason: `empty state, no RAMSAR_STATE_FALLBACK entry for id ${id}` });
    }
  }

  // Centroid
  const centroid = fields.forceCentroid ?? (geom ? computeCentroid(geom) : null);
  if (!centroid) {
    errors.push({ category, name: fields.name, reason: 'centroid could not be computed' });
    return;
  }

  // Write boundary file (skip for point-approximate sites)
  if (hasBoundary) {
    const boundaryFeature = {
      type: 'Feature',
      properties: { id },
      geometry: geom,
    };
    fs.writeFileSync(
      path.join(BOUNDS, `${id}.geojson`),
      JSON.stringify(boundaryFeature),
      'utf8'
    );
  }

  // Accumulate metadata
  metadata.push({
    id,
    name:         fields.name.trim(),
    category,
    state:        fields.state,
    area_km2:     fields.area != null ? Math.round(fields.area * 10) / 10 : null,
    centroid_lat: centroid.lat,
    centroid_lng: centroid.lng,
    hasBoundary,
  });

  stats[category] = (stats[category] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
for (const source of SOURCES) {
  if (source.file) {
    // Single-file source
    const filePath = path.join(RAW, source.file);
    if (!fs.existsSync(filePath)) {
      console.error(`MISSING: data/raw/${source.file}`);
      continue;
    }
    const geojson  = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const features = getFeatures(geojson);
    for (const f of features) processFeature(f, source);

  } else if (source.folder) {
    // Folder of individual files (Ramsar)
    const folderPath = path.join(RAW, source.folder);
    if (!fs.existsSync(folderPath)) {
      console.error(`MISSING: data/raw/${source.folder}/`);
      continue;
    }
    const files = fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.geojson'))
      .sort();

    for (const file of files) {
      const geojson  = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));
      const features = getFeatures(geojson);

      if (features.length === 0) {
        errors.push({ category: source.category, reason: 'empty file', file });
        continue;
      }

      if (features.length === 1) {
        processFeature(features[0], source);
      } else {
        // Multi-feature file — combine geometries, take properties from first feature
        const combined = combineGeometries(features);
        const syntheticFeature = {
          type: 'Feature',
          properties: features[0].properties,
          geometry: combined,
        };
        processFeature(syntheticFeature, source);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Safety net: India's 100th Ramsar site (Jai Prakash Narayan Bird Sanctuary,
// Surha Tal, Ballia, UP) has previously gone missing from the raw Ramsar
// export despite being researched and added mid-pipeline -- it likely never
// made it into data/raw/ramsar/ as an actual source file. Inject it here so
// a silent regression can't ship 99 Ramsar sites again.
//
// FIXME: this is a centroid-only stopgap (hasBoundary:false). Restore the
// real boundary polygon by adding the proper source file to
// data/raw/ramsar/ and removing this block -- do not leave both in place,
// or the site will be double-counted.
// ---------------------------------------------------------------------------
const JPN_BIRD_SANCTUARY_ID = 'rs_jai_prakash_narayan_bird_sanctuary';
if (!usedIds.has(JPN_BIRD_SANCTUARY_ID)) {
  console.warn(`⚠  ${JPN_BIRD_SANCTUARY_ID} missing from data/raw/ramsar/ -- injecting fallback metadata (no boundary polygon). Add the real source file to restore it properly.`);
  usedIds.add(JPN_BIRD_SANCTUARY_ID);
  metadata.push({
    id:           JPN_BIRD_SANCTUARY_ID,
    name:         'Jai Prakash Narayan Bird Sanctuary',
    category:     'ramsar',
    state:        ['Uttar Pradesh'],
    area_km2:     34.3,
    centroid_lat: 25.85,
    centroid_lng: 84.17,
    hasBoundary:  false,
  });
  stats['ramsar'] = (stats['ramsar'] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
fs.writeFileSync(
  path.join(OUT, 'protected-areas.json'),
  JSON.stringify(metadata, null, 2),
  'utf8'
);

// Error log
if (errors.length > 0) {
  fs.writeFileSync(
    path.join(__dirname, '../data/processing-errors.json'),
    JSON.stringify(errors, null, 2),
    'utf8'
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const div   = '─'.repeat(60);
const total = Object.values(stats).reduce((s, n) => s + n, 0);
console.log('\n' + div);
console.log('protected-areas.json  →  src/data/');
console.log('boundaries/           →  public/boundaries/');
console.log(div);
Object.entries(stats).forEach(([cat, n]) =>
  console.log(`  ${cat.padEnd(22)} ${String(n).padStart(4)} sites`)
);
console.log(div);
console.log(`  ${'TOTAL'.padEnd(22)} ${String(total).padStart(4)} sites`);
if (errors.length > 0) {
  console.log(`\n  ⚠  ${errors.length} site(s) skipped — see data/processing-errors.json`);
}
console.log(div + '\n');
