// src/hooks/sharedMapData.js
// Split out of useMapState.js so App.jsx's eager (non-lazy) warmSharedMapData
// import doesn't drag that file's other ~900 lines -- satellite/hillshade/
// terrain-toggle logic, never needed before a map component actually mounts
// -- into the main bundle. ClassicMap/DailyMap/BlitzMap all already reach
// useMapState.js via lazy(), so it stays out of their critical path too;
// App.jsx was the only eager import point. useMapState.js imports
// loadSharedGeoJsonOnce back from here, so it's still exactly one cache/one
// fetch per URL shared across both call sites.

// Classic/Daily/Blitz are three separate MapLibre instances (kept mounted
// via display:none, never torn down -- see App.jsx), and each one's onLoad
// independently needs india-states.topojson, india-boundary.geojson, and
// india-state-labels.geojson. Without this cache, opening all three tabs in
// one session re-fetches AND re-parses (JSON.parse + topojson-client's arc
// expansion for the states file) all ~345KB gzip of shared static data up
// to 3 times over -- real main-thread work on every tab switch, not just
// wasted bytes (HTTP cache already dedupes the network fetch itself, but
// does nothing for the JS-side parse). Keyed by URL, caches the resolved
// (already-parsed) value so every map instance after the first gets it
// synchronously-ish, with no repeat fetch or parse. A rejected fetch is
// evicted rather than cached, so a later mount can retry instead of being
// stuck with a permanent failure from, say, one flaky first load.
const sharedGeoJsonCache = new Map();
export function loadSharedGeoJsonOnce(url, parse) {
  if (!sharedGeoJsonCache.has(url)) {
    const promise = fetch(url).then((r) => r.json()).then(parse);
    promise.catch(() => sharedGeoJsonCache.delete(url));
    sharedGeoJsonCache.set(url, promise);
  }
  return sharedGeoJsonCache.get(url);
}

// Optional early warm-up for the three shared static files onLoad consumes
// (~345KB gzip total). Without this, none of them starts downloading until
// MapLibre's 'load' fires -- i.e. after every first-render tile/glyph has
// finished -- so on slow networks the map appears and then state/country
// borders visibly pop in a beat later. Called from App.jsx's existing
// idle-prefetch effect (requestIdleCallback / 2s fallback -- the same
// deliberately-deferred slot the Classic/Blitz chunk prefetch already uses)
// rather than eagerly at mount, so it never competes with the map's own
// first-paint budget; and it goes through the same promise cache
// useMapState.js's loadIndiaStatesTopology reads, so this is a pure head
// start with zero duplicate fetch or duplicate parse -- whichever caller
// runs second gets the first caller's promise.
//
// topojson-client is dynamically imported here rather than statically, so
// its bytes stay out of this module (and therefore out of App.jsx's eager
// bundle) too -- this function only ever runs from an idle callback, well
// after first paint, so there's no reason to pay its parse cost any
// earlier. If useMapState.js's loadIndiaStatesTopology (static import,
// already loaded once a map chunk mounts) registers this URL first, that
// import() below never fires at all -- the cache hit makes it a no-op.
// Parse callbacks MUST resolve to the same shape as loadIndiaStatesTopology's
// -- the cache is keyed by URL and whichever registers first wins.
export function warmSharedMapData() {
  loadSharedGeoJsonOnce('/india-states.topojson', (topology) =>
    import('topojson-client').then(({ feature }) => feature(topology, topology.objects['india-states']))
  ).catch(() => {});
  loadSharedGeoJsonOnce('/india-boundary.geojson', (geojson) => geojson).catch(() => {});
  loadSharedGeoJsonOnce('/india-state-labels.geojson', (geojson) => geojson).catch(() => {});
}
