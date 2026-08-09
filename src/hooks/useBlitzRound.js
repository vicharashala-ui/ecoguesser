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
import { pickNextSite, pickNextSiteNoRepeat } from '../utils/filters.js';

/**
 * @param {import('../config').Site[]} sitePool - caller (BlitzMap.jsx) already
 *   applies the shared Category/Region+State filters before passing this in
 * @returns {{
 *   roundState: 'LOADING'|'READING'|'SELECTING'|'REVEALING'|'COMPLETE',
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
 *   handlePlayAgain: () => void,
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

  // No-repeat tracking for the current streak run. `correctIds` are sites
  // answered right this run -- done for good, never shown again. `wrongIds`
  // are sites answered wrong but restore-saved -- held for a retry pass
  // once every fresh site in the pool has been shown at least once. Both
  // are cleared together only when the streak actually breaks to 0; a
  // restore-saved miss keeps the run (and this tracking) alive, same as
  // the streak itself. While streak === 0, neither is consulted -- site
  // picking falls back to pickNextSite's plain previous-site exclusion.
  const [correctIds, setCorrectIds] = useState(() => new Set());
  const [wrongIds, setWrongIds] = useState(() => new Set());

  // Plain-value mirror finalizeRound reads to avoid a stale closure.
  const roundStateRef = useRef(roundState);
  const siteRef = useRef(site);
  const streakRef = useRef(streak);
  const bestStreakRef = useRef(bestStreak);
  const streakRestoresRef = useRef(streakRestores);
  const correctIdsRef = useRef(correctIds);
  const wrongIdsRef = useRef(wrongIds);
  roundStateRef.current = roundState;
  siteRef.current = site;
  streakRef.current = streak;
  bestStreakRef.current = bestStreak;
  streakRestoresRef.current = streakRestores;
  correctIdsRef.current = correctIds;
  wrongIdsRef.current = wrongIds;

  // LOADING -> pick a site -> READING. Stays in LOADING if the pool is
  // empty (filters left nothing to play) -- BlitzMap.jsx's own empty-pool
  // message covers the UI side, same guard shape useClassicRound.js needs.
  //
  // streak === 0: no active run to track -- plain pickNextSite, same as
  // always. streak > 0: draw from whatever hasn't been shown yet this run
  // (unseen pool), following the same category round-robin but skipping
  // categories that have run out of unseen sites rather than abandoning
  // the rotation. Once nothing is unseen, fall back to a retry pass over
  // `wrongIds` (still no-repeat, still round-robin). Once that's empty too,
  // every site in the pool has been correctly identified this run --
  // there's nothing left to load, so this ends the run at COMPLETE instead
  // of picking.
  useEffect(() => {
    if (roundState !== 'LOADING') return;
    if (!sitePool || sitePool.length === 0) return;

    let next;
    if (streak === 0) {
      next = pickNextSite(sitePool, site);
    } else {
      const unseen = sitePool.filter((s) => !correctIds.has(s.id) && !wrongIds.has(s.id));
      if (unseen.length > 0) {
        next = pickNextSiteNoRepeat(unseen, site);
      } else if (wrongIds.size > 0) {
        const retryPool = sitePool.filter((s) => wrongIds.has(s.id));
        next = pickNextSiteNoRepeat(retryPool, site);
      } else {
        setRoundState('COMPLETE');
        return;
      }
    }

    setSite(next);
    setSelectedState(null);
    setResult(null);
    setRoundState('READING');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `site`,
    // `streak`, `correctIds`, `wrongIds` are read for this round's pick,
    // not as retriggers: they're each the current run's state at the
    // moment LOADING starts, already settled by the same render that got
    // us here.
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

      // Done for good this run -- redeemed out of the retry pool if it was
      // pending one.
      setCorrectIds(new Set(correctIdsRef.current).add(currentSite.id));
      if (wrongIdsRef.current.has(currentSite.id)) {
        const redeemedWrongIds = new Set(wrongIdsRef.current);
        redeemedWrongIds.delete(currentSite.id);
        setWrongIds(redeemedWrongIds);
      }
    } else {
      // A wrong guess with a live streak spends a restore automatically if
      // one's in reserve -- no prompt, silent like earning one is.
      const streakSaved = prevStreak > 0 && prevRestores > 0;
      nextStreak = streakSaved ? prevStreak : 0;
      if (streakSaved) {
        nextRestores = prevRestores - 1;
        setWrongIds(new Set(wrongIdsRef.current).add(currentSite.id));
      } else {
        // Real break -- the whole run's no-repeat tracking starts over.
        setCorrectIds(new Set());
        setWrongIds(new Set());
      }
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

  // Mirrors useClassicRound.js's handleSkip for the guard/re-enter-LOADING
  // mechanism, but Blitz additionally carries a streak: skipping is treated
  // exactly like a wrong guess for streak/restore purposes (same branch as
  // finalizeRound's isCorrect=false case) so a skip can't be used to dodge
  // a hard site without cost. A restore in reserve saves the streak and is
  // spent (1 per skip); otherwise the streak breaks to 0. Both setters go
  // through the same state the streak-card/restore-badge animations in
  // BlitzMap.jsx already watch, so 'break'/'used' fire automatically.
  const handleSkip = useCallback(() => {
    if (roundState !== 'READING' && roundState !== 'SELECTING') return; // nothing to skip once revealed

    const prevStreak = streakRef.current;
    const prevRestores = streakRestoresRef.current;
    const streakSaved = prevStreak > 0 && prevRestores > 0;
    const currentSite = siteRef.current;

    setStreak(streakSaved ? prevStreak : 0);
    if (streakSaved) {
      setStreakRestores(prevRestores - 1);
      // Same no-repeat bookkeeping as a wrong guess -- treated identically.
      if (currentSite) setWrongIds(new Set(wrongIdsRef.current).add(currentSite.id));
    } else {
      setCorrectIds(new Set());
      setWrongIds(new Set());
    }

    setRoundState('LOADING');
  }, [roundState]);

  // Only reachable from COMPLETE (BlitzMap.jsx's "Play Again" button) --
  // starts a fresh run. bestStreak/streakRestores are left as-is, same as
  // an ordinary streak break: bestStreak is a permanent high-water mark,
  // and any leftover restores are an earned bonus carried into the new run.
  const handlePlayAgain = useCallback(() => {
    setStreak(0);
    setCorrectIds(new Set());
    setWrongIds(new Set());
    setRoundState('LOADING');
  }, []);

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
    handlePlayAgain,
  };
}
