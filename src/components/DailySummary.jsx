// src/components/DailySummary.jsx
//
// Section 4's DAILY_SUMMARY -- the transient auto-submit screen between the
// 5th round's REVEALING and LEADERBOARD. Covers steps 2-6 of "DAILY_SUMMARY
// (auto-submits on entry)":
//   1. (done by the caller) App.jsx's handleDailyComplete already called
//      recordDailyResult before this component mounts -- that write must
//      happen exactly once per real completion, not once per mount of this
//      screen, so it doesn't live here.
//   2. Name prompt modal if LS_KEYS.NAME is empty.
//   3. POST /api/score, spinner shown throughout.
//   4/5/6. All three outcomes (200 / 409 / network error) resolve to
//      LEADERBOARD via onDone() -- just with different payloads.
//
// Known gap: this unmounts if the player switches tabs mid-submit (App.jsx
// only renders it while activeTab==='daily'). The in-flight POST/GET still
// completes, but onDone's result is dropped since nothing is listening --
// dailyPhase stays 'summary', and reopening the Daily tab just re-runs this
// flow from scratch (recordDailyResult's idempotency guard makes that safe,
// just wasteful). Not fixed here; needs App.jsx to own the fetch outside
// this component's lifecycle, the same "always mounted" treatment DailyMap
// gets, if it matters in practice.

import { useState, useEffect, useCallback } from 'react';
import NamePromptModal from './NamePromptModal.jsx';
import { LS_KEYS, SCORING, DAILY } from '../config.js';
import { getTodayString } from '../game/daily.js';
import { postScore, getLeaderboard } from '../game/api.js';
import './DailySummary.css';

const DAILY_MAX_TOTAL = SCORING.MAX_SCORE * DAILY.CATEGORIES.length; // 25,000 -- same derivation as BottomCard.jsx

export default function DailySummary({ totalPts, totalDist, onDone, onPlayClassic }) {
  const [phase, setPhase] = useState(
    () => (localStorage.getItem(LS_KEYS.NAME) ? 'submitting' : 'name_prompt')
  );

  const submit = useCallback(async (playerName) => {
    setPhase('submitting');
    const uuid = localStorage.getItem(LS_KEYS.UUID);
    const date = getTodayString();

    try {
      const { status, data } = await postScore({ uuid, playerName, date, totalPts, totalDist });

      if (status === 200 && data.success) {
        localStorage.setItem(LS_KEYS.RANK_TODAY, JSON.stringify({ date, rank: data.rank }));
        onDone({ top10: data.top10, rank: data.rank, banner: null });
        return;
      }

      if (status === 409) {
        const lb = await getLeaderboard(date);
        onDone({ top10: lb.top10, rank: null, banner: 'already_submitted' });
        return;
      }

      // Any other non-2xx (400 validation, 429 rate limit, 500) -- same
      // GET-fallback-and-banner UX as a network error; spec only names
      // 200/409/network explicitly, so the rest group with "network error."
      throw new Error(data?.error ?? `score submit failed: ${status}`);
    } catch {
      try {
        const lb = await getLeaderboard(date);
        onDone({ top10: lb.top10, rank: null, banner: 'network_error' });
      } catch {
        // GET fallback also failed -- Leaderboard gets an empty board plus
        // the error banner; its own Retry button re-runs the GET.
        onDone({ top10: [], rank: null, banner: 'network_error' });
      }
    }
  }, [totalPts, totalDist, onDone]);

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

  const handleSkip = () => submit('Player');

  return (
    <div className="ds-screen">
      <div className="ds-total">
        {totalPts.toLocaleString()} <span>/ {DAILY_MAX_TOTAL.toLocaleString()}</span>
      </div>
      <p className="ds-label">Today's Score</p>

      {phase === 'submitting' && (
        <>
          <div className="eg-spinner" />
          <p className="ds-status">Submitting your score…</p>
        </>
      )}

      <button type="button" className="ds-play-classic" onClick={onPlayClassic}>
        Play Classic
      </button>

      {phase === 'name_prompt' && <NamePromptModal onSave={handleSave} onSkip={handleSkip} />}
    </div>
  );
}
