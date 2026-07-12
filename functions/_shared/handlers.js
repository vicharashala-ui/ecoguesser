// functions/_shared/handlers.js
// Module-scope state (_rateStore, _lbCache) persists for the lifetime of a
// given Worker isolate -- not across isolates/deploys, which is fine for a
// best-effort rate limit and a short-TTL leaderboard cache.

const _rateStore = new Map(); // ip -> [timestamp, ...]

function isRateLimited(ip) {
  const now = Date.now();
  const cutoff = now - 60_000;
  const prev = (_rateStore.get(ip) ?? []).filter((t) => t > cutoff);
  if (prev.length >= 10) {
    _rateStore.set(ip, prev);
    return true;
  }
  _rateStore.set(ip, [...prev, now]);
  if (_rateStore.size > 10_000) {
    for (const [k, v] of _rateStore) {
      if (v.every((t) => t < cutoff)) _rateStore.delete(k);
    }
  }
  return false;
}

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

  if (total_pts > 0) {
    try {
      await env.DB.prepare(
        'INSERT INTO scores (uuid, player_name, date, total_pts, total_dist) VALUES (?,?,?,?,?)'
      )
        .bind(uuid, cleanName, date, total_pts, total_dist)
        .run();
    } catch (err) {
      // UNIQUE(uuid, date) -- this player already submitted today.
      if (err.message?.includes('UNIQUE')) {
        return jsonResp({ success: false, error: 'already_submitted' }, 409);
      }
      throw err;
    }
  }

  // Always SELECT and return top10 -- even for a 0-score submission.
  const result = await env.DB.prepare(
    `SELECT uuid, player_name, total_pts, total_dist
     FROM scores WHERE date = ?
     ORDER BY total_pts DESC, total_dist ASC, submitted_at ASC
     LIMIT 10`
  )
    .bind(date)
    .all();

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
export async function handleLeaderboard(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isRateLimited(ip)) return jsonResp({ error: 'rate_limited' }, 429);

  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResp({ error: 'invalid_date' }, 400);

  const isToday = date === todayIST();

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
  const ttl = isToday ? 60_000 : 3_600_000; // 1hr for past dates -- they're immutable; CDN covers the rest
  _lbCache.set(date, { body, expires: now + ttl });
  for (const [k, v] of _lbCache) {
    if (v.expires < now - 30_000) _lbCache.delete(k);
  }

  return buildLeaderboardResponse(body, isToday);
}
