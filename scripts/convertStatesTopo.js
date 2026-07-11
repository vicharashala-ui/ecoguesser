// scripts/convertStatesTopo.js
// Converts public/india-states.geojson -> public/india-states.topojson.
// Run AFTER simplifyBoundaries.js (operates on the already-simplified file).
//
// WHY: india-states.geojson is 36 features (28 states + island UTs as
// MultiPolygons) where every shared border between two adjacent states is
// currently stored twice -- once in each state's own ring. TopoJSON builds
// a topology where each shared border is one arc referenced by both
// polygons, so it's stored once. That's the entire size win here; it's
// unrelated to (and doesn't require) the coordinate simplification already
// done by simplifyBoundaries.js.
//
// india-boundary.geojson is deliberately NOT converted -- it's a single
// MultiPolygon (the country outline; mainland + island groups), so there
// are no adjacent features for it to share arcs with. Running it through
// this pipeline would add a client-side decode step for ~0 size benefit.
// It also contains the compliance-patched Aksai Chin/PoK border -- keeping
// it as a separate, untouched file means that patch can never be affected
// by topology-building/snapping logic applied to a different dataset.
//
// QUANTIZATION: `no-quantization` is deliberate, not the default. mapshaper's
// auto-quantization was tried first and looked safe on paper (its grid
// landed on the same 0.0001-degree precision simplifyBoundaries.js already
// truncates to) -- but round-tripping the actual output back to GeoJSON and
// diffing every state with Shapely found real, if small, coordinate shifts
// on several of the tiny multi-part UTs (Lakshadweep, Puducherry,
// Chandigarh, Dadra & Nagar Haveli and Daman & Diu -- all fragmented
// exclaves where even an 11m shift is a meaningful fraction of the total
// shape), and for Andaman & Nicobar Islands it produced an actual
// self-intersecting (invalid) polygon -- a real rendering-artifact risk,
// not just an imperceptible-at-zoom rounding question.
//
// `no-quantization` skips that step entirely: coordinates are carried
// through byte-for-byte, only the duplicate shared-border storage is
// removed. Verified by the same round-trip+Shapely diff: all 36 states,
// symmetric_difference area exactly 0, all valid. Costs ~90KB gzip more
// than auto-quantization would have (~216KB vs ~109KB), kept anyway since
// "no visible quality loss" was the explicit bar for this change.
//
// Requires: npm install topojson-client (runtime) + mapshaper (already a
// devDependency, used here as a library the same way simplifyBoundaries.js
// uses it).

const mapshaper = require('mapshaper');
const fs        = require('fs');
const path      = require('path');

const SRC  = path.join(__dirname, '../public/india-states.geojson');
const DEST = path.join(__dirname, '../public/india-states.topojson');

function fwd(p) { return p.replace(/\\/g, '/'); }

function sizes(p) {
  const raw = fs.statSync(p).size;
  const gz  = require('zlib').gzipSync(fs.readFileSync(p)).length;
  return { raw, gz };
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`${SRC} not found. Run processData.js + simplifyBoundaries.js first.`);
    process.exit(1);
  }

  await mapshaper.runCommands(
    `"${fwd(SRC)}" -o "${fwd(DEST)}" format=topojson no-quantization force`
  );

  const before = sizes(SRC);
  const after  = sizes(DEST);
  const pct    = Math.round((1 - after.gz / before.gz) * 100);

  console.log('\nindia-states.geojson -> india-states.topojson (no-quantization)');
  console.log(`  geojson   raw ${(before.raw / 1024).toFixed(0).padStart(4)} KB   gzip ${(before.gz / 1024).toFixed(0).padStart(4)} KB`);
  console.log(`  topojson  raw ${(after.raw / 1024).toFixed(0).padStart(4)} KB   gzip ${(after.gz / 1024).toFixed(0).padStart(4)} KB`);
  console.log(`  saved     ${pct}% gzipped\n`);
  console.log('india-states.geojson is kept as-is (source of truth for the next');
  console.log('conversion run, and for anything that still wants plain GeoJSON) --');
  console.log('only useMapState.js\'s fetch target changed, to the .topojson file.\n');
  console.log('If you ever re-run this: verify losslessness before shipping --');
  console.log('round-trip the output back to GeoJSON (mapshaper x.topojson -o');
  console.log('y.geojson format=geojson) and diff every state\'s polygon against');
  console.log('india-states.geojson with Shapely (symmetric_difference area should');
  console.log('be exactly 0, and every state should still be .is_valid). Do NOT');
  console.log('swap back to auto-quantization without re-checking this -- see the');
  console.log('comment above for why it silently broke Andaman & Nicobar Islands.\n');
})();

