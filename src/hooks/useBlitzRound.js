// src/hooks/useBlitzRound.js
//
// Drives the round state machine for Blitz mode:
//
//   LOADING   -> pick site                    -> READING
//   READING   -> player taps a state polygon  -> SELECTING
//   SELECTING -> player taps a different state -> SELECTING (re-select)
//   SELECTING -> [Confirm]                    -> REVEALING
//   REVEALING -> [Next Site]                  -> LOADING
//
// Mirrors useClassicRound.js's shape and guard style -- same
// roundState-driven useEffect for site-picking, same "ignore taps outside
// READING/SELECTING" guard idiom. No scoring.js -- this mode is purely
// binary correct/wrong plus a session streak. Untimed -- no round timer.

import { useState, useEffect, useCallback, useRef } from 'react';
import { hapticConfirm, hapticWrong } from '../utils/haptics.js';
import { soundConfirm, soundWrong } from '../utils/sound.js';

/**
 * @param {import('../config').Site[]} sitePool - caller (BlitzMap.jsx) already
 *   applies the shared Category/Region+State filters before passing this in
 * @returns {{
 *   roundState: 'LOADING'|'READING'|'SELECTING'|'REVEALING',
 *   site: import('../config').Site|null,
 *   selectedState: string|null,
 *   result: {
 *     site: import('../config').Site,
 *     guessedState: string|null,
 *     correctStates: string[],
 *     isCorrect: boolean,
 *   }|null,
 *   streak: number,
 *   bestStreak: number,
 *   handleStateClick: (stateName: string|null) => void,
 *   handleConfirm: () => void,
 *   handleNextSite: () => void,
 *   handleSkip: () => void,
 * }}
 */
export function useBlitzRound(sitePool) {
  const [roundState, setRoundState] = useState('LOADING');
  const [site, setSite] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [result, setResult] = useState(null);

  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Plain-value mirror finalizeRound reads to avoid a stale closure.
  const roundStateRef = useRef(roundState);
  const siteRef = useRef(site);
  roundStateRef.current = roundState;
  siteRef.current = site;

  // LOADING -> pick a site -> READING. Stays in LOADING if the pool is
  // empty (filters left nothing to play) -- BlitzMap.jsx's own empty-pool
  // message covers the UI side, same guard shape useClassicRound.js needs.
  useEffect(() => {
    if (roundState !== 'LOADING') return;
    if (!sitePool || sitePool.length === 0) return;

    const next = sitePool[Math.floor(Math.random() * sitePool.length)];
    setSite(next);
    setSelectedState(null);
    setResult(null);
    setRoundState('READING');
  }, [roundState, sitePool]);

  // Single scoring path used by Confirm. `guessedState` is only ever a
  // real state name here (Confirm is disabled until one is picked), but
  // finalizeRound still tolerates null so a defensive/future caller can't
  // crash it.
  const finalizeRound = useCallback((guessedState) => {
    if (roundStateRef.current !== 'READING' && roundStateRef.current !== 'SELECTING') return;

    const currentSite = siteRef.current;
    const isCorrect = guessedState != null && currentSite.state.includes(guessedState);
    isCorrect ? hapticConfirm() : hapticWrong();
    isCorrect ? soundConfirm() : soundWrong();

    setResult({
      site: currentSite,
      guessedState,
      correctStates: currentSite.state,
      isCorrect,
    });

    setStreak((s) => {
      if (!isCorrect) return 0;
      const next = s + 1;
      setBestStreak((best) => Math.max(best, next));
      return next;
    });

    setRoundState('REVEALING');
  }, []);

  // A click outside all state polygons resolves to stateName === null --
  // silent no-op, not an error.
  const handleStateClick = useCallback((stateName) => {
    if (roundState !== 'READING' && roundState !== 'SELECTING') return;
    if (!stateName) return;
    setSelectedState(stateName); // re-tapping before Confirm just overwrites this
    setRoundState('SELECTING');
  }, [roundState]);

  const handleConfirm = useCallback(() => {
    if (roundState !== 'SELECTING' || !selectedState || !site) return; // defense-in-depth; UI already disables Confirm
    finalizeRound(selectedState);
  }, [roundState, selectedState, site, finalizeRound]);

  const handleNextSite = useCallback(() => {
    setRoundState('LOADING');
  }, []);

  // Mirrors useClassicRound.js's handleSkip -- same guard, same "re-enter
  // LOADING" mechanism the effect above already resolves into a fresh site.
  const handleSkip = useCallback(() => {
    if (roundState !== 'READING' && roundState !== 'SELECTING') return; // nothing to skip once revealed
    setRoundState('LOADING');
  }, [roundState]);

  return {
    roundState,
    site,
    selectedState,
    result,
    streak,
    bestStreak,
    handleStateClick,
    handleConfirm,
    handleNextSite,
    handleSkip,
  };
}
