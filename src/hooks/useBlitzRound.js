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
import { pickNextSite } from '../utils/filters.js';

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
 *   streakRestores: number,
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
  // Earned every 10th streak milestone (10, 20, 30...), spent elsewhere to
  // save a live streak from breaking on a wrong guess. Session-only, same
  // as streak/bestStreak -- not yet persisted across app restarts.
  const [streakRestores, setStreakRestores] = useState(0);

  // Plain-value mirror finalizeRound reads to avoid a stale closure.
  const roundStateRef = useRef(roundState);
  const siteRef = useRef(site);
  const streakRef = useRef(streak);
  const bestStreakRef = useRef(bestStreak);
  const streakRestoresRef = useRef(streakRestores);
  roundStateRef.current = roundState;
  siteRef.current = site;
  streakRef.current = streak;
  bestStreakRef.current = bestStreak;
  streakRestoresRef.current = streakRestores;

  // LOADING -> pick a site -> READING. Stays in LOADING if the pool is
  // empty (filters left nothing to play) -- BlitzMap.jsx's own empty-pool
  // message covers the UI side, same guard shape useClassicRound.js needs.
  useEffect(() => {
    if (roundState !== 'LOADING') return;
    if (!sitePool || sitePool.length === 0) return;

    const next = pickNextSite(sitePool, site);
    setSite(next);
    setSelectedState(null);
    setResult(null);
    setRoundState('READING');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `site` is read
    // for pickNextSite's round-robin/exclusion, not as a retrigger: it's
    // the previous round's value at the moment LOADING starts.
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

    // Everything below is computed from refs (current values, not stale
    // closures) and each setter is called once with a plain value -- not a
    // functional updater. That matters here specifically: React 18
    // StrictMode double-invokes updater *functions* passed to setState in
    // dev, to catch impure ones. The previous version nested
    // setBestStreak/setStreakRestores calls inside setStreak's own updater;
    // StrictMode's double-invoke then fired those nested calls twice too,
    // silently minting 2 restores per 10-streak milestone instead of 1
    // (Math.max happened to make the bestStreak version of this bug
    // invisible -- calling it twice with the same inputs is harmless,
    // r => r + 1 isn't). Plain-value setState calls don't have an updater
    // function to double-invoke, so this sidesteps the problem entirely.
    const prevStreak = streakRef.current;
    const prevBest = bestStreakRef.current;
    const prevRestores = streakRestoresRef.current;

    let nextStreak;
    let nextRestores = prevRestores;
    if (isCorrect) {
      nextStreak = prevStreak + 1;
      if (nextStreak % 10 === 0) nextRestores = prevRestores + 1;
    } else {
      // A wrong guess with a live streak spends a restore automatically if
      // one's in reserve -- no prompt, silent like earning one is.
      const streakSaved = prevStreak > 0 && prevRestores > 0;
      nextStreak = streakSaved ? prevStreak : 0;
      if (streakSaved) nextRestores = prevRestores - 1;
    }

    setStreak(nextStreak);
    setBestStreak(Math.max(prevBest, nextStreak));
    setStreakRestores(nextRestores);
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
    streakRestores,
    handleStateClick,
    handleConfirm,
    handleNextSite,
    handleSkip,
  };
}
