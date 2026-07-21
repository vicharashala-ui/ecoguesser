// src/game/achievements.js
// Achievements/badges layer. Deliberately a *read* layer only -- every check
// below is derived from data recordDailyResult/recordClassicResult/
// recordBlitzResult already persist (stats.js), so no new localStorage keys,
// no schema changes, and no edits to the three recordXResult() writers.
// Achievements are recomputed fresh from stats on every call rather than
// cached/persisted as "unlocked" flags -- stats.js is already the single
// source of truth for progress, and re-deriving is cheap (a handful of
// array scans over data capped at 200-365 entries).
//
// Two shapes of achievement:
//   - progress(ctx) -> {current, target}: "more is better" milestones
//     (rounds played, streak length). Rendered with a progress bar while
//     locked. unlocked = current >= target.
//   - check(ctx) -> boolean: one-off or "best of" achievements (a perfect
//     round, a hint-free day, category coverage) where a numeric progress
//     bar toward the threshold either doesn't apply (boolean flags) or
//     would be confusing (distance metrics where *lower* is better).
//     Rendered as a locked/unlocked flag only, no bar.
//
// computeAchievements() is the only export most callers need; the
// individual raw-history scanners below are exported too, purely so they're
// unit-testable in isolation from the achievement list/UI.

import { DAILY, SCORING } from '../config.js';
import {
  loadDailyStats, computeDailyStats,
  loadNormalStats, computeClassicStats,
  loadBlitzStats, computeBlitzStats,
} from './stats.js';

const ROUND_COUNT = DAILY.CATEGORIES.length; // 5 -- one round per category, per getDailySites

// ---------------------------------------------------------------------------
// Raw-history scanners
// ---------------------------------------------------------------------------
// computeDailyStats/computeClassicStats/computeBlitzStats already summarize
// most of what's needed (games, streaks, rounds, byCategory, bestGuess), but
// a few checks need to walk the raw day/round-level arrays that those
// summaries don't expose (a single day, or a single category's run of
// rounds) -- those live here instead of duplicating storage logic.

/** Any single Daily round anywhere in history scored a perfect 5000. */
function dailyHasPerfectRound(rawDaily) {
  return rawDaily.scores.some((day) => day.rounds.some((r) => r.score >= SCORING.MAX_SCORE));
}

/** Any single Daily day totalled a perfect score across all its rounds. */
function dailyHasPerfectDay(rawDaily) {
  const perfectTotal = SCORING.MAX_SCORE * ROUND_COUNT;
  return rawDaily.scores.some((day) => day.total >= perfectTotal);
}

/** Any single Daily day was finished without using a hint on any round. */
function dailyHasHintFreeDay(rawDaily) {
  return rawDaily.scores.some((day) => day.rounds.every((r) => (r.hints ?? 0) === 0));
}

/** Every DAILY.CATEGORIES entry has at least one Classic round played in it. */
function classicPlayedEveryCategory(classicComputed) {
  return DAILY.CATEGORIES.every((cat) => classicComputed.byCategory[cat] != null);
}

/** Some category has >= minSample Blitz rounds logged, ALL correct -- i.e.
 *  100% accuracy to date in that category, not a literal consecutive streak
 *  (history has no per-category ordering guarantee to check that against). */
function blitzHasCategoryExpert(rawBlitz, minSample = 10) {
  return DAILY.CATEGORIES.some((cat) => {
    const rounds = rawBlitz.history.filter((h) => h.cat === cat);
    return rounds.length >= minSample && rounds.every((h) => h.correct);
  });
}

/** Rounds played across all three modes combined (Blitz/Classic history is
 *  capped at 200 entries -- see stats.js -- so this undercounts past that
 *  point for those two modes; acceptable for a "keep playing" milestone). */
function totalRoundsPlayed(rawDaily, classicComputed, blitzComputed) {
  return rawDaily.scores.length * ROUND_COUNT + classicComputed.rounds + blitzComputed.rounds;
}

// ---------------------------------------------------------------------------
// Achievement definitions
// ---------------------------------------------------------------------------
// `icon` names a shape rendered by AchievementsSection in StatsView.jsx
// (kept out of this file so it stays render-agnostic / unit-testable).
// `mode` drives the color accent and the section an achievement is grouped
// under: 'daily' | 'classic' | 'blitz' | 'meta'.

const ACHIEVEMENTS = [
  // -- Daily -----------------------------------------------------------
  {
    id: 'daily_first', mode: 'daily', icon: 'flag',
    title: 'First Steps',
    description: 'Complete your first Daily Challenge.',
    progress: ({ daily }) => ({ current: daily.games, target: 1 }),
  },
  {
    id: 'daily_streak_3', mode: 'daily', icon: 'flame',
    title: 'On a Roll',
    description: 'Reach a 3-day Daily streak.',
    progress: ({ rawDaily }) => ({ current: rawDaily.bestStreak, target: 3 }),
  },
  {
    id: 'daily_streak_7', mode: 'daily', icon: 'flame',
    title: 'Week Warrior',
    description: 'Reach a 7-day Daily streak.',
    progress: ({ rawDaily }) => ({ current: rawDaily.bestStreak, target: 7 }),
  },
  {
    id: 'daily_streak_30', mode: 'daily', icon: 'flame',
    title: 'Iron Streak',
    description: 'Reach a 30-day Daily streak.',
    progress: ({ rawDaily }) => ({ current: rawDaily.bestStreak, target: 30 }),
  },
  {
    id: 'daily_veteran', mode: 'daily', icon: 'trophy',
    title: 'Daily Veteran',
    description: 'Complete 50 Daily Challenges.',
    progress: ({ daily }) => ({ current: daily.games, target: 50 }),
  },
  {
    id: 'daily_perfect_round', mode: 'daily', icon: 'star',
    title: 'Bullseye',
    description: 'Score a perfect 5,000 on a single Daily round.',
    check: ({ rawDaily }) => dailyHasPerfectRound(rawDaily),
  },
  {
    id: 'daily_perfect_day', mode: 'daily', icon: 'crown',
    title: 'Flawless Day',
    description: `Score a perfect 5,000 on every round in one Daily Challenge (${ROUND_COUNT} for ${ROUND_COUNT}).`,
    check: ({ rawDaily }) => dailyHasPerfectDay(rawDaily),
  },
  {
    id: 'daily_hint_free_day', mode: 'daily', icon: 'leaf',
    title: 'No Hints Needed',
    description: 'Finish a full Daily Challenge without using a single hint.',
    check: ({ rawDaily }) => dailyHasHintFreeDay(rawDaily),
  },
  {
    id: 'daily_sharpshooter', mode: 'daily', icon: 'target',
    title: 'Sharpshooter',
    description: 'Land a Daily guess within 5 km of the actual site.',
    check: ({ daily }) => daily.bestGuess != null && daily.bestGuess <= 5,
  },

  // -- Classic -----------------------------------------------------------
  {
    id: 'classic_first', mode: 'classic', icon: 'flag',
    title: 'Explorer',
    description: 'Play your first Classic round.',
    progress: ({ classic }) => ({ current: classic.rounds, target: 1 }),
  },
  {
    id: 'classic_25', mode: 'classic', icon: 'trophy',
    title: 'Frequent Flyer',
    description: 'Play 25 Classic rounds.',
    progress: ({ classic }) => ({ current: classic.rounds, target: 25 }),
  },
  {
    id: 'classic_100', mode: 'classic', icon: 'trophy',
    title: 'Century Club',
    description: 'Play 100 Classic rounds.',
    progress: ({ classic }) => ({ current: classic.rounds, target: 100 }),
  },
  {
    id: 'classic_500', mode: 'classic', icon: 'trophy',
    title: 'Ecoguesser Master',
    description: 'Play 500 Classic rounds.',
    progress: ({ classic }) => ({ current: classic.rounds, target: 500 }),
  },
  {
    id: 'classic_sharpshooter', mode: 'classic', icon: 'target',
    title: 'Pinpoint Precision',
    description: 'Land a Classic guess within 5 km of the actual site.',
    check: ({ classic }) => classic.bestGuess != null && classic.bestGuess <= 5,
  },
  {
    id: 'classic_well_rounded', mode: 'classic', icon: 'compass',
    title: 'Well-Rounded',
    description: 'Play a Classic round in every protected-area category.',
    check: ({ classic }) => classicPlayedEveryCategory(classic),
  },

  // -- Blitz -----------------------------------------------------------
  {
    id: 'blitz_first', mode: 'blitz', icon: 'flag',
    title: 'Quick Draw',
    description: 'Play your first Blitz round.',
    progress: ({ blitz }) => ({ current: blitz.rounds, target: 1 }),
  },
  {
    id: 'blitz_25', mode: 'blitz', icon: 'trophy',
    title: 'Rapid Fire',
    description: 'Play 25 Blitz rounds.',
    progress: ({ blitz }) => ({ current: blitz.rounds, target: 25 }),
  },
  {
    id: 'blitz_100', mode: 'blitz', icon: 'trophy',
    title: 'Blitz Century',
    description: 'Play 100 Blitz rounds.',
    progress: ({ blitz }) => ({ current: blitz.rounds, target: 100 }),
  },
  {
    id: 'blitz_streak_10', mode: 'blitz', icon: 'flame',
    title: 'Streak Star',
    description: 'Reach a 10-correct Blitz streak.',
    progress: ({ rawBlitz }) => ({ current: rawBlitz.bestStreak, target: 10 }),
  },
  {
    id: 'blitz_streak_25', mode: 'blitz', icon: 'flame',
    title: 'Blitz Legend',
    description: 'Reach a 25-correct Blitz streak.',
    progress: ({ rawBlitz }) => ({ current: rawBlitz.bestStreak, target: 25 }),
  },
  {
    id: 'blitz_sharp_eye', mode: 'blitz', icon: 'bolt',
    title: 'Sharp Eye',
    description: 'Reach 90%+ Blitz accuracy over at least 20 rounds.',
    check: ({ blitz }) => blitz.rounds >= 20 && blitz.accuracy >= 90,
  },
  {
    id: 'blitz_category_expert', mode: 'blitz', icon: 'bolt',
    title: 'Category Expert',
    description: 'Get 100% Blitz accuracy in a single category (min. 10 rounds played in it).',
    check: ({ rawBlitz }) => blitzHasCategoryExpert(rawBlitz),
  },

  // -- Overall -----------------------------------------------------------
  {
    id: 'meta_triple_threat', mode: 'meta', icon: 'crown',
    title: 'Triple Threat',
    description: 'Play at least one round of Daily, Classic, and Blitz.',
    check: ({ daily, classic, blitz }) => daily.games >= 1 && classic.rounds >= 1 && blitz.rounds >= 1,
  },
  {
    id: 'meta_dedicated', mode: 'meta', icon: 'trophy',
    title: 'Dedicated Ranger',
    description: 'Play 250 rounds total, across every mode.',
    progress: ({ rawDaily, classic, blitz }) => ({
      current: totalRoundsPlayed(rawDaily, classic, blitz),
      target: 250,
    }),
  },
];

/**
 * @returns {Array<typeof ACHIEVEMENTS[number] & {
 *   unlocked: boolean,
 *   progress: {current:number, target:number} | null,
 * }>}
 */
export function computeAchievements() {
  const rawDaily = loadDailyStats();
  const daily = computeDailyStats(rawDaily);
  const rawClassic = loadNormalStats();
  const classic = computeClassicStats(rawClassic);
  const rawBlitz = loadBlitzStats();
  const blitz = computeBlitzStats(rawBlitz);

  const ctx = { rawDaily, daily, rawClassic, classic, rawBlitz, blitz };

  return ACHIEVEMENTS.map((a) => {
    const progress = a.progress ? a.progress(ctx) : null;
    const unlocked = progress ? progress.current >= progress.target : a.check(ctx);
    return { ...a, unlocked, progress };
  });
}

/**
 * Diffs two computeAchievements() snapshots and returns the achievements
 * that flipped from locked to unlocked between them -- used by
 * useAchievementUnlocks.js to detect a live in-session unlock (a "before"
 * snapshot taken right before a mode's recordXResult write, an "after" one
 * right after) without any separate "already seen" persistence: since
 * achievements are re-derived fresh every call, this is a pure array diff.
 *
 * @param {ReturnType<typeof computeAchievements>} before
 * @param {ReturnType<typeof computeAchievements>} after
 * @returns {ReturnType<typeof computeAchievements>}
 */
export function findNewlyUnlocked(before, after) {
  const wasUnlocked = new Set(before.filter((a) => a.unlocked).map((a) => a.id));
  return after.filter((a) => a.unlocked && !wasUnlocked.has(a.id));
}
