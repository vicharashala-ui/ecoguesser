// functions/_shared/handlers.js
// Module-scope state (_lbCache) persists for the lifetime of a given Worker
// isolate -- not across isolates/deploys, which is fine for a short-TTL
// leaderboard cache. The rate limiter itself now lives in rateLimit.js,
// shared with the tile proxy -- see that file's header comment for why each
// caller gets its own independent budget.

import { createRateLimiter } from './rateLimit.js';
import { getDailySites, getMsUntilNextDaily } from '../../src/game/daily.js';

// 10 requests/60s per IP -- unchanged from before this was factored out.
// Generous for genuine play (one score submission a day, occasional
// leaderboard re-checks) while bounding a script hammering either endpoint.
const isRateLimited = createRateLimiter({ windowMs: 60_000, max: 10 });

// Own budget, separate from the score/leaderboard one above -- this fires
// on every page load (not just once/day), so it needs a higher ceiling,
// and a burst of it shouldn't eat into score/leaderboard's budget either.
const isDailyManifestRateLimited = createRateLimiter({ windowMs: 60_000, max: 30 });

// public/_headers' security-header block doesn't reach Pages Functions (see
// that file's header comment) -- these are the same headers, scoped to what
// a JSON response actually needs. default-src 'none' is correct here (not
// the app-wide CSP from _headers): a JSON body never loads scripts/styles/
// images of its own, so there's nothing else to allow. Cross-Origin-
// Resource-Policy: same-origin stops another site from hotlinking these
// endpoints (e.g. an <img>/<script> tag pointed at /api/leaderboard) --
// this app never needs to be fetched cross-origin, so there's no reason to
// allow it.
const API_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// Strips control characters and Unicode bidi-override marks (e.g. U+202E
// RIGHT-TO-LEFT OVERRIDE) from a display name before it's stored -- a
// public leaderboard renders player_name verbatim, so this closes the
// classic invisible/reversed-text spoofing trick. Doesn't touch actual
// RTL-script letters (Arabic/Hebrew etc.), which render correctly on their
// own via the browser's normal bidi algorithm.
const CONTROL_AND_BIDI = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

function jsonResp(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...API_SECURITY_HEADERS },
  });
}

function todayIST() {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * POST /api/score
 * Body: { uuid, player_name, date, total_pts, total_dist }
 *
 * total_pts === 0 is a valid submission (e.g. all guesses way off) -- it's
 * just not worth an INSERT since it can never rank. We still SELECT and
 * return top10 for it so the client always gets a leaderboard back.
 */
export async function handleScore(request, env) {
  // See api.js's postScore -- any real cross-origin caller fails the CORS
  // preflight this header forces, and a plain <form> can't set custom
  // headers at all, so this only ever legitimately arrives from this app's
  // own JS running on this app's own origin.
  if (request.headers.get('X-Requested-With') !== 'ecoguesser') {
    return jsonResp({ error: 'invalid_request' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400);
  }
  const { uuid, player_name, date, total_pts, total_dist } = body ?? {};

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isRateLimited(ip)) return jsonResp({ success: false, error: 'rate_limited' }, 429);

  if (!uuid || typeof uuid !== 'string') {
    return jsonResp({ error: 'invalid_uuid' }, 400);
  }
  const cleanName = typeof player_name === 'string' ? player_name.replace(CONTROL_AND_BIDI, '').trim() : '';
  if (!cleanName || cleanName.length > 30) {
    return jsonResp({ error: 'invalid_name' }, 400);
  }
  if (date !== todayIST()) {
    return jsonResp({ error: 'invalid_date' }, 400);
  }
  // Number.isFinite rejects null/undefined/NaN/Infinity (null < 0 === false in JS,
  // so a plain `total_pts < 0` check alone would let a null total_pts through).
  if (!Number.isFinite(total_pts) || total_pts < 0 || total_pts > 25000) {
    return jsonResp({ error: 'invalid_pts' }, 400);
  }
  if (!Number.isFinite(total_dist) || total_dist < 0 || total_dist > 30000) {
    return jsonResp({ error: 'invalid_dist' }, 400);
  }

  const top10Stmt = env.DB.prepare(
    `SELECT uuid, player_name, total_pts, total_dist
     FROM scores WHERE date = ?
     ORDER BY total_pts DESC, total_dist ASC, submitted_at ASC
     LIMIT 10`
  ).bind(date);

  // Always SELECT and return top10 -- even for a 0-score submission.
  // The insert-path runs both statements through one DB.batch() -- a single
  // D1 round trip instead of the two sequential ones (INSERT .run(), then
  // SELECT .all()) this used to make. batch() is transactional, so the
  // SELECT sees the INSERT exactly as before, and a UNIQUE(uuid, date)
  // violation aborts the whole batch -- which lands in the same catch/409
  // path the standalone INSERT used, with an identical response body (the
  // 409 never included top10 before either).
  let result;
  if (total_pts > 0) {
    try {
      const batchResults = await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO scores (uuid, player_name, date, total_pts, total_dist) VALUES (?,?,?,?,?)'
        ).bind(uuid, cleanName, date, total_pts, total_dist),
        top10Stmt,
      ]);
      result = batchResults[1];
    } catch (err) {
      // UNIQUE(uuid, date) -- this player already submitted today.
      if (err.message?.includes('UNIQUE')) {
        return jsonResp({ success: false, error: 'already_submitted' }, 409);
      }
      throw err;
    }
  } else {
    result = await top10Stmt.all();
  }

  const pos = result.results.findIndex((r) => r.uuid === uuid);
  const rank = pos === -1 ? null : pos + 1; // array-position rank; null for 0-score/outside top10
  const top10 = result.results.map(({ uuid: _uuid, ...row }) => row);
  return jsonResp({ success: true, rank, top10 }, 200);
}

const _lbCache = new Map(); // date -> { body: string, expires: number }

function buildLeaderboardResponse(body, isToday) {
  const cacheControl = isToday
    ? 'public, max-age=300, stale-while-revalidate=600'
    : 'public, max-age=86400';
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cacheControl, ...API_SECURITY_HEADERS },
  });
}

/**
 * GET /api/leaderboard?date=YYYY-MM-DD
 * Returns { top10 } only -- no uuid, no rank, no submitted_at. Rank is
 * client-assigned from array index since this endpoint never identifies
 * "you" the way /api/score does.
 */
export async function handleLeaderboard(request, env, waitUntil) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isRateLimited(ip)) return jsonResp({ error: 'rate_limited' }, 429);

  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResp({ error: 'invalid_date' }, 400);

  const isToday = date === todayIST();

  // Past dates only: also serve/store through Cloudflare's edge Cache API
  // (same caches.default pattern, normalized internal key, and waitUntil
  // write-behind as tileProxy.js). Pages Functions responses are never
  // CDN-cached automatically -- the Cache-Control header below only helps
  // the browser -- and _lbCache further down is per-isolate, so every cold
  // isolate/colo was re-querying D1 for boards that are immutable once the
  // IST day rolls over. The edge entry expires per the stored response's
  // own max-age=86400. Today's board deliberately stays OFF the edge cache
  // and on the short-TTL in-isolate cache only, preserving its existing
  // freshness semantics exactly.
  const edgeKey = isToday
    ? null
    : new Request(`https://ecoguesser-lb-cache.internal/leaderboard/${date}`);
  if (edgeKey) {
    const edgeHit = await caches.default.match(edgeKey);
    if (edgeHit) return edgeHit;
  }

  const now = Date.now();
  const cached = _lbCache.get(date);
  if (cached && cached.expires > now) return buildLeaderboardResponse(cached.body, isToday);

  const result = await env.DB.prepare(
    `SELECT player_name, total_pts, total_dist, submitted_at
     FROM scores WHERE date = ?
     ORDER BY total_pts DESC, total_dist ASC, submitted_at ASC
     LIMIT 10`
  )
    .bind(date)
    .all();

  const top10 = result.results.map(({ submitted_at: _submittedAt, ...row }) => row);
  const body = JSON.stringify({ top10 });
  const ttl = isToday ? 60_000 : 3_600_000; // 1hr for past dates -- they're immutable; the edge cache above covers the rest
  _lbCache.set(date, { body, expires: now + ttl });
  for (const [k, v] of _lbCache) {
    if (v.expires < now - 30_000) _lbCache.delete(k);
  }

  const response = buildLeaderboardResponse(body, isToday);
  if (edgeKey) {
    // Cache a clone so the original body can still be returned -- same
    // clone-then-put + waitUntil write-behind as tileProxy.js.
    const toCache = response.clone();
    if (waitUntil) waitUntil(caches.default.put(edgeKey, toCache));
    else await caches.default.put(edgeKey, toCache);
  }
  return response;
}

/**
 * GET /api/daily-manifest
 * Returns { date, sites } -- today's 5 Daily sites, pre-selected with the
 * exact same getDailySites() algorithm src/game/daily.js runs client-side
 * (imported, not reimplemented, so the two can never disagree). Exists so
 * the Daily tab (the default one) doesn't have to wait on the full
 * 837-site/~25KB-gzip protected-areas.json catalog just to pick 5 of them --
 * useDailyRound.js uses this when available and falls back to computing
 * from the full catalog otherwise, so a miss here is never wrong, just slower.
 *
 * Edge-cached like handleLeaderboard's past-date branch above: one compute
 * per IST day per colo, everyone else on that edge node for that day gets
 * the cached response. protected-areas.json itself is fetched via the
 * ASSETS binding (Cloudflare Pages' direct static-asset lookup) rather than
 * a same-origin network fetch -- no extra round trip.
 */
export async function handleDailyManifest(request, env, waitUntil) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isDailyManifestRateLimited(ip)) return jsonResp({ error: 'rate_limited' }, 429);

  const date = todayIST();
  const edgeKey = new Request(`https://ecoguesser-daily-manifest.internal/${date}`);
  const edgeHit = await caches.default.match(edgeKey);
  if (edgeHit) return edgeHit;

  const allSitesResp = await env.ASSETS.fetch(new URL('/protected-areas.json', request.url));
  const allSites = await allSitesResp.json();
  const sites = getDailySites(date, allSites);

  const body = JSON.stringify({ date, sites });
  // Expires at the next IST midnight, same rollover instant getMsUntilNextDaily()
  // already governs Leaderboard's "next challenge in" countdown with.
  const maxAge = Math.ceil(getMsUntilNextDaily() / 1000);
  const response = new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAge}`, ...API_SECURITY_HEADERS },
  });

  const toCache = response.clone();
  if (waitUntil) waitUntil(caches.default.put(edgeKey, toCache));
  else await caches.default.put(edgeKey, toCache);
  return response;
}
