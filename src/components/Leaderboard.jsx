// src/components/Leaderboard.jsx
//
// Section 4's LEADERBOARD screen -- entered two ways:
//   1. From DailySummary.onDone() -- `data` prop already carries
//      top10/rank/banner, no fetch needed here.
//   2. Direct Daily-tab nav after already playing today ("no in-memory POST
//      response" per spec) -- App.jsx passes `data={null}`, so this fetches
//      GET /api/leaderboard?date=today itself and reads LS_KEYS.RANK_TODAY.
//
// Table rank (1,1,3 tie pattern, computeRanks below) and the "Today: #N"
// line deliberately use DIFFERENT numbers per spec -- POST's `rank` is
// plain array-position with no tie handling, table rank is tie-aware. Not a
// bug if they disagree on an exact-tie day.
//
// Share button is a documented placeholder (Section 8b's ShareCard isn't
// built yet) -- same disabled + title="Coming soon" pattern BottomCard.jsx
// uses for Play Trivia and BottomNav.jsx uses for Stats.

import { useState, useEffect, useCallback } from 'react';
import { LS_KEYS } from '../config.js';
import { getTodayString } from '../game/daily.js';
import { getLeaderboard } from '../game/api.js';
import { loadDailyStats, bestDailyScore } from '../game/stats.js';
import './Leaderboard.css';

function computeRanks(top10) {
  let rank = 0;
  let prevScore = null;
  return top10.map((row, i) => {
    if (row.total_pts !== prevScore) rank = i + 1;
    prevScore = row.total_pts;
    return { ...row, tableRank: rank };
  });
}

function formatShortDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Rank is unset unless RANK_TODAY's stored date is actually today --
 *  a stale entry from a previous day must read as null, not as today's rank. */
function readRankToday() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEYS.RANK_TODAY));
    return parsed?.date === getTodayString() ? parsed.rank : null;
  } catch {
    return null;
  }
}

export default function Leaderboard({ data, onPlayClassic, onShare }) {
  const today = getTodayString();
  const [fetched, setFetched] = useState(data ?? null);
  const [fetchError, setFetchError] = useState(false);
  const [loading, setLoading] = useState(data == null);

  const fetchLeaderboard = useCallback(() => {
    setLoading(true);
    setFetchError(false);
    getLeaderboard(today)
      .then((lb) => setFetched({ top10: lb.top10, rank: readRankToday(), banner: null }))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [today]);

  useEffect(() => {
    if (data == null) fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = loadDailyStats();
  const best = bestDailyScore(stats);
  const lastEntry = stats.scores[stats.scores.length - 1];
  const todayEntry = lastEntry?.date === today ? lastEntry : null;

  const top10 = fetched?.top10 ?? [];
  const rank = fetched?.rank ?? null;
  const banner = fetched?.banner ?? null;
  const ranked = computeRanks(top10);

  // Section 8: three distinct "Today:" states -- ranked, unranked-but-scored
  // (outside top 10), and unranked-because-zero. rank/todayEntry cover both
  // reasons `rank` can be null without collapsing them into one "--".
  const todayLine =
    rank != null
      ? `Today: #${rank}${todayEntry ? ` · ${todayEntry.total.toLocaleString()} pts` : ''}`
      : todayEntry && todayEntry.total > 0
        ? 'Today: Outside top 10'
        : 'Today: --';

  return (
    <div className="lb-screen">
      <div className="lb-header">
        <h1>Today's Leaderboard</h1>
        <span className="lb-date">{today}</span>
      </div>

      {banner === 'already_submitted' && (
        <div className="lb-banner">Already submitted for today.</div>
      )}
      {banner === 'network_error' && (
        <div className="lb-banner lb-banner-error">
          Couldn't reach the server.{' '}
          <button type="button" onClick={fetchLeaderboard}>Retry</button>
        </div>
      )}

      {loading && <div className="eg-spinner" />}

      {fetchError && !loading && (
        <div className="lb-banner lb-banner-error">
          Couldn't load the leaderboard.{' '}
          <button type="button" onClick={fetchLeaderboard}>Retry</button>
        </div>
      )}

      {!loading && !fetchError && (
        <>
          <div className="lb-table">
            <div className="lb-row lb-row-head">
              <span>#</span><span>Name</span><span>Score</span><span>Dist</span>
            </div>
            {ranked.map((row, i) => (
              <div className="lb-row" key={i}>
                <span>{row.tableRank}</span>
                <span className="lb-name">{row.player_name}</span>
                <span>{row.total_pts.toLocaleString()}</span>
                <span>{Math.round(row.total_dist).toLocaleString()} km</span>
              </div>
            ))}
            {ranked.length === 0 && <p className="lb-empty">No scores yet today.</p>}
          </div>

          <hr className="lb-divider" />

          <p className="lb-summary-line">
            {best
              ? `Your best: ${best.total.toLocaleString()} (${formatShortDate(best.date)})`
              : 'Your best: --'}
          </p>
          <p className="lb-summary-line lb-today-line">{todayLine}</p>
        </>
      )}

      <div className="lb-actions">
        <button
          type="button"
          className="lb-share-btn"
          disabled
          aria-label="Share - coming soon"
          title="Coming soon"
          onClick={onShare}
        >
          Share
        </button>
        <button type="button" className="lb-classic-btn" onClick={onPlayClassic}>
          Play Classic
        </button>
      </div>
    </div>
  );
}
