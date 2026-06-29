// src/hooks/useClassicRound.js
//
// Drives the round state machine for Classic mode, per spec Section 5:
//
//   LOADING   -> pick site -> READING
//   READING   -> player taps map -> PLACING
//   PLACING   -> [Confirm] -> REVEALING
//   REVEALING -> [Next Site] -> LOADING
//
// Daily mode is NOT handled here on purpose -- it adds a timer, 5-round
// progression, and a leaderboard POST on top of this same shape. Building
// those into a shared hook now would mean threading Daily-only concerns
// through Classic's simpler path. A `useDailyRound` hook can reuse
// `scoring.js`/`calcScore`/`applyHintPenalty` the same way this one does;
// only the bits in the "Daily adds" comment blocks below would differ.
//
// This hook owns no map state and no API calls -- it just produces the
// values <BottomCard> and <MapContainer> need, and exposes handlers for
// their events. Site pool filtering (category/region drawer, Decision #10)
// is the caller's job -- pass the already-filtered pool in.

import { useState, useEffect, useCallback } from 'react';
import { haversine, calcScore, applyHintPenalty } from '../game/scoring.js';

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
 * }}
 */
export function useClassicRound(sitePool) {
  const [roundState, setRoundState] = useState('LOADING');
  const [site, setSite] = useState(null);
  const [guess, setGuess] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [result, setResult] = useState(null);

  // LOADING -> pick a site -> READING. Re-runs whenever something puts us
  // back into LOADING (Next Site), or whenever the filtered pool changes
  // while we're already waiting on one (e.g. the drawer narrowed the pool
  // to empty and the player then re-enabled a category).
  useEffect(() => {
    if (roundState !== 'LOADING') return;
    if (!sitePool || sitePool.length === 0) return; // nothing to pick -- stay in LOADING

    const next = sitePool[Math.floor(Math.random() * sitePool.length)];
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
    // Classic: hints are free (Decision #1) -- no penalty bookkeeping needed
    // here. hintLevel still feeds BottomCard's "Hint 1: state name in pill"
    // display and is recorded in the result for stats, just never docked.
  }, [roundState]);

  const handleConfirm = useCallback(() => {
    if (roundState !== 'PLACING' || !guess || !site) return; // Confirm is disabled in the UI until both hold

    const distanceKm = haversine(guess.lat, guess.lng, site.centroid_lat, site.centroid_lng);
    const rawScore = calcScore(distanceKm);
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
  };
}
