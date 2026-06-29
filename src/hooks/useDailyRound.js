// src/hooks/useDailyRound.js
//
// Daily Challenge round state machine (Section 5: LOADING -> READING -> PLACING
// -> REVEALING -> LOADING, x5 fixed categories). Mirrors useClassicRound's
// contract and division of labour -- owns no map state and no API calls, just
// { roundState, site, guess, ... } + handlers. The screen-level Daily component
// is responsible for mounting DailyMap, wiring resultLayer.js/stateHighlight.js
// off this hook's state (same two-useEffect pattern as ClassicMap.jsx), and
// routing to DAILY_SUMMARY once `isComplete` flips true.
//
// Daily-only concerns Classic deliberately doesn't have, per Section 5 /
// Decision #2 (Game Modes):
//   - 2-min countdown per round, auto-submit at 0 with whatever marker exists
//     (or 0 pts if none was placed -- "null = skip, 0 pts" in spec language,
//     but distinguished here via `timedOut` so it's never confused with an
//     explicit Skip click in stats/analytics later).
//   - Explicit Skip button -- always 0 pts, discards any placed marker.
//   - Hints cost -500/each (`SCORING.HINT_PENALTY`), unlike Classic's free hints.
//   - Fixed 5-round progression across DAILY.CATEGORIES, not infinite/random.

import { useState, useCallback, useEffect, useRef } from 'react';
import { getTodayString, getDailySites } from '../game/daily.js';
import { haversine, calcScore, applyHintPenalty } from '../game/scoring.js';
import { useCountdownTimer } from './useCountdownTimer.js';
import { DAILY, SCORING } from '../config.js';

const TOTAL_ROUNDS = DAILY.CATEGORIES.length; // 5

export function useDailyRound(allSites) {
  const [sites, setSites] = useState(null); // Site[5], null until allSites is ready
  const [roundIndex, setRoundIndex] = useState(0);
  const [roundState, setRoundState] = useState('LOADING');
  const [guess, setGuess] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [result, setResult] = useState(null);
  const [results, setResults] = useState([]); // finalized RoundResult[], grows to length 5

  // Plain-value mirrors of state, read inside callbacks/timer-expiry instead of
  // stale closures -- same technique as useMapState's politicalRef/mapReadyRef,
  // and the same fix useClassicRound needed for handleMapClick/handleHint.
  const roundStateRef = useRef(roundState);
  const guessRef = useRef(guess);
  const hintLevelRef = useRef(hintLevel);
  const siteRef = useRef(null);
  roundStateRef.current = roundState;
  guessRef.current = guess;
  hintLevelRef.current = hintLevel;

  // Today's 5 sites are computed once, as soon as the site pool is available.
  useEffect(() => {
    if (allSites && allSites.length && !sites) {
      setSites(getDailySites(getTodayString(), allSites));
    }
  }, [allSites, sites]);

  const site = sites ? sites[roundIndex] : null;
  siteRef.current = site;

  // LOADING -> READING handoff once this round's site exists. (Classic's
  // equivalent transition is driven by its own pickRandom call inside
  // handleNextSite; Daily's sites are precomputed, so the handoff just
  // waits for `site` to resolve from the `sites` array.)
  useEffect(() => {
    if (site && roundState === 'LOADING') {
      setRoundState('READING');
    }
  }, [site, roundState]);

  // Single scoring path shared by Confirm, Skip, and timer-expiry so the three
  // entry points can never disagree about how a round's RoundResult is built.
  const finalizeRound = useCallback((finalGuess, { timedOut = false, skipped = false } = {}) => {
    // Defensive idempotency guard: a stray double-fire (e.g. Confirm clicked
    // in the same tick the timer's interval also expires) must not push two
    // results for one round.
    if (roundStateRef.current !== 'READING' && roundStateRef.current !== 'PLACING') return;

    const currentSite = siteRef.current;
    const hintsUsed = hintLevelRef.current;
    const distanceKm = finalGuess
      ? haversine(finalGuess.lat, finalGuess.lng, currentSite.centroid_lat, currentSite.centroid_lng)
      : null; // calcScore's null guard turns this into 0, not 5000

    const rawScore = skipped ? 0 : calcScore(distanceKm);
    const finalScore = skipped ? 0 : applyHintPenalty(rawScore, hintsUsed);

    const roundResult = {
      site: currentSite,
      guessLat: finalGuess?.lat ?? null,
      guessLng: finalGuess?.lng ?? null,
      distanceKm,
      rawScore,
      hintsUsed,
      hintPenalty: hintsUsed * SCORING.HINT_PENALTY,
      finalScore,
      timedOut,
      skipped,
    };

    setResult(roundResult);
    setResults((prev) => [...prev, roundResult]);
    setRoundState('REVEALING');
  }, []);

  // useCountdownTimer holds onExpire in its own ref internally, so a fresh
  // arrow function on every render is safe -- it won't tear down the live
  // interval (see useCountdownTimer's spec note).
  const timer = useCountdownTimer(DAILY.TIMER_SECONDS, () => {
    // Spec: "At 0: fire CONFIRM with current marker position or null
    // (null = skip, 0 pts)." Whatever's in guessRef right now -- placed or
    // not -- is what gets scored; timedOut:true is what distinguishes this
    // from an explicit Skip click downstream (e.g. in stats).
    finalizeRound(guessRef.current, { timedOut: true });
  });

  // Start the clock the moment a round goes live; reset it when the next
  // round starts loading. Intentionally NOT reset on PLACING -- placing a
  // marker doesn't pause the timer (Decision #6/#2: 2-min countdown, runs
  // through READING->PLACING per Section 5).
  useEffect(() => {
    if (roundState === 'READING') timer.start();
    if (roundState === 'LOADING') timer.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundState]);

  const handleMapClick = useCallback((lat, lng) => {
    // Same guard pattern as useClassicRound's v8.16 fix: read roundState as a
    // plain ref value with an early return, rather than nesting this check
    // inside setRoundState's updater (React 18 Strict Mode double-invokes
    // updaters in dev; a nested setGuess side effect would fire twice).
    if (roundStateRef.current !== 'READING' && roundStateRef.current !== 'PLACING') return;
    setGuess({ lat, lng });
    setRoundState('PLACING');
  }, []);

  const handleHint = useCallback(() => {
    if (roundStateRef.current !== 'READING' && roundStateRef.current !== 'PLACING') return;
    if (hintLevelRef.current >= 2) return;
    setHintLevel((h) => Math.min(2, h + 1)); // top-level call, not nested -- see handleMapClick comment
  }, []);

  const handleConfirm = useCallback(() => {
    if (!guessRef.current) return; // Confirm Guess is greyed out until markerPlaced (Decision #8); belt-and-suspenders here
    finalizeRound(guessRef.current, {});
  }, [finalizeRound]);

  const handleSkip = useCallback(() => {
    // Skip always discards any placed marker -- 0 pts regardless of where it was.
    finalizeRound(null, { skipped: true });
  }, [finalizeRound]);

  // Advances to the next round. The caller (screen-level component) must NOT
  // call this on the final round -- check `isLastRound` first and route to
  // DAILY_SUMMARY instead (Section 4: round 5's [Next] goes to DAILY_SUMMARY,
  // not back through LOADING). This hook deliberately has no opinion about
  // screen routing, same boundary useClassicRound keeps around map state/API.
  const handleNextSite = useCallback(() => {
    if (roundStateRef.current !== 'REVEALING') return;
    if (roundIndex >= TOTAL_ROUNDS - 1) return;
    setGuess(null);
    setHintLevel(0);
    setResult(null);
    setRoundIndex((i) => i + 1);
    setRoundState('LOADING');
  }, [roundIndex]);

  const isLastRound = roundIndex === TOTAL_ROUNDS - 1;
  const isComplete = isLastRound && roundState === 'REVEALING' && results.length === TOTAL_ROUNDS;

  return {
    roundState,
    roundIndex,
    totalRounds: TOTAL_ROUNDS,
    isLastRound,
    isComplete,
    site,
    guess,
    markerPlaced: guess !== null,
    hintLevel,
    result,
    results, // pass to DAILY_SUMMARY for total_pts/total_dist + the /api/score POST body
    timeRemaining: timer.remaining,
    handleMapClick,
    handleHint,
    handleConfirm,
    handleSkip,
    handleNextSite,
  };
}
