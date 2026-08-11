// src/game/achievements.js
// Achievements/badges layer. Deliberately a *read* layer only -- every check
// below is derived from data recordDailyResult/recordClassicResult/
// recordBlitzResult (and recordSiteEncounter) already persist (stats.js), so
// no new localStorage keys, no schema changes, and no edits to those
// writers. Achievements are recomputed fresh from stats on every call rather
// than cached/persisted as "unlocked" flags -- stats.js is already the
// single source of truth for progress, and re-deriving is cheap (a handful
// of array scans over data capped at 200-365 entries).
//
// Every achievement is a *tiered* family of 1 or more levels, evaluated one
// of two ways:
//   - metric(ctx) -> number: "more is better" (or, with lowerIsBetter:true,
//     "less is better") milestones -- rounds played, streak length, average
//     distance. tiers[] must be ordered easiest-first; tierIndex is how many
//     of them the current metric value has cleared. Rendered with a progress
//     bar toward the next tier while not maxed (lowerIsBetter families skip
//     the bar -- see StatsView.jsx's AchievementBadge -- since a linear "%
//     of the way to a smaller number" bar doesn't read as meaningful).
//   - check(ctx) -> boolean: one-off achievements (a perfect round, category
//     coverage) that don't naturally have levels. Always a single-tier
//     family by convention (tiers.length === 1, no `target` on that tier).
//
// computeAchievements(sites) is the only export most callers need; the
// individual raw-history scanners below are exported too, purely so they're
// unit-testable in isolation from the achievement list/UI.

import { DAILY, SCORING } from '../config.js';
import {
  loadDailyStats, computeDailyStats,
  loadNormalStats, computeClassicStats,
  loadBlitzStats, computeBlitzStats,
  computeCollectionStats,
} from './stats.js';

const ROUND_COUNT = DAILY.CATEGORIES.length; // 5 -- one round per category, per getDailySites

// ---------------------------------------------------------------------------
// Raw-history scanners
// ---------------------------------------------------------------------------
// computeDailyStats/computeClassicStats/computeBlitzStats already summarize
// most of what's needed (games, streaks, rounds, byCategory, bestGuess), but
// a few checks need to walk the raw day/round-level arrays that those
// summaries don't expose (per-day totals, a single category's run of
// rounds) -- those live here instead of duplicating storage logic.

/** Any single Daily round anywhere in history scored a perfect 5000. */
function dailyHasPerfectRound(rawDaily) {
  return rawDaily.scores.some((day) => day.rounds.some((r) => r.score >= SCORING.MAX_SCORE));
}

/** How many Daily days totalled a perfect score across all their rounds. */
function dailyPerfectDayCount(rawDaily) {
  const perfectTotal = SCORING.MAX_SCORE * ROUND_COUNT;
  return rawDaily.scores.filter((day) => day.total >= perfectTotal).length;
}

/** How many Daily days were finished without using a hint on any round. */
function dailyHintFreeDayCount(rawDaily) {
  return rawDaily.scores.filter((day) => day.rounds.every((r) => (r.hints ?? 0) === 0)).length;
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
// `icon` names a shape rendered by AchievementIcon.jsx (kept out of this
// file so it stays render-agnostic / unit-testable). `mode` drives the
// color accent and the section an achievement is grouped under:
// 'daily' | 'classic' | 'blitz' | 'collection' | 'meta'.

const ACHIEVEMENTS = [
  // -- Daily -----------------------------------------------------------
  {
    id: 'daily_games', mode: 'daily', icon: 'flag',
    metric: ({ daily }) => daily.games,
    tiers: [
      { target: 1, title: 'First Steps', description: 'Complete your first Daily Challenge.' },
      { target: 10, title: 'Committed Explorer', description: 'Complete 10 Daily Challenges.' },
      { target: 50, title: 'Daily Veteran', description: 'Complete 50 Daily Challenges.' },
      { target: 150, title: 'Daily Devotee', description: 'Complete 150 Daily Challenges.' },
    ],
  },
  {
    id: 'daily_streak', mode: 'daily', icon: 'flame',
    metric: ({ rawDaily }) => rawDaily.bestStreak,
    tiers: [
      { target: 3, title: 'On a Roll', description: 'Reach a 3-day Daily streak.' },
      { target: 7, title: 'Week Warrior', description: 'Reach a 7-day Daily streak.' },
      { target: 30, title: 'Iron Streak', description: 'Reach a 30-day Daily streak.' },
      { target: 100, title: 'Unbreakable', description: 'Reach a 100-day Daily streak.' },
    ],
  },
  {
    id: 'daily_perfect_round', mode: 'daily', icon: 'star',
    check: ({ rawDaily }) => dailyHasPerfectRound(rawDaily),
    tiers: [{ title: 'Bullseye', description: 'Score a perfect 5,000 on a single Daily round.' }],
  },
  {
    id: 'daily_perfect_days', mode: 'daily', icon: 'crown',
    metric: ({ rawDaily }) => dailyPerfectDayCount(rawDaily),
    tiers: [
      { target: 1, title: 'Flawless Day', description: `Score a perfect 5,000 on every round in one Daily Challenge (${ROUND_COUNT} for ${ROUND_COUNT}).` },
      { target: 5, title: 'Flawless Streak', description: 'Score a perfect Daily Challenge 5 times.' },
      { target: 15, title: 'Flawless Master', description: 'Score a perfect Daily Challenge 15 times.' },
    ],
  },
  {
    id: 'daily_hint_free_days', mode: 'daily', icon: 'leaf',
    metric: ({ rawDaily }) => dailyHintFreeDayCount(rawDaily),
    tiers: [
      { target: 1, title: 'No Hints Needed', description: 'Finish a full Daily Challenge without using a single hint.' },
      { target: 10, title: 'Natural Navigator', description: 'Finish 10 Daily Challenges without a hint.' },
      { target: 30, title: 'Instinct Master', description: 'Finish 30 Daily Challenges without a hint.' },
    ],
  },
  {
    id: 'daily_sharpshooter', mode: 'daily', icon: 'target', lowerIsBetter: true,
    metric: ({ daily }) => daily.bestGuess ?? Infinity,
    tiers: [
      { target: 5, title: 'Sharpshooter', description: 'Land a Daily guess within 5 km of the actual site.' },
      { target: 2, title: 'Deadeye', description: 'Land a Daily guess within 2 km of the actual site.' },
      { target: 0.5, title: 'Laser Focus', description: 'Land a Daily guess within 500 m of the actual site.' },
    ],
  },

  // -- Classic -----------------------------------------------------------
  {
    id: 'classic_rounds', mode: 'classic', icon: 'trophy',
    metric: ({ classic }) => classic.rounds,
    tiers: [
      { target: 1, title: 'Explorer', description: 'Play your first Classic round.' },
      { target: 25, title: 'Frequent Flyer', description: 'Play 25 Classic rounds.' },
      { target: 100, title: 'Century Club', description: 'Play 100 Classic rounds.' },
      { target: 500, title: 'Ecoguesser Master', description: 'Play 500 Classic rounds.' },
    ],
  },
  {
    id: 'classic_sharpshooter', mode: 'classic', icon: 'target', lowerIsBetter: true,
    metric: ({ classic }) => classic.bestGuess ?? Infinity,
    tiers: [
      { target: 5, title: 'Pinpoint Precision', description: 'Land a Classic guess within 5 km of the actual site.' },
      { target: 2, title: 'Master Cartographer', description: 'Land a Classic guess within 2 km of the actual site.' },
      { target: 0.5, title: 'Terrain Whisperer', description: 'Land a Classic guess within 500 m of the actual site.' },
    ],
  },
  {
    id: 'classic_avg_distance', mode: 'classic', icon: 'eye', lowerIsBetter: true,
    metric: ({ classic }) => (classic.rounds >= 20 ? classic.avgDist : Infinity),
    tiers: [
      { target: 50, title: 'Field Sense', description: 'Average under 50 km per guess over at least 20 Classic rounds.' },
      { target: 20, title: 'Sharp Instincts', description: 'Average under 20 km per guess over at least 20 Classic rounds.' },
      { target: 8, title: 'Terrain Master', description: 'Average under 8 km per guess over at least 20 Classic rounds.' },
    ],
  },
  {
    id: 'classic_well_rounded', mode: 'classic', icon: 'compass',
    check: ({ classic }) => classicPlayedEveryCategory(classic),
    tiers: [{ title: 'Well-Rounded', description: 'Play a Classic round in every protected-area category.' }],
  },

  // -- Blitz -----------------------------------------------------------
  {
    id: 'blitz_rounds', mode: 'blitz', icon: 'trophy',
    metric: ({ blitz }) => blitz.rounds,
    tiers: [
      { target: 1, title: 'Quick Draw', description: 'Play your first Blitz round.' },
      { target: 25, title: 'Rapid Fire', description: 'Play 25 Blitz rounds.' },
      { target: 100, title: 'Blitz Century', description: 'Play 100 Blitz rounds.' },
      { target: 300, title: 'Blitz Marathon', description: 'Play 300 Blitz rounds.' },
    ],
  },
  {
    id: 'blitz_streak', mode: 'blitz', icon: 'flame',
    metric: ({ rawBlitz }) => rawBlitz.bestStreak,
    tiers: [
      { target: 10, title: 'Streak Star', description: 'Reach a 10-correct Blitz streak.' },
      { target: 25, title: 'Blitz Legend', description: 'Reach a 25-correct Blitz streak.' },
      { target: 50, title: 'Streak Master', description: 'Reach a 50-correct Blitz streak.' },
      { target: 100, title: 'Untouchable', description: 'Reach a 100-correct Blitz streak.' },
    ],
  },
  {
    // Blitz has no per-round timing data (see stats.js's recordBlitzResult
    // -- history is {correct, cat, ts} only, ts being a write timestamp,
    // not elapsed answer time), so this is an accuracy ladder rather than a
    // speed one; adding real speed tiers would mean a recordBlitzResult
    // schema change, which achievements.js's read-only contract rules out.
    id: 'blitz_accuracy', mode: 'blitz', icon: 'bolt',
    metric: ({ blitz }) => (blitz.rounds >= 20 ? blitz.accuracy : -1),
    tiers: [
      { target: 75, title: 'Sharp Eye', description: 'Reach 75%+ Blitz accuracy over at least 20 rounds.' },
      { target: 90, title: 'Eagle Eye', description: 'Reach 90%+ Blitz accuracy over at least 20 rounds.' },
      { target: 97, title: 'Perfect Vision', description: 'Reach 97%+ Blitz accuracy over at least 20 rounds.' },
    ],
  },
  {
    id: 'blitz_category_expert', mode: 'blitz', icon: 'target',
    check: ({ rawBlitz }) => blitzHasCategoryExpert(rawBlitz),
    tiers: [{ title: 'Category Expert', description: 'Get 100% Blitz accuracy in a single category (min. 10 rounds played in it).' }],
  },

  // -- Site Collection -----------------------------------------------------
  // Same underlying computeCollectionStats() data as StatsView.jsx's Site
  // Collection ring grid, just re-thresholded as milestones. Needs the full
  // site list -- see computeAchievements(sites) below -- to read
  // per-category totals, unlike every achievement above which only needs
  // stats.js's localStorage-backed summaries.
  {
    id: 'collection_total', mode: 'collection', icon: 'pin',
    metric: ({ collection }) => collection.seen,
    tiers: [
      { target: 25, title: 'First Sightings', description: 'Encounter 25 distinct protected areas.' },
      { target: 100, title: 'Field Naturalist', description: 'Encounter 100 distinct protected areas.' },
      { target: 300, title: 'Seasoned Ranger', description: 'Encounter 300 distinct protected areas.' },
      // 838 mirrors the current site pool size (protected-areas.json) -- if
      // the pool grows, update this alongside the per-category top tiers below.
      { target: 838, title: 'Complete Collection', description: 'Encounter every protected area in EcoGuesser.' },
    ],
  },
  {
    id: 'collection_np', mode: 'collection', icon: 'pin',
    metric: ({ collection }) => collection.byCategory.np.seen,
    tiers: [
      { target: 25, title: 'Park Wanderer', description: 'Encounter 25 National Parks.' },
      { target: 55, title: 'Park Ranger', description: 'Encounter 55 National Parks.' },
      { target: 107, title: 'Park Guardian', description: 'Encounter every National Park (107).' },
    ],
  },
  {
    id: 'collection_wls', mode: 'collection', icon: 'pin',
    metric: ({ collection }) => collection.byCategory.wls.seen,
    tiers: [
      { target: 150, title: 'Sanctuary Visitor', description: 'Encounter 150 Wildlife Sanctuaries.' },
      { target: 300, title: 'Wildlife Tracker', description: 'Encounter 300 Wildlife Sanctuaries.' },
      { target: 554, title: 'Sanctuary Guardian', description: 'Encounter every Wildlife Sanctuary (554).' },
    ],
  },
  {
    id: 'collection_tr', mode: 'collection', icon: 'pin',
    metric: ({ collection }) => collection.byCategory.tr.seen,
    tiers: [
      { target: 15, title: 'Reserve Scout', description: 'Encounter 15 Tiger Reserves.' },
      { target: 30, title: 'Tiger Tracker', description: 'Encounter 30 Tiger Reserves.' },
      { target: 58, title: 'Reserve Guardian', description: 'Encounter every Tiger Reserve (58).' },
    ],
  },
  {
    id: 'collection_ramsar', mode: 'collection', icon: 'pin',
    metric: ({ collection }) => collection.byCategory.ramsar.seen,
    tiers: [
      { target: 25, title: 'Wetland Wanderer', description: 'Encounter 25 Ramsar Sites.' },
      { target: 50, title: 'Wetland Watcher', description: 'Encounter 50 Ramsar Sites.' },
      { target: 101, title: 'Wetland Guardian', description: 'Encounter every Ramsar Site (101).' },
    ],
  },
  {
    id: 'collection_br', mode: 'collection', icon: 'pin',
    metric: ({ collection }) => collection.byCategory.br.seen,
    tiers: [
      { target: 5, title: 'Biosphere Novice', description: 'Encounter 5 Biosphere Reserves.' },
      { target: 10, title: 'Biosphere Scholar', description: 'Encounter 10 Biosphere Reserves.' },
      { target: 18, title: 'Biosphere Guardian', description: 'Encounter every Biosphere Reserve (18).' },
    ],
  },

  // -- Overall -----------------------------------------------------------
  {
    id: 'meta_triple_threat', mode: 'meta', icon: 'crown',
    metric: ({ daily, classic, blitz }) => Math.min(daily.games, classic.rounds, blitz.rounds),
    tiers: [
      { target: 1, title: 'Triple Threat', description: 'Play at least one round of Daily, Classic, and Blitz.' },
      { target: 10, title: 'Renaissance Ranger', description: 'Play at least 10 rounds in Daily, Classic, and Blitz.' },
      { target: 25, title: 'Master of All Modes', description: 'Play at least 25 rounds in Daily, Classic, and Blitz.' },
    ],
  },
  {
    id: 'meta_dedicated', mode: 'meta', icon: 'trophy',
    metric: ({ rawDaily, classic, blitz }) => totalRoundsPlayed(rawDaily, classic, blitz),
    tiers: [
      { target: 100, title: 'Committed', description: 'Play 100 rounds total, across every mode.' },
      { target: 250, title: 'Dedicated Ranger', description: 'Play 250 rounds total, across every mode.' },
      { target: 600, title: 'Elite Ranger', description: 'Play 600 rounds total, across every mode.' },
      { target: 1500, title: 'Legendary Ranger', description: 'Play 1500 rounds total, across every mode.' },
    ],
  },
];

/** Evaluates one achievement definition against the shared ctx, resolving
 *  it to a render-ready snapshot (see computeAchievements's return jsdoc). */
function evaluateAchievement(a, ctx) {
  const tierCount = a.tiers.length;

  if (a.check) {
    // Boolean, one-off achievements are always single-tier by convention.
    const unlocked = a.check(ctx);
    const tier = a.tiers[0];
    return {
      id: a.id, mode: a.mode, icon: a.icon, tiers: a.tiers,
      tierIndex: unlocked ? 1 : 0, tierCount, unlocked, maxed: unlocked,
      current: null, lowerIsBetter: false,
      title: tier.title, description: tier.description, nextTier: null,
    };
  }

  const current = a.metric(ctx);
  const meets = a.lowerIsBetter
    ? (t) => current <= t.target
    : (t) => current >= t.target;

  // tiers[] is always defined easiest-first, so the first one that fails
  // ends the climb -- no need to scan the whole array on every call.
  let tierIndex = 0;
  for (const t of a.tiers) {
    if (!meets(t)) break;
    tierIndex += 1;
  }

  const maxed = tierIndex >= tierCount;
  const activeTier = a.tiers[Math.max(tierIndex - 1, 0)];
  const nextTier = maxed ? null : a.tiers[tierIndex];

  return {
    id: a.id, mode: a.mode, icon: a.icon, tiers: a.tiers,
    tierIndex, tierCount, unlocked: tierIndex > 0, maxed,
    current, lowerIsBetter: !!a.lowerIsBetter,
    title: activeTier.title, description: activeTier.description, nextTier,
  };
}

/**
 * @param {Array} [sites] full protected-areas list, for the Site Collection
 *   family's per-category totals -- App.jsx's sites fetch is async, so this
 *   defaults to [] (computeCollectionStats([]) reads as 0/0 everywhere,
 *   same "not loaded yet" state StatsView.jsx's ring grid already handles).
 * @returns {Array<{
 *   id: string, mode: string, icon: string,
 *   tiers: Array<{target?: number, title: string, description: string}>,
 *   tierIndex: number, tierCount: number,
 *   unlocked: boolean, maxed: boolean,
 *   current: number|null, lowerIsBetter: boolean,
 *   title: string, description: string,
 *   nextTier: {target:number, title:string, description:string} | null,
 * }>}
 */
export function computeAchievements(sites = []) {
  const rawDaily = loadDailyStats();
  const daily = computeDailyStats(rawDaily);
  const rawClassic = loadNormalStats();
  const classic = computeClassicStats(rawClassic);
  const rawBlitz = loadBlitzStats();
  const blitz = computeBlitzStats(rawBlitz);
  const collection = computeCollectionStats(sites);

  const ctx = { rawDaily, daily, rawClassic, classic, rawBlitz, blitz, collection };

  return ACHIEVEMENTS.map((a) => evaluateAchievement(a, ctx));
}

/**
 * Diffs two computeAchievements() snapshots and returns the achievements
 * whose tierIndex went up between them -- covers both a fresh unlock
 * (0 -> 1) and leveling up an already-unlocked family (e.g. 2 -> 3) with
 * the same diff, so both get a toast. Used by useAchievementUnlocks.js to
 * detect a live in-session change (a "before" snapshot taken right before a
 * mode's recordXResult write, an "after" one right after) without any
 * separate "already seen" persistence: since achievements are re-derived
 * fresh every call, this is a pure array diff.
 *
 * @param {ReturnType<typeof computeAchievements>} before
 * @param {ReturnType<typeof computeAchievements>} after
 * @returns {ReturnType<typeof computeAchievements>}
 */
export function findNewlyUnlocked(before, after) {
  const beforeTier = new Map(before.map((a) => [a.id, a.tierIndex]));
  return after.filter((a) => a.tierIndex > (beforeTier.get(a.id) ?? 0));
}
