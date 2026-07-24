// functions/_shared/tileProxy.js
//
// Fronts ArcGIS World Imagery with Cloudflare's edge Cache API. EcoGuesser's
// satellite tiles are requested for a fixed, finite set of protected-area
// locations, so the same tile gets re-requested across many players -- caching
// is the primary lever for staying within the 2M-tile/month ArcGIS quota.
// First request for a given z/y/x pays the ArcGIS quota; every later request
// for that same tile, from any player, is served from the edge for free.
//
// That cache-hit-rate argument only holds if every request is for one of
// the small set of real, in-range tile coordinates a legitimate map view
// can ever produce. Nothing before this comment stopped a client from
// requesting a sweep of well-formed-but-nonexistent coordinates (huge z, or
// x/y outside a real tile grid) -- each one both a wasted round trip to the
// upstream (never cached, since only .ok responses are cached below) and,
// for the ArcGIS-backed proxy specifically, a real hit against the quota
// this whole caching strategy exists to protect. validTileCoords + the
// rate limiter below close that: bounds-check the coordinates before ever
// contacting the upstream, and cap request volume per IP the same way
// handlers.js already does for the score/leaderboard endpoints.

import { createRateLimiter } from './rateLimit.js';

// Real slippy-map tile grids never exceed z~22 in practice (this app's own
// MIN_ZOOM/MAX_ZOOM in src/config.js top out at 12); 20 leaves generous
// headroom for future zoom-range tuning without ever admitting the
// pathological "z=999999999999" case a bare /^\d+$/ digit check lets through.
const MAX_ZOOM = 20;

// True only for coordinates a real map could ever request: all-digit,
// integral, z within range, and x/y both within [0, 2^z) -- the actual
// valid index range for a zoom level z tile grid. Order-agnostic between
// the two (x, y) arguments, since the bound is identical for both.
function validTileCoords(z, a, b) {
  if (![z, a, b].every((v) => /^\d+$/.test(v ?? ''))) return false;
  const zNum = Number(z);
  if (!Number.isInteger(zNum) || zNum < 0 || zNum > MAX_ZOOM) return false;
  const max = 2 ** zNum;
  const aNum = Number(a);
  const bNum = Number(b);
  return Number.isInteger(aNum) && aNum >= 0 && aNum < max
    && Number.isInteger(bNum) && bNum >= 0 && bNum < max;
}

// 400 requests/60s per IP, per proxy (satellite and DEM tracked
// independently -- see rateLimit.js's header comment). Generous enough
// that a real pan/zoom burst (satellite + DEM tiles loading together)
// never trips it, while still bounding a script that hammers either
// endpoint with junk coordinates purely to force cache misses.
const isSatelliteRateLimited = createRateLimiter({ windowMs: 60_000, max: 400 });
const isDemRateLimited = createRateLimiter({ windowMs: 60_000, max: 400 });

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
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isSatelliteRateLimited(ip)) {
    return new Response('rate limited', { status: 429 });
  }

  const [z, y, x] = pathParams ?? [];
  if (!validTileCoords(z, y, x)) {
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
      // no-transform: defensive, same reasoning as the DEM proxy below -- routing
      // through our own zone (vs. the browser hitting ArcGIS directly, before this
      // proxy existed) newly exposes these responses to Cloudflare's own image
      // pipeline (Polish etc.) if it's ever enabled on this zone. A satellite photo
      // degrading slightly under "lossless" re-encoding wouldn't be as visibly
      // broken as DEM's byte-exact elevation data is, but there's no reason to
      // allow it either.
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, immutable, no-transform`,
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

// Fronts the AWS Terrarium DEM tiles (elevation-tiles-prod -- a public S3
// bucket, no API quota to protect the way ArcGIS above has) with the same
// Cloudflare edge Cache API strategy. These feed map-style.json's always-on
// hypsometric-tint/base-hillshade layers (and satellite's optional
// hillshade, currently dormant -- see SATELLITE_VISUAL.HILLSHADE_ENABLED in
// src/config.js). Same win as the ArcGIS proxy even without a quota:
// same-origin instead of a separate external connection, and repeat
// requests for the same z/x/y -- likely, since India's protected areas
// cluster the same regions across players and Terrain defaults on every
// session -- are served from the edge instead of re-hitting S3.
const TERRARIUM_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

// 30 days, same tier as satellite above -- elevation data never changes at all.
const DEM_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * @param request Incoming Request (used only for method/URL scheme, not forwarded as-is)
 * @param pathParams [[path]] segments from the Pages Functions route, expected [z, x, y]
 *   -- Terrarium's own URL scheme is z/x/y, NOT ArcGIS's z/y/x above.
 * @param waitUntil context.waitUntil, so the cache write doesn't block the response
 */
export async function handleDemTileProxy(request, pathParams, waitUntil) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isDemRateLimited(ip)) {
    return new Response('rate limited', { status: 429 });
  }

  const [z, x, y] = pathParams ?? [];
  if (!validTileCoords(z, x, y)) {
    return new Response('invalid tile coordinates', { status: 400 });
  }

  const cache = caches.default;
  // Normalized, origin-independent cache key, same shape as handleTileProxy's --
  // keyed purely on tile coordinates, distinct path prefix (tiles/dem/...) so it
  // can never collide with the ArcGIS cache above even if z/x/y happened to match.
  // "v2" bumps past any entries cached under the pre-no-transform version below --
  // those may have been silently re-encoded by Cloudflare's image pipeline before
  // no-transform was added, so this guarantees a clean re-fetch instead of serving
  // a corrupted tile for the rest of its 30-day TTL.
  const cacheKey = new Request(`https://ecoguesser-tile-cache.internal/tiles/dem/v2/${z}/${x}/${y}`);

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let upstream;
  try {
    upstream = await fetch(`${TERRARIUM_BASE}/${z}/${x}/${y}.png`);
  } catch {
    return new Response('tile fetch failed', { status: 502 });
  }
  if (!upstream.ok) {
    return new Response('tile fetch failed', { status: upstream.status });
  }

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/png',
      // no-transform is the load-bearing part here, not a nicety: these PNG bytes
      // ARE the data (Terrarium's R*256+G+B/256-32768 elevation encoding), not a
      // photo. Any CDN-level "optimization" (Cloudflare Polish, image resizing,
      // etc. -- even their "lossless" mode re-encodes pixels for smaller output)
      // scrambles every elevation value it touches. That risk didn't exist before
      // this proxy existed, since the browser fetched straight from S3, bypassing
      // Cloudflare's pipeline entirely -- routing it same-origin through our own
      // zone is what newly exposes it to that pipeline, so this has to be explicit.
      'Cache-Control': `public, max-age=${DEM_CACHE_TTL_SECONDS}, immutable, no-transform`,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });

  const toCache = response.clone();
  if (waitUntil) waitUntil(cache.put(cacheKey, toCache));
  else await cache.put(cacheKey, toCache);

  return response;
}
