// src/hooks/useDailyRound.js
// Daily Challenge round state machine: LOADING -> READING -> PLACING ->
// REVEALING -> LOADING, x5 fixed categories. Mirrors useClassicRound's
// contract and division of labour -- owns no map state and no API calls,
// just { roundState, site, guess, ... } + handlers. The screen-level Daily
// component wires resultLayer.js/stateHighlight.js off this hook's state
// (same two-useEffect pattern as ClassicMap.jsx) and routes to
// DAILY_SUMMARY once `isComplete` flips true.
//
// One extra state: round 1's first LOADING->READING handoff detours
// through NOT_STARTED instead -- the timer must not start and the guess
// panel must not appear until the player explicitly presses Start
// (handleStart). Rounds 2-5 skip this detour (hasStartedRef latches true
// on the first handleStart call).
//
// Daily-only concerns Classic doesn't have:
//   - 2-min countdown per round, auto-submit at 0 with whatever marker
//     exists (or 0 pts if none was placed), distinguished via `timedOut`.
//   - Hints cost -500/each (`SCORING.HINT_PENALTY`), unlike Classic's free hints.
//   - Fixed 5-round progression across DAILY.CATEGORIES, not infinite/random.

import { useState, useCallback, useEffect, useRef } from 'react';
import { getTodayString, getDailySites } from '../game/daily.js';
import { haversine, calcScore, applyHintPenalty, isPointInBoundary, distanceToBoundary } from '../game/scoring.js';
import { fetchBoundary } from '../game/boundaryCache.js';
import { useCountdownTimer } from './useCountdownTimer.js';
import { DAILY, SCORING } from '../config.js';
import { hapticConfirm, hapticPerfect, hapticWrong } from '../utils/haptics.js';
import { soundConfirm, soundPerfect, soundWrong } from '../utils/sound.js';

const TOTAL_ROUNDS = DAILY.CATEGORIES.length; // 5

export function useDailyRound(allSites, dailySites, active = true) {
  const [sites, setSites] = useState(null); // Site[5], null until allSites is ready
  const [roundIndex, setRoundIndex] = useState(0);
  const [roundState, setRoundState] = useState('LOADING');
  const [guess, setGuess] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [result, setResult] = useState(null);
  const [results, setResults] = useState([]); // finalized RoundResult[], grows to length 5
  const [paused, setPaused] = useState(false); // player-facing pause, READING/PLACING only

  // Plain-value mirrors of state, read inside callbacks/timer-expiry instead
  // of stale closures (same technique used in useMapState and useClassicRound).
  const roundStateRef = useRef(roundState);
  const guessRef = useRef(guess);
  const hintLevelRef = useRef(hintLevel);
  const pausedRef = useRef(paused);
  const siteRef = useRef(null);
  roundStateRef.current = roundState;
  guessRef.current = guess;
  hintLevelRef.current = hintLevel;
  pausedRef.current = paused;

  // Today's 5 sites: prefer /api/daily-manifest's precomputed result (it
  // usually arrives well before the full catalog does), falling back to
  // computing from allSites once that arrives. Same getDailySites()
  // algorithm either way -- the manifest just runs it server-side against
  // the same data, so the two paths always agree. `if (sites) return`
  // guards against dailySites arriving late and resetting an
  // already-computed/in-progress round.
  useEffect(() => {
    if (sites) return;
    if (dailySites) { setSites(dailySites); return; }
    if (allSites && allSites.length) setSites(getDailySites(getTodayString(), allSites));
  }, [allSites, dailySites, sites]);

  const site = sites ? sites[roundIndex] : null;
  siteRef.current = site;

  // Boundary GeoJSON for the current site, prefetched as soon as the round
  // has a site (same best-effort ref pattern as useClassicRound -- READING
  // gives plenty of time before Confirm/timeout; if it hasn't landed yet,
  // finalizeRound just falls back to distance scoring).
  const boundaryRef = useRef(null);
  useEffect(() => {
    boundaryRef.current = null;
    if (site) fetchBoundary(site).then((geo) => { boundaryRef.current = geo; });
  }, [site]);

  // Round 1 only: the LOADING->READING handoff is gated behind an explicit
  // Start press (handleStart below) rather than firing automatically the
  // moment `site` resolves -- the timer must not start and the guess panel
  // must not appear until the player presses Start. hasStartedRef (not
  // state) only needs to be read inside the handoff effect, never
  // rendered; once true it stays true for the rest of this mount (rounds
  // 2-5 skip the gate).
  const hasStartedRef = useRef(false);

  // LOADING -> NOT_STARTED (round 1, first time) or READING (every other
  // case) once this round's site exists. (Classic's equivalent transition
  // is driven by its own pickRandom call inside handleNextSite; Daily's
  // sites are precomputed, so the handoff just waits for `site` to resolve
  // from the `sites` array.)
  useEffect(() => {
    if (site && roundState === 'LOADING') {
      setRoundState(hasStartedRef.current ? 'READING' : 'NOT_STARTED');
    }
  }, [site, roundState]);

  const handleStart = useCallback(() => {
    if (roundStateRef.current !== 'NOT_STARTED') return;
    hasStartedRef.current = true;
    setRoundState('READING');
  }, []);

  // Single scoring path shared by Confirm and timer-expiry so the two entry
  // points can never disagree about how a round's RoundResult is built.
  // `skipped` stays on the result shape for stats.js/DailyRecap compatibility
  // but is always false now -- Skip was removed from Daily.
  const finalizeRound = useCallback((finalGuess, { timedOut = false } = {}) => {
    // Defensive idempotency guard: a stray double-fire (e.g. Confirm clicked
    // in the same tick the timer's interval also expires) must not push two
    // results for one round.
    if (roundStateRef.current !== 'READING' && roundStateRef.current !== 'PLACING') return;

    const currentSite = siteRef.current;
    const hintsUsed = hintLevelRef.current;
    // distanceToBoundary returns null when boundaryRef.current is missing (2
    // hasBoundary:false sites) or hasn't resolved yet -- same fallback to
    // centroid haversine fetchBoundary's own callers already rely on.
    const boundaryDist = finalGuess
      ? distanceToBoundary(finalGuess.lat, finalGuess.lng, boundaryRef.current)
      : null;
    const distanceKm = finalGuess
      ? (boundaryDist
          ? boundaryDist.distanceKm
          : haversine(finalGuess.lat, finalGuess.lng, currentSite.centroid_lat, currentSite.centroid_lng))
      : null; // calcScore's null guard turns this into 0, not 5000
    const insideBoundary =
      finalGuess != null && isPointInBoundary(finalGuess.lat, finalGuess.lng, boundaryRef.current);

    const rawScore = insideBoundary ? SCORING.MAX_SCORE : calcScore(distanceKm);
    const finalScore = applyHintPenalty(rawScore, hintsUsed);
    if (insideBoundary) { hapticPerfect(); soundPerfect(); }
    else if (timedOut) { hapticWrong(); soundWrong(); }
    else { hapticConfirm(); soundConfirm(); }

    const roundResult = {
      site: currentSite,
      guessLat: finalGuess?.lat ?? null,
      guessLng: finalGuess?.lng ?? null,
      distanceKm,
      // Null when boundaryDist is null (missing/unresolved boundary or no
      // guess placed) -- resultLayer.js falls back to site.centroid for the
      // reveal line in that case.
      nearestLng: boundaryDist?.nearestLng ?? null,
      nearestLat: boundaryDist?.nearestLat ?? null,
      rawScore,
      hintsUsed,
      hintPenalty: hintsUsed * SCORING.HINT_PENALTY,
      finalScore,
      timedOut,
      skipped: false,
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
  // marker doesn't pause the timer, it keeps running through
  // READING->PLACING. Paused on REVEALING so an early Confirm/Skip freezes
  // the displayed time instead of letting it keep counting down toward an
  // already-scored round (timer.pause() is a no-op if onExpire already
  // cleared the interval, e.g. a true timeout).
  useEffect(() => {
    if (roundState === 'READING') timer.start();
    if (roundState === 'LOADING') { timer.reset(); setPaused(false); }
    if (roundState === 'REVEALING') { timer.pause(); setPaused(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundState]);

  const handleMapClick = useCallback((lat, lng) => {
    // Reads roundState as a plain ref with an early return, rather than
    // nesting this check inside setRoundState's updater (React 18 Strict
    // Mode double-invokes updaters in dev; a nested setGuess side effect
    // would fire twice).
    if (roundStateRef.current !== 'READING' && roundStateRef.current !== 'PLACING') return;
    if (pausedRef.current) return; // pause button blocks marker placement too
    setGuess({ lat, lng });
    setRoundState('PLACING');
  }, []);

  // Player-facing pause/resume, only meaningful while the clock is actually
  // running (READING/PLACING) -- DailyMap.jsx hides the button otherwise.
  const handlePauseToggle = useCallback(() => {
    if (roundStateRef.current !== 'READING' && roundStateRef.current !== 'PLACING') return;
    setPaused((wasPaused) => {
      if (wasPaused) timer.resume();
      else timer.pause();
      return !wasPaused;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-pause on navigating away to another in-app tab mid-round -- the
  // round just freezes and waits, same site/progress intact (DailyMap
  // stays mounted, display:none), and the player resumes manually via
  // handlePauseToggle when they come back. Doesn't auto-resume on return --
  // that's a deliberate player action, not automatic.
  useEffect(() => {
    if (!active && !pausedRef.current && (roundStateRef.current === 'READING' || roundStateRef.current === 'PLACING')) {
      setPaused(true);
      timer.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const handleHint = useCallback(() => {
    if (roundStateRef.current !== 'READING' && roundStateRef.current !== 'PLACING') return;
    if (hintLevelRef.current >= 2) return;
    setHintLevel((h) => Math.min(2, h + 1)); // top-level call, not nested -- see handleMapClick comment
  }, []);

  const handleConfirm = useCallback(() => {
    if (!guessRef.current) return; // Confirm Guess is greyed out until markerPlaced; belt-and-suspenders here
    finalizeRound(guessRef.current, {});
  }, [finalizeRound]);

  // Advances to the next round. The caller (screen-level component) must
  // NOT call this on the final round -- check `isLastRound` first and
  // route to DAILY_SUMMARY instead. This hook deliberately has no opinion
  // about screen routing, same boundary useClassicRound keeps around map
  // state/API.
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
    paused,
    handleMapClick,
    handleHint,
    handleConfirm,
    handleNextSite,
    handleStart,
    handlePauseToggle,
  };
}
