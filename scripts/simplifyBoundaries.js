// scripts/simplifyBoundaries.js
// Applies Visvalingam simplification to all generated boundary files.
// Run AFTER processData.js.
//
// Target tolerance: 200 m interval — retains all detail visible at MAX_ZOOM 10
// (~150 m/px). If complex coastal or mangrove sites look jagged after
// simplification, increase interval to 300. If size savings are insufficient,
// reduce to 100.
//
// Requires: npm install -D mapshaper

const mapshaper = require('mapshaper');
const fs        = require('fs');
const path      = require('path');

const BOUNDS = path.join(__dirname, '../public/boundaries');

// Also simplify these top-level files when present (added separately from data pipeline)
const EXTRA = [
  path.join(__dirname, '../public/india-states.geojson'),
  path.join(__dirname, '../public/india-boundary.geojson'),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Mapshaper needs forward slashes on all platforms
function fwd(p) { return p.replace(/\\/g, '/'); }

function fileSizeKB(p) {
  try { return (fs.statSync(p).size / 1024).toFixed(1); } catch { return '?'; }
}

async function simplifyFile(filePath) {
  const before = fileSizeKB(filePath);
  await mapshaper.runCommands(
    `"${fwd(filePath)}" -simplify visvalingam interval=200 keep-shapes -o "${fwd(filePath)}" format=geojson force`
  );
  const after = fileSizeKB(filePath);
  return { before, after };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  // Collect boundary files
  const boundaryFiles = fs.readdirSync(BOUNDS)
    .filter(f => f.endsWith('.geojson'))
    .map(f => path.join(BOUNDS, f));

  // Collect extra files that exist
  const extraFiles = EXTRA.filter(f => fs.existsSync(f));

  const allFiles = [...boundaryFiles, ...extraFiles];

  if (allFiles.length === 0) {
    console.error('No .geojson files found. Run processData.js first.');
    process.exit(1);
  }

  console.log(`\nSimplifying ${boundaryFiles.length} boundary files` +
    (extraFiles.length ? ` + ${extraFiles.length} top-level file(s)` : '') + '...\n');

  // Process in batches of 50 — keeps memory usage predictable
  const BATCH = 50;
  let totalBefore = 0, totalAfter = 0, done = 0;

  for (let i = 0; i < boundaryFiles.length; i += BATCH) {
    const batch = boundaryFiles.slice(i, i + BATCH);
    await Promise.all(batch.map(async f => {
      const { before, after } = await simplifyFile(f);
      totalBefore += parseFloat(before);
      totalAfter  += parseFloat(after);
      done++;
    }));
    process.stdout.write(`  ${done}/${boundaryFiles.length} boundary files done\r`);
  }
  console.log(`  ${done}/${boundaryFiles.length} boundary files done   `);

  // Process extra files individually and show their sizes explicitly
  for (const f of extraFiles) {
    const name   = path.basename(f);
    const before = fileSizeKB(f);
    await simplifyFile(f);
    const after  = fileSizeKB(f);
    console.log(`  ${name.padEnd(32)} ${String(before).padStart(7)} KB → ${String(after).padStart(7)} KB`);
  }

  // Summary
  const saved   = totalBefore - totalAfter;
  const pct     = totalBefore > 0 ? Math.round((saved / totalBefore) * 100) : 0;
  const div     = '─'.repeat(60);
  console.log('\n' + div);
  console.log(`  Boundary files     ${String(done).padStart(6)} files`);
  console.log(`  Size before        ${totalBefore.toFixed(0).padStart(7)} KB`);
  console.log(`  Size after         ${totalAfter.toFixed(0).padStart(7)} KB`);
  console.log(`  Saved              ${saved.toFixed(0).padStart(7)} KB  (${pct}%)`);
  console.log(div + '\n');

  console.log('Done. Validate a few complex sites (coastal, mangrove) at zoom 10');
  console.log('in MapLibre before deploying. Increase interval=200 if edges look');
  console.log('jagged; reduce it if size savings are less than ~40%.\n');
})();
