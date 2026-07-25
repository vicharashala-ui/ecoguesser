// src/components/DailySummary.jsx
// DAILY_SUMMARY -- the score screen between the 5th round's REVEALING and
// LEADERBOARD:
//   1. (done by the caller) App.jsx's handleDailyComplete already called
//      recordDailyResult before this component mounts -- that write must
//      happen exactly once per real completion, not once per mount of
//      this screen, so it doesn't live here.
//   2. Name prompt modal if LS_KEYS.NAME is empty.
//   3. POST /api/score, spinner shown throughout.
//   4. All outcomes (200 / 409 / network error) resolve into `pendingResult`
//      and phase 'ready' -- the score, the day's 5 sites with distance, and
//      a "See Leaderboard" button. onDone() (-> LEADERBOARD) only fires when
//      the player taps that button, not automatically.
//
// Known gap: unmounts if the player switches tabs mid-submit (App.jsx only
// renders it while activeTab==='daily'). The in-flight POST/GET still
// completes, but onDone's result is dropped since nothing is listening --
// reopening the Daily tab just re-runs this flow from scratch
// (recordDailyResult's idempotency guard makes that safe, just wasteful).
// Fix would require App.jsx to own the fetch outside this component's
// lifecycle, the same "always mounted" treatment DailyMap gets.

import { useState, useEffect, useCallback } from 'react';
import NamePromptModal from './NamePromptModal.jsx';
import BrandSpinner from './BrandSpinner.jsx';
import { LS_KEYS, SCORING, DAILY, CATEGORY_META, formatSiteName } from '../config.js';
import { getTodayString } from '../game/daily.js';
import { postScore, getLeaderboard } from '../game/api.js';
import { getSkipPlayerName } from '../game/playerName.js';
import './DailySummary.css';

const DAILY_MAX_TOTAL = SCORING.MAX_SCORE * DAILY.CATEGORIES.length; // 25,000 -- same derivation as BottomCard.jsx

// Mechanical-odometer digit roll: each digit is a vertical strip of 0-9 that
// transform-translates from '0' to its target value on mount, so the
// intermediate digits visibly scroll past. Leftward (more significant)
// digits get a longer duration, mimicking the cascading carry of a real
// mechanical odometer. Skips straight to the final digits under
// prefers-reduced-motion. Inlined here since this is its only user.
//
// Only mounted once phase 'ready' actually renders (see the JSX below) --
// mounting it at component load instead let the whole roll play out during
// the submitting/name-prompt phases, finished by the time the player's
// focus ever reached this screen. startDelay then waits for the ready
// phase's own site-list/button entrance (staggered up to 560ms) to land
// before the roll starts, so it isn't fighting for attention with them.
function OdometerScore({ value, duration = 1200, staggerMs = 140, startDelay = 0 }) {
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const formatted = value.toLocaleString();
  const digitCount = formatted.replace(/\D/g, '').length;

  const [settled, setSettled] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) return;
    // Wait for the container's own landing animation (startDelay) before
    // starting the roll -- rolling digits while the page itself is still
    // fading/scaling in reads as two competing motions. Then double rAF:
    // a single rAF can fire before the browser has actually painted the
    // zeroed digits, so the transition never gets a "from" state to
    // interpolate from and the roll is invisible -- it just appears
    // already-settled. Waiting a second frame guarantees that first paint
    // has happened.
    let raf1;
    let raf2;
    const timer = setTimeout(() => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setSettled(true));
      });
    }, startDelay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [reduceMotion, startDelay]);

  let digitIndex = -1;
  return (
    <span className="odo-score">
      {formatted.split('').map((char, i) => {
        if (!/\d/.test(char)) {
          return <span className="odo-sep" key={i}>{char}</span>;
        }
        digitIndex += 1;
        const rankFromRight = digitCount - 1 - digitIndex;
        const digitDuration = duration + rankFromRight * staggerMs;
        return (
          <span className="odo-digit" key={i}>
            <span
              className="odo-strip"
              style={{
                transform: `translateY(${settled ? -Number(char) : 0}em)`,
                transitionDuration: `${digitDuration}ms`,
              }}
            >
              {Array.from({ length: 10 }, (_, d) => (
                <span className="odo-num" key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

// Keeps this screen open at least DAILY.SUMMARY_MIN_DISPLAY_MS from when
// submit() started, regardless of how fast the POST/GET resolves.
function waitRemaining(startedAt) {
  const remaining = DAILY.SUMMARY_MIN_DISPLAY_MS - (performance.now() - startedAt);
  return remaining > 0 ? new Promise((resolve) => setTimeout(resolve, remaining)) : Promise.resolve();
}

export default function DailySummary({ totalPts, totalDist, results, onDone }) {
  const [phase, setPhase] = useState(
    () => (localStorage.getItem(LS_KEYS.NAME) ? 'submitting' : 'name_prompt')
  );
  // Holds the resolved leaderboard payload once submit() finishes -- 'ready'
  // phase shows the score + site list and waits for the player to tap "See
  // Leaderboard" instead of auto-navigating, so onDone only fires on that tap.
  const [pendingResult, setPendingResult] = useState(null);

  const submit = useCallback(async (playerName) => {
    setPhase('submitting');
    const startedAt = performance.now();
    const uuid = localStorage.getItem(LS_KEYS.UUID);
    const date = getTodayString();

    try {
      const { status, data } = await postScore({ uuid, playerName, date, totalPts, totalDist });

      if (status === 200 && data.success) {
        localStorage.setItem(LS_KEYS.RANK_TODAY, JSON.stringify({ date, rank: data.rank }));
        await waitRemaining(startedAt);
        setPendingResult({ top10: data.top10, rank: data.rank, banner: null });
        setPhase('ready');
        return;
      }

      if (status === 409) {
        const lb = await getLeaderboard(date);
        await waitRemaining(startedAt);
        setPendingResult({ top10: lb.top10, rank: null, banner: 'already_submitted' });
        setPhase('ready');
        return;
      }

      // Any other non-2xx (400 validation, 429 rate limit, 500) -- same
      // GET-fallback-and-banner UX as a network error; spec only names
      // 200/409/network explicitly, so the rest group with "network error."
      throw new Error(data?.error ?? `score submit failed: ${status}`);
    } catch {
      try {
        const lb = await getLeaderboard(date);
        await waitRemaining(startedAt);
        setPendingResult({ top10: lb.top10, rank: null, banner: 'network_error' });
        setPhase('ready');
      } catch {
        // GET fallback also failed -- Leaderboard gets an empty board plus
        // the error banner; its own Retry button re-runs the GET.
        await waitRemaining(startedAt);
        setPendingResult({ top10: [], rank: null, banner: 'network_error' });
        setPhase('ready');
      }
    }
  }, [totalPts, totalDist]);

  // Returning-player case: NAME already set, submit immediately on mount.
  // The empty-NAME case instead waits for the modal's Save/Skip below.
  useEffect(() => {
    const name = localStorage.getItem(LS_KEYS.NAME);
    if (name) submit(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = (name) => {
    localStorage.setItem(LS_KEYS.NAME, name);
    submit(name);
  };

  const handleSkip = () => submit(getSkipPlayerName(localStorage.getItem(LS_KEYS.UUID)));

  return (
    <div className="ds-screen">
      <div className="ds-total">
        {phase === 'ready'
          ? <OdometerScore value={totalPts} startDelay={600} />
          : <span className="odo-score">{totalPts.toLocaleString()}</span>}
        {' '}<span>/ {DAILY_MAX_TOTAL.toLocaleString()}</span>
      </div>
      <p className="ds-label">Today's Score</p>

      {phase === 'submitting' && (
        <>
          <BrandSpinner />
          <p className="ds-status">Submitting your score…</p>
        </>
      )}

      {phase === 'name_prompt' && <NamePromptModal onSave={handleSave} onSkip={handleSkip} />}

      {phase === 'ready' && (
        <>
          <ul className="ds-site-list">
            {results.map((r) => (
              <li key={r.site.id} className="ds-site-item">
                <span
                  className="ds-site-dot"
                  style={{ background: CATEGORY_META[r.site.category].color }}
                />
                <span className="ds-site-name">{formatSiteName(r.site)}</span>
                <span className="ds-site-dist">{Math.round(r.distanceKm ?? 0).toLocaleString()} km</span>
              </li>
            ))}
          </ul>
          <button type="button" className="ds-leaderboard-btn" onClick={() => onDone(pendingResult)}>
            See Leaderboard
          </button>
        </>
      )}
    </div>
  );
}
