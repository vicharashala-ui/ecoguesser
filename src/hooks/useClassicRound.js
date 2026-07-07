// src/hooks/useClassicRound.js
//
// Drives the round state machine for Classic mode:
//
//   LOADING   -> pick site -> READING
//   READING   -> player taps map -> PLACING
//   PLACING   -> [Confirm] -> REVEALING
//   REVEALING -> [Next Site] -> LOADING
//
// Daily mode is NOT handled here on purpose -- it adds a timer, 5-round
// progression, and a leaderboard POST on top of this same shape. Building
// those into a shared hook now would mean threading Daily-only concerns
// through Classic's simpler path. useDailyRound reuses
// `scoring.js`/`calcScore`/`applyHintPenalty` the same way this one does;
// only the bits in the "Daily adds" comment blocks below differ.
//
// This hook owns no map state and no API calls -- it just produces the
// values <BottomCard> and <MapContainer> need, and exposes handlers for
// their events. Site pool filtering (category/region drawer) is the
// caller's job -- pass the already-filtered pool in.

import { useState, useEffect, useCallback, useRef } from 'react';
import { haversine, calcScore, applyHintPenalty, isPointInBoundary } from '../game/scoring.js';
import { fetchBoundary } from '../game/boundaryCache.js';
import { SCORING } from '../config.js';

const MAX_HINTS = 2;

/**
 * @param {import('../config').Site[]} sitePool - already filtered by the
 *   category/region drawer; an empty array is a valid "no sites match the
 *   current filters" state, not an error.
 * @returns {{
 *   roundState: 'LOADING'|'READING'|'PLACING'|'REVEALING',
 *   site: import('../config').Site|null,
 *   guess: {lat:number,lng:number}|null,
 *   markerPlaced: boolean,
 *   hintLevel: 0|1|2,
 *   result: import('../config').RoundResult|null,
 *   handleMapClick: (lat:number, lng:number) => void,
 *   handleHint: () => void,
 *   handleConfirm: () => void,
 *   handleNextSite: () => void,
 *   handleSkip: () => void,
 * }}
 */
export function useClassicRound(sitePool) {
  const [roundState, setRoundState] = useState('LOADING');
  const [site, setSite] = useState(null);
  const [guess, setGuess] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [result, setResult] = useState(null);

  // Boundary GeoJSON for the current site, prefetched the moment the site
  // loads (READING/PLACING give plenty of time before Confirm). A plain
  // ref, not state -- handleConfirm just reads whatever's landed so far;
  // if the fetch hasn't resolved yet it falls back to distance scoring
  // rather than blocking Confirm on a network request.
  const boundaryRef = useRef(null);

  // LOADING -> pick a site -> READING. Re-runs whenever something puts us
  // back into LOADING (Next Site), or whenever the filtered pool changes
  // while we're already waiting on one (e.g. the drawer narrowed the pool
  // to empty and the player then re-enabled a category).
  useEffect(() => {
    if (roundState !== 'LOADING') return;
    if (!sitePool || sitePool.length === 0) return; // nothing to pick -- stay in LOADING

    const next = sitePool[Math.floor(Math.random() * sitePool.length)];
    boundaryRef.current = null;
    fetchBoundary(next).then((geo) => { boundaryRef.current = geo; });
    setSite(next);
    setGuess(null);
    setHintLevel(0);
    setResult(null);
    setRoundState('READING');
  }, [roundState, sitePool]);

  const handleMapClick = useCallback((lat, lng) => {
    if (roundState !== 'READING' && roundState !== 'PLACING') return; // ignore taps post-Confirm
    setGuess({ lat, lng }); // re-tapping before Confirm moves the pin, doesn't re-trigger anything else
    setRoundState('PLACING');
  }, [roundState]);

  const handleHint = useCallback(() => {
    if (roundState !== 'READING' && roundState !== 'PLACING') return; // no hints after reveal
    setHintLevel((h) => Math.min(MAX_HINTS, h + 1));
    // Classic: hints are free -- no penalty bookkeeping needed
    // here. hintLevel still feeds BottomCard's "Hint 1: state name in pill"
    // display and is recorded in the result for stats, just never docked.
  }, [roundState]);

  const handleConfirm = useCallback(() => {
    if (roundState !== 'PLACING' || !guess || !site) return; // Confirm is disabled in the UI until both hold

    const distanceKm = haversine(guess.lat, guess.lng, site.centroid_lat, site.centroid_lng);
    const insideBoundary = isPointInBoundary(guess.lat, guess.lng, boundaryRef.current);
    const rawScore = insideBoundary ? SCORING.MAX_SCORE : calcScore(distanceKm);
    // Classic callers always pass hintsUsed=0 into applyHintPenalty per
    // scoring.js's own spec -- hintLevel is still recorded on the result
    // below for stats, it just never reduces finalScore in this mode.
    const finalScore = applyHintPenalty(rawScore, 0);

    setResult({
      site,
      guessLat: guess.lat,
      guessLng: guess.lng,
      distanceKm,
      rawScore,
      hintsUsed: hintLevel,
      hintPenalty: 0,
      finalScore,
      timedOut: false,
      skipped: false,
    });
    setRoundState('REVEALING');
  }, [roundState, guess, site, hintLevel]);

  const handleNextSite = useCallback(() => {
    setRoundState('LOADING');
  }, []);

  // Icon-only Skip in the guess panel lets the player abandon a site they
  // don't want to guess and get a new one -- Classic has no round limit, so
  // unlike Daily's Skip (which records a 0-score round to keep the fixed
  // 5-round progression moving) there's nothing to "give up on" here, just
  // a site to swap out. Mechanically identical to handleNextSite (both
  // re-enter LOADING) but kept as its own handler since skip-before-
  // guessing and move-on-after-reveal are semantically distinct actions to
  // the player. Guessing before Confirm never produces a `result`, so a
  // skipped site is never recorded by ClassicMap.jsx's stats-write effect.
  const handleSkip = useCallback(() => {
    if (roundState !== 'READING' && roundState !== 'PLACING') return; // nothing to skip once revealed
    setRoundState('LOADING');
  }, [roundState]);

  return {
    roundState,
    site,
    guess,
    markerPlaced: guess != null,
    hintLevel,
    result,
    handleMapClick,
    handleHint,
    handleConfirm,
    handleNextSite,
    handleSkip,
  };
}
