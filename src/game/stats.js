// src/game/stats.js
//
// Section 9b's stats persistence -- Daily side (loadDailyStats/
// recordDailyResult/hasPlayedToday/bestDailyScore) is unchanged from v8.19.
//
// Added this pass, closing the gap the file-header comment used to flag
// ("loadNormalStats()/Classic's post-REVEALING write ... aren't needed yet"):
//   - loadNormalStats() / recordClassicResult() -- Classic's stats_normal
//     read/write, spec-verbatim ("Classic stats write (after each
//     REVEALING)": loadNormalStats -> push history -> increment rounds ->
//     bestDist = Math.min(...) -> cap history at 200 -> write).
//   - computeDailyStats() / computeClassicStats() -- the Section 9b derived
//     fields (games played, streaks, averages, score distribution buckets,
//     per-category means, hint/timeout/skip sums, Classic's sparkline trend
//     array). Pulled into this file rather than left inline in StatsView.jsx
//     so they're unit-testable independent of rendering, and so a future
//     ShareCard-style consumer doesn't have to duplicate the math.

import { LS_KEYS, DAILY } from '../config.js';
import { getTodayString, getYesterdayString } from './daily.js';

// ---------------------------------------------------------------------------
// Daily -- unchanged from v8.19
// ---------------------------------------------------------------------------

export function loadDailyStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEYS.STATS_DAILY));
    if (!raw || typeof raw !== 'object') throw new Error();
    return {
      streak: raw.streak ?? 0,
      bestStreak: raw.bestStreak ?? 0,
      lastPlayedDate: raw.lastPlayedDate ?? null,
      scores: Array.isArray(raw.scores) ? raw.scores : [],
    };
  } catch {
    return { streak: 0, bestStreak: 0, lastPlayedDate: null, scores: [] };
  }
}

/** True once today's DAILY_SUMMARY write has already landed -- drives the
 *  Daily bottom-nav tab's DAILY_ROUND-vs-LEADERBOARD routing (Section 4) and
 *  guards App.jsx's initial dailyPhase against dropping a returning player
 *  back into a live round on page reload. */
export function hasPlayedToday(stats = loadDailyStats()) {
  const today = getTodayString();
  const lastScore = stats.scores[stats.scores.length - 1];
  return lastScore?.date === today || stats.lastPlayedDate === today;
}

/**
 * Writes one Daily run to localStorage: streak math + capped scores push.
 * Idempotent -- a second call for the same day is a no-op (spec step 2),
 * since a stray double-call (e.g. React Strict Mode re-firing the effect
 * that routes a Skip'd final round) must not double the streak or push two
 * entries for one day.
 */
export function recordDailyResult(results, totalPts, totalDist) {
  const stats = loadDailyStats();
  const today = getTodayString();

  if (stats.scores[stats.scores.length - 1]?.date === today) return stats;

  stats.streak = stats.lastPlayedDate === getYesterdayString() ? stats.streak + 1 : 1;
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  stats.lastPlayedDate = today;
  stats.scores.push({
    date: today,
    total: totalPts,
    dist: totalDist,
    rounds: results.map((r) => ({
      cat: r.site.category,
      dist: r.distanceKm,
      score: r.finalScore,
      hints: r.hintsUsed,
      timedOut: r.timedOut,
      skipped: r.skipped,
    })),
  });
  if (stats.scores.length > 365) stats.scores.shift();

  localStorage.setItem(LS_KEYS.STATS_DAILY, JSON.stringify(stats));
  return stats;
}

/** Section 8's "Your best: 19,200 (May 28)" -- max of scores[].total per
 *  spec (today's just-written entry counts too). Returns null if empty. */
export function bestDailyScore(stats) {
  if (stats.scores.length === 0) return null;
  return stats.scores.reduce((best, s) => (s.total > best.total ? s : best));
}

// ---------------------------------------------------------------------------
// Classic -- new this pass
// ---------------------------------------------------------------------------

export function loadNormalStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEYS.STATS_NORM));
    if (!raw || typeof raw !== 'object') throw new Error();
    return {
      rounds: raw.rounds ?? 0,
      // Default 999999, NOT Infinity -- JSON.stringify(Infinity) === 'null',
      // which would round-trip back through JSON.parse as null, not a number.
      bestDist: raw.bestDist ?? 999999,
      history: Array.isArray(raw.history) ? raw.history : [],
    };
  } catch {
    return { rounds: 0, bestDist: 999999, history: [] };
  }
}

/**
 * Writes one Classic round to localStorage. Spec: loadNormalStats() -> push
 * to history -> increment rounds -> bestDist = Math.min(stats.bestDist, dist)
 * -> cap history at 200 -> write.
 *
 * Classic's Confirm button is disabled until a marker is placed (Decision
 * #8), so result.distanceKm is always a real number here -- unlike Daily,
 * there's no null/skip path to guard against.
 */
export function recordClassicResult(result) {
  const stats = loadNormalStats();
  const dist = result.distanceKm;

  stats.rounds += 1;
  stats.bestDist = Math.min(stats.bestDist, dist);
  stats.history.push({ dist, score: result.finalScore, ts: Date.now() });
  if (stats.history.length > 200) stats.history.shift();

  localStorage.setItem(LS_KEYS.STATS_NORM, JSON.stringify(stats));
  return stats;
}

// ---------------------------------------------------------------------------
// Section 9b derived fields
// ---------------------------------------------------------------------------

const DAILY_BUCKET_SIZE = 5000; // 0-5k, 5-10k, 10-15k, 15-20k, 20-25k
const DAILY_BUCKET_COUNT = 5;

/**
 * @param {ReturnType<typeof loadDailyStats>} stats
 * @returns {{
 *   games: number, streak: number, bestStreak: number,
 *   avgScore: number|null, bestScore: number|null,
 *   distribution: number[],           // length 5, bucket counts
 *   avgDistPerGame: number|null,
 *   avgDistPerGuess: number|null,     // mean of all non-null rounds[].dist
 *   bestGuess: number|null,           // min of all non-null rounds[].dist
 *   byCategory: Record<string, number|null>,  // mean rounds[].score per cat
 *   hints: number, timeouts: number, skips: number,
 * }}
 */
export function computeDailyStats(stats) {
  const games = stats.scores.length;
  const distribution = new Array(DAILY_BUCKET_COUNT).fill(0);

  if (games === 0) {
    const emptyByCategory = {};
    for (const cat of DAILY.CATEGORIES) emptyByCategory[cat] = null;
    return {
      games: 0,
      streak: stats.streak,
      bestStreak: stats.bestStreak,
      avgScore: null,
      bestScore: null,
      distribution,
      avgDistPerGame: null,
      avgDistPerGuess: null,
      bestGuess: null,
      byCategory: emptyByCategory,
      hints: 0,
      timeouts: 0,
      skips: 0,
    };
  }

  const totals = stats.scores.map((s) => s.total);
  const avgScore = Math.round(totals.reduce((a, b) => a + b, 0) / games);
  const bestScore = Math.max(...totals);

  for (const t of totals) {
    const idx = Math.min(DAILY_BUCKET_COUNT - 1, Math.floor(t / DAILY_BUCKET_SIZE));
    distribution[idx] += 1;
  }

  const avgDistPerGame = Math.round(stats.scores.reduce((a, s) => a + s.dist, 0) / games);

  const allRounds = stats.scores.flatMap((s) => s.rounds);
  const nonNullDists = allRounds.map((r) => r.dist).filter((d) => d != null);
  const avgDistPerGuess = nonNullDists.length
    ? Math.round(nonNullDists.reduce((a, b) => a + b, 0) / nonNullDists.length)
    : null;
  const bestGuess = nonNullDists.length ? Math.round(Math.min(...nonNullDists)) : null;

  const byCategory = {};
  for (const cat of DAILY.CATEGORIES) {
    const catRounds = allRounds.filter((r) => r.cat === cat);
    byCategory[cat] = catRounds.length
      ? Math.round(catRounds.reduce((a, r) => a + r.score, 0) / catRounds.length)
      : null;
  }

  const hints = allRounds.reduce((a, r) => a + r.hints, 0);
  const timeouts = allRounds.filter((r) => r.timedOut).length;
  const skips = allRounds.filter((r) => r.skipped).length;

  return {
    games,
    streak: stats.streak,
    bestStreak: stats.bestStreak,
    avgScore,
    bestScore,
    distribution,
    avgDistPerGame,
    avgDistPerGuess,
    bestGuess,
    byCategory,
    hints,
    timeouts,
    skips,
  };
}

/**
 * @param {ReturnType<typeof loadNormalStats>} stats
 * @returns {{
 *   rounds: number, avgDist: number|null, avgScore: number|null,
 *   bestGuess: number|null, trend: number[],  // last 20 history[].score
 * }}
 */
export function computeClassicStats(stats) {
  if (stats.rounds === 0 || stats.history.length === 0) {
    return { rounds: stats.rounds, avgDist: null, avgScore: null, bestGuess: null, trend: [] };
  }

  const avgDist = Math.round(
    stats.history.reduce((a, h) => a + h.dist, 0) / stats.history.length
  );
  const avgScore = Math.round(
    stats.history.reduce((a, h) => a + h.score, 0) / stats.history.length
  );
  // bestDist, NOT min(history) -- history is capped at 200 entries, so an
  // early great guess could have already scrolled out of it (Section 9b).
  const bestGuess = stats.bestDist === 999999 ? null : Math.round(stats.bestDist);
  const trend = stats.history.slice(-20).map((h) => h.score);

  return { rounds: stats.rounds, avgDist, avgScore, bestGuess, trend };
}
