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
// binary correct/wrong plus a session streak.
//
// BLITZ.TIMER_SECONDS countdown (new): mirrors useDailyRound.js's timer
// wiring (same useCountdownTimer hook, same start-on-entry/reset-on-
// LOADING/pause-on-REVEALING effect shape) with one difference -- Daily's
// `active` auto-pause deliberately does NOT auto-resume (it has a visible
// manual pause button as the resume affordance). Blitz has no pause button
// at all, so leaving a round frozen after a tab-away would strand the
// player with no way to un-freeze it; the effect below auto-resumes
// instead the moment `active` goes back to true. At 0 with no state
// selected yet, finalizeRound scores it same as an explicit wrong guess
// (guessedState stays null) and breaks the streak.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useCountdownTimer } from './useCountdownTimer.js';
import { BLITZ } from '../config.js';
import { hapticConfirm, hapticWrong } from '../utils/haptics.js';

/**
 * @param {import('../config').Site[]} sitePool - caller (BlitzMap.jsx) already
 *   applies the shared Category/Region+State filters before passing this in
 * @param {boolean} [active=true] - false while the Blitz tab isn't the
 *   active one (App.jsx keeps this mounted, display:none, on tab switch,
 *   same as Daily) -- pauses the countdown rather than letting it expire
 *   against a backgrounded round.
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
 *   timeRemaining: number,
 *   handleStateClick: (stateName: string|null) => void,
 *   handleConfirm: () => void,
 *   handleNextSite: () => void,
 *   handleSkip: () => void,
 * }}
 */
export function useBlitzRound(sitePool, active = true) {
  const [roundState, setRoundState] = useState('LOADING');
  const [site, setSite] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [result, setResult] = useState(null);

  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Plain-value mirrors, read inside the timer's onExpire closure instead
  // of a stale one -- same technique useDailyRound.js uses for its own
  // finalizeRound/timer wiring.
  const roundStateRef = useRef(roundState);
  const selectedStateRef = useRef(selectedState);
  const siteRef = useRef(site);
  roundStateRef.current = roundState;
  selectedStateRef.current = selectedState;
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

  // Single scoring path shared by Confirm and timer-expiry, same split
  // useDailyRound.js's finalizeRound uses -- a stray double-fire (Confirm
  // tapped the same tick the timer also expires) must not resolve one
  // round twice. `guessedState` is null on a timeout with nothing selected
  // yet, which site.state.includes() correctly treats as incorrect.
  const finalizeRound = useCallback((guessedState) => {
    if (roundStateRef.current !== 'READING' && roundStateRef.current !== 'SELECTING') return;

    const currentSite = siteRef.current;
    const isCorrect = guessedState != null && currentSite.state.includes(guessedState);
    isCorrect ? hapticConfirm() : hapticWrong();

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

  const timer = useCountdownTimer(BLITZ.TIMER_SECONDS, () => {
    finalizeRound(selectedStateRef.current);
  });

  // Starts the clock the moment a round goes live; resets when the next
  // round starts loading. Not reset on SELECTING -- picking a state doesn't
  // pause the timer, same as Daily's READING->PLACING. Paused on REVEALING
  // so an early Confirm freezes the displayed time instead of counting down
  // toward an already-scored round.
  useEffect(() => {
    if (roundState === 'READING') timer.start();
    if (roundState === 'LOADING') timer.reset();
    if (roundState === 'REVEALING') timer.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundState]);

  // Auto-pause/resume on tab visibility -- see header comment for why this
  // resumes automatically (unlike Daily's manual-pause-button equivalent).
  // Only touches the timer while a round is actually in progress; a
  // REVEALING/LOADING roundState already owns pause/reset above, so this
  // never fights that effect.
  useEffect(() => {
    if (roundStateRef.current !== 'READING' && roundStateRef.current !== 'SELECTING') return;
    if (active) timer.resume();
    else timer.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

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
    timeRemaining: timer.remaining,
    handleStateClick,
    handleConfirm,
    handleNextSite,
    handleSkip,
  };
}
