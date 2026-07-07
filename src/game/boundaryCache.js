// src/game/boundaryCache.js
// Fetch+cache for site boundary GeoJSON files, keyed by site.id. Shared by
// the round hooks (in-boundary scoring, prefetched during READING/PLACING)
// and resultLayer.js (post-guess reveal) so a site's boundary file is only
// ever fetched once per session, however many times it's needed.

const cache = new Map(); // site.id -> Promise<GeoJSON|null>

/**
 * Fetches (and caches) a site's boundary GeoJSON.
 * Resolves null if the site has no boundary or the fetch fails.
 */
export function fetchBoundary(site) {
  if (!site?.hasBoundary) return Promise.resolve(null);

  if (!cache.has(site.id)) {
    cache.set(
      site.id,
      fetch(`/boundaries/${site.id}.geojson`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  return cache.get(site.id);
}
