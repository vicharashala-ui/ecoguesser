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
// Share captures the rendered DailyRecap card (below) as a PNG via
// html-to-image and shares/downloads it directly -- no separate preview
// modal. Disabled only if today's stats_daily entry is somehow missing
// (shouldn't happen; Leaderboard is only reachable after playing today).

import { useState, useEffect, useCallback, useRef } from 'react';
import { LS_KEYS } from '../config.js';
import { getTodayString } from '../game/daily.js';
import { getLeaderboard } from '../game/api.js';
import { loadDailyStats, bestDailyScore } from '../game/stats.js';
import { shareNodeAsImage } from '../game/shareImage.js';
import DailyRecap from './DailyRecap.jsx';
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
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
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

export default function Leaderboard({ data, onPlayClassic, onPlayBlitz, allSites }) {
  const today = getTodayString();
  const [fetched, setFetched] = useState(data ?? null);
  const [fetchError, setFetchError] = useState(false);
  const [loading, setLoading] = useState(data == null);
  const [sharing, setSharing] = useState(false);
  const dailyRecapRef = useRef(null);

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

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareNodeAsImage(dailyRecapRef.current, {
        filename: `ecoguesser-daily-${today}.png`,
        shareTitle: 'EcoGuesser',
        shareText: todayEntry
          ? `My EcoGuesser Daily recap: ${todayEntry.total.toLocaleString()} today`
          : 'My EcoGuesser Daily recap',
      });
    } finally {
      setSharing(false);
    }
  };

  const top10 = fetched?.top10 ?? [];
  const rank = fetched?.rank ?? null;
  const banner = fetched?.banner ?? null;
  const ranked = computeRanks(top10);

  return (
    <div className="lb-screen">
      <div className="lb-header">
        <h1>Today's Leaderboard</h1>
        <span className="lb-date">{formatShortDate(today)}</span>
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
                <span className="lb-name">
                  {row.player_name}
                  {rank != null && row.tableRank === rank && (
                    <span className="lb-you">You</span>
                  )}
                </span>
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
        </>
      )}

      {/* Deliberately outside the !fetchError gate above -- the recap is
          built entirely from local stats_daily + allSites (no network
          call), so a flaky leaderboard fetch must not hide it. Today's
          completed round has to stay visible on every Daily-tab open
          regardless of server/connectivity state. */}
      {!loading && todayEntry && (
        <DailyRecap
          ref={dailyRecapRef}
          date={today}
          allSites={allSites}
          totalScore={todayEntry?.total ?? null}
          totalDist={todayEntry?.dist ?? null}
        />
      )}

      <div className="lb-actions">
        <button
          type="button"
          className="lb-share-btn"
          disabled={!todayEntry || sharing}
          onClick={handleShare}
        >
          {sharing ? 'Preparing…' : 'Share'}
        </button>
        <button type="button" className="lb-classic-btn" onClick={onPlayClassic}>
          Play Classic
        </button>
        <button type="button" className="lb-blitz-btn" onClick={onPlayBlitz}>
          Play Blitz
        </button>
      </div>
    </div>
  );
}
