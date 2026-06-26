import { haversine } from './scoring.js';
import { DAILY } from '../config.js';

function bernsteinHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function lcgNext(s) {
  return (s * 1664525 + 1013904223) >>> 0;
}

/** IST "today" as YYYY-MM-DD. */
export function getTodayString() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** IST "yesterday" as YYYY-MM-DD. */
export function getYesterdayString() {
  return new Date(Date.now() + 5.5 * 3600 * 1000 - 86400 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Deterministic per-IST-date site selection: one site per category in
 * DAILY.CATEGORIES order. Same dateStr + same allSites always produces the
 * same 5 sites (seed comes only from the date string).
 *
 * LCG state advances continuously across ALL categories -- it is NOT reset
 * per category. This is what makes the picks for category N depend on how
 * many attempts category N-1 needed, so don't "fix" this into a per-category
 * fresh seed without re-deriving every already-shipped daily answer.
 */
export function getDailySites(dateStr, allSites) {
  let seed = bernsteinHash(dateStr);
  const picked = [];

  for (const cat of DAILY.CATEGORIES) {
    const pool = allSites.filter((s) => s.category === cat);
    if (pool.length === 0) {
      throw new Error(`getDailySites: no sites found for category "${cat}"`);
    }

    let chosen = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      seed = lcgNext(seed);
      const candidate = pool[seed % pool.length];
      const tooClose = picked.some(
        (p) =>
          haversine(
            p.centroid_lat,
            p.centroid_lng,
            candidate.centroid_lat,
            candidate.centroid_lng
          ) < DAILY.COLLISION_KM
      );
      if (!tooClose) {
        chosen = candidate;
        break;
      }
      chosen = candidate; // fallback if all 20 attempts fail
    }
    picked.push(chosen);
  }

  return picked;
}
