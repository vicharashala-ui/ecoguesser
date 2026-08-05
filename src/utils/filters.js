/**
 * Two-tier Region -> State filter. REGION_STATES is a UI-facing grouping
 * only: selecting a whole region just expands to its member states in the
 * side drawer. Filtering itself always happens against the flat `states`
 * array, not against region names.
 *
 * Verified against protected-areas.json (837 sites, 36/36 state strings):
 * every name below matches `site.state[]` exactly. One mismatch was caught
 * and fixed during verification -- the merged Dadra & Nagar Haveli/Daman &
 * Diu UT uses mixed '&'/'and' ('Dadra & Nagar Haveli and Daman & Diu'), not
 * all-'and'. If protected-areas.json is ever regenerated, re-diff this list
 * against it.
 */

import { DAILY } from '../config.js';

export const REGION_STATES = {
  North: ['Himachal Pradesh', 'Punjab', 'Haryana', 'Uttarakhand', 'Uttar Pradesh'],
  West: ['Maharashtra', 'Goa', 'Gujarat', 'Rajasthan'],
  South: ['Kerala', 'Tamil Nadu', 'Karnataka', 'Andhra Pradesh', 'Telangana'],
  'North-East': [
    'Assam',
    'Arunachal Pradesh',
    'Nagaland',
    'Manipur',
    'Mizoram',
    'Tripura',
    'Meghalaya',
    'Sikkim',
  ],
  // 'Chhattisgarh' (double h) -- corrected from "Chattisgarh", the official spelling.
  'Centre-East': ['West Bengal', 'Odisha', 'Jharkhand', 'Chhattisgarh', 'Madhya Pradesh', 'Bihar'],
  UT: [
    // 'Andaman & Nicobar Islands', not 'and' -- the cleaned name in
    // india-states.geojson/site.state[] uses '&'. Verified against
    // protected-areas.json: 36/36 states match exactly, including this and
    // Jammu & Kashmir below.
    'Andaman & Nicobar Islands',
    'Chandigarh',
    'Dadra & Nagar Haveli and Daman & Diu',
    'Delhi',
    'Jammu & Kashmir',
    'Ladakh',
    'Lakshadweep',
    'Puducherry',
  ],
};

const ALL_STATES = Object.values(REGION_STATES).flat();

// Reused by App.jsx (lifted filter state, so the side drawer can control
// it) and previously duplicated locally in ClassicMap.jsx as its own
// module-level constant -- one definition now.
export const DEFAULT_FILTERS = { categories: [...DAILY.CATEGORIES], states: ALL_STATES };

/**
 * filters: { categories: string[], states: string[] }
 * Both are the *currently selected* values. An empty array means "nothing
 * selected on that dimension" -- this matches NO sites on that dimension,
 * by design. The UI (not this file) is responsible for disabling "Apply
 * Filters" / showing "No sites match these filters" when the resulting
 * pool is empty.
 */
export function siteMatchesFilter(site, filters) {
  const categoryMatch = filters.categories.includes(site.category);
  const stateMatch = site.state.some((s) => filters.states.includes(s));
  return categoryMatch && stateMatch;
}

/**
 * Blitz "Hint" button support -- given the correct site.state array, finds
 * every REGION_STATES region that contains at least one of those states and
 * returns the union of ALL member states across those regions (deduped).
 * This is deliberately region-level, not state-level: it never reveals which
 * state(s) within the region are actually correct, just narrows the whole
 * map down to the right region(s). Border-spanning sites (state.length > 1
 * across two regions) correctly union both regions' states.
 */
export function getRegionHintStates(correctStates) {
  const regions = Object.keys(REGION_STATES).filter((region) =>
    REGION_STATES[region].some((s) => correctStates.includes(s))
  );
  return [...new Set(regions.flatMap((region) => REGION_STATES[region]))];
}

/**
 * excludeIds = [previousSiteId] -- prevents picking the same site twice in
 * a row. Ignored when pool has exactly 1 site (otherwise nothing could ever
 * be picked again). Caller is responsible for guarding pool.length === 0
 * via siteMatchesFilter before calling this.
 */
export function pickRandom(pool, excludeIds = []) {
  if (pool.length === 0) {
    throw new Error('pickRandom: empty pool');
  }
  const eligible = pool.length === 1 ? pool : pool.filter((site) => !excludeIds.includes(site.id));
  return eligible[Math.floor(Math.random() * eligible.length)];
}

// Biosphere Reserve pool is small (18 sites) -- cycle through it in order
// instead of random picks, so all 18 are seen before any repeat. Module-level
// index resets on page reload; that's fine, it just restarts the cycle.
let brCycleIndex = 0;

function pickCycledBr(brPool) {
  const site = brPool[brCycleIndex % brPool.length];
  brCycleIndex = (brCycleIndex + 1) % brPool.length;
  return site;
}

/**
 * Classic/Blitz site picker: round-robins through DAILY.CATEGORIES
 * (np -> wls -> tr -> br -> ramsar) so category-skewed pool sizes (wls has
 * 554 sites, br has 18) don't dominate what the player sees, and never
 * repeats `previousSite` within the chosen category. Categories absent
 * from `pool` (filtered out via the drawer, or just empty) are skipped --
 * the rotation only advances across whatever categories are actually
 * present, so it stays correct as the player's filters change.
 *
 * @param {import('../config').Site[]} pool - non-empty, already filtered
 * @param {import('../config').Site|null} previousSite - last site shown,
 *   or null for the first pick of a session
 */
export function pickNextSite(pool, previousSite) {
  const byCategory = {};
  for (const site of pool) {
    (byCategory[site.category] ??= []).push(site);
  }
  const order = DAILY.CATEGORIES.filter((cat) => byCategory[cat]?.length);

  const prevIndex = previousSite ? order.indexOf(previousSite.category) : -1;
  const nextCategory = order[(prevIndex + 1) % order.length];
  if (nextCategory === 'br') {
    return pickCycledBr(byCategory.br);
  }
  const excludeIds = previousSite ? [previousSite.id] : [];
  return pickRandom(byCategory[nextCategory], excludeIds);
}
