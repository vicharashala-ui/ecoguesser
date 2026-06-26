// scripts/verifyStates.js
// Checks every site.state[] value in protected-areas.json against the
// st_nm values actually present in india-states.geojson.
// Run after processData.js + simplifyBoundaries.js.

const fs   = require('fs');
const path = require('path');

const sites  = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/protected-areas.json'), 'utf8'));
const states = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/india-states.geojson'), 'utf8'));

const stNames = new Set(states.features.map(f => f.properties.st_nm));

let unmatched = 0;
for (const site of sites) {
  for (const s of site.state) {
    if (!stNames.has(s)) {
      console.log(`MISMATCH  ${site.id}  ->  "${s}"`);
      unmatched++;
    }
  }
}

console.log(`\n${stNames.size} st_nm values in india-states.geojson`);
console.log(`${sites.length} sites checked, ${unmatched} unmatched state value(s)`);
