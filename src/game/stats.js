// src/game/stats.js
//
// Section 9b's Daily stats persistence -- loadDailyStats() is spec-verbatim;
// recordDailyResult() implements the "Daily stats write (on entering
// DAILY_SUMMARY)" algorithm (streak calc + idempotent scores.push), called
// once per real DAILY_SUMMARY entry from App.jsx.
//
// Scope: Daily only. loadNormalStats()/Classic's post-REVEALING write and
// the Stats tab's derived-field calculations (avg/best/distribution/etc.)
// aren't needed yet -- ClassicMap.jsx doesn't write stats at all currently,
// and the Stats tab is still BottomNav's disabled placeholder. Both land
// together when the Stats tab gets built (Section 9b).

import { LS_KEYS } from '../config.js';
import { getTodayString, getYesterdayString } from './daily.js';

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
