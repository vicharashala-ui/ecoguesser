// functions/_shared/tileProxy.js
//
// Fronts ArcGIS World Imagery with Cloudflare's edge Cache API. EcoGuesser's
// satellite tiles are requested for a fixed, finite set of protected-area
// locations, so the same tile gets re-requested across many players -- caching
// is the primary lever for staying within the 2M-tile/month ArcGIS quota.
// First request for a given z/y/x pays the ArcGIS quota; every later request
// for that same tile, from any player, is served from the edge for free.

const ARCGIS_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

// 30 days -- satellite imagery doesn't change month to month, so a long TTL is
// safe and maximizes the cache-hit rate against the quota.
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * @param request Incoming Request (used only for method/URL scheme, not forwarded as-is)
 * @param pathParams [[path]] segments from the Pages Functions route, expected [z, y, x]
 * @param waitUntil context.waitUntil, so the cache write doesn't block the response
 */
export async function handleTileProxy(request, pathParams, waitUntil) {
  const [z, y, x] = pathParams ?? [];
  if (![z, y, x].every((v) => /^\d+$/.test(v ?? ''))) {
    return new Response('invalid tile coordinates', { status: 400 });
  }

  const cache = caches.default;
  // Normalized, origin-independent cache key -- hits are keyed purely on tile
  // coordinates, not on whatever host/query string the incoming request had.
  const cacheKey = new Request(`https://ecoguesser-tile-cache.internal/tiles/${z}/${y}/${x}`);

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let upstream;
  try {
    upstream = await fetch(`${ARCGIS_BASE}/${z}/${y}/${x}`);
  } catch {
    return new Response('tile fetch failed', { status: 502 });
  }
  if (!upstream.ok) {
    return new Response('tile fetch failed', { status: upstream.status });
  }

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, immutable`,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });

  // Cache a clone so the original response body can still be returned to the client.
  const toCache = response.clone();
  if (waitUntil) waitUntil(cache.put(cacheKey, toCache));
  else await cache.put(cacheKey, toCache);

  return response;
}
