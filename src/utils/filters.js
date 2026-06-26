/**
 * Two-tier Region -> State filter (Key Decision #10). REGION_STATES is a
 * UI-facing grouping only: selecting a whole region just expands to its
 * member states in the side drawer. Filtering itself always happens against
 * the flat `states` array, not against region names.
 *
 * VERIFIED against protected-areas.json (839 sites, 36/36 state strings):
 * every name below matches `site.state[]` exactly. One mismatch was caught
 * and fixed during verification -- the merged Dadra & Nagar Haveli/Daman &
 * Diu UT uses mixed '&'/'and' ('Dadra & Nagar Haveli and Daman & Diu'), not
 * all-'and'. If protected-areas.json is ever regenerated, re-diff this list
 * against it (see br_great_nicobar_biosphere_reserve typo-state gap in
 * Critical Gotchas for why that matters).
 */
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
    // Corrected to 'Andaman & Nicobar Islands' -- per Section 16, "and" is a
    // typo variant in source data; the cleaned name in india-states.geojson/
    // site.state[] uses '&'. Verified against protected-areas.json: 36/36
    // states match exactly, including this and Jammu & Kashmir below.
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

export function getFilteredPool(allSites, filters) {
  return allSites.filter((site) => siteMatchesFilter(site, filters));
}

/**
 * excludeIds = [previousSiteId] -- prevents picking the same site twice in
 * a row. Ignored when pool has exactly 1 site (otherwise nothing could ever
 * be picked again). Caller is responsible for guarding pool.length === 0
 * via getFilteredPool before calling this.
 */
export function pickRandom(pool, excludeIds = []) {
  if (pool.length === 0) {
    throw new Error('pickRandom: empty pool');
  }
  const eligible = pool.length === 1 ? pool : pool.filter((site) => !excludeIds.includes(site.id));
  return eligible[Math.floor(Math.random() * eligible.length)];
}
