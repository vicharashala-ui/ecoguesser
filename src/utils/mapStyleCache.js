// src/utils/mapStyleCache.js
// Fetch+cache for the base map style JSON, keyed by URL. Classic, Daily,
// and Blitz all fetch the identical /map-style.json (Blitz derives its flat
// look from it via blitzStyleTransform rather than loading a separate file
// -- see config.js's MAP_STYLE comment), so without this each of
// MapContainer.jsx's 3 concurrent mounts independently fetches and
// JSON-parses the same style document. Same module-level Promise-cache
// shape as boundaryCache.js.
//
// The resolved object is shared by every caller -- MapContainer.jsx clones
// it (structuredClone) before handing it to MapLibre or a styleTransform,
// so no caller may mutate the object this returns directly.

const cache = new Map(); // url -> Promise<styleJson>

export function fetchMapStyle(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((res) => res.json()));
  }
  return cache.get(url);
}
