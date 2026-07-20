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
  const streakRestoresRef = useRef(streakRestores);
  roundStateRef.current = roundState;
  siteRef.current = site;
  streakRef.current = streak;
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

    // A wrong guess with a live streak spends a restore automatically if
    // one's in reserve -- no prompt, silent like earning one is. Read via
    // refs (not the isCorrect-branch's own setStreak updater) because this
    // decision needs streak AND streakRestores together at the same
    // instant; two separate functional updaters can't be read against each
    // other mid-update the way these refs can.
    const streakSaved = !isCorrect && streakRef.current > 0 && streakRestoresRef.current > 0;

    setStreak((s) => {
      if (isCorrect) {
        const next = s + 1;
        setBestStreak((best) => Math.max(best, next));
        if (next % 10 === 0) setStreakRestores((r) => r + 1);
        return next;
      }
      return streakSaved ? s : 0;
    });
    if (streakSaved) setStreakRestores((r) => r - 1);

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
