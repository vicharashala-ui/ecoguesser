// src/components/Leaderboard.jsx
// LEADERBOARD screen -- entered two ways:
//   1. From DailySummary.onDone() -- `data` prop already carries
//      top10/rank/banner, no fetch needed here.
//   2. Direct Daily-tab nav after already playing today (no in-memory POST
//      response) -- App.jsx passes `data={null}`, so this fetches
//      GET /api/leaderboard?date=today itself and reads LS_KEYS.RANK_TODAY.
//
// Table rank (1,1,3 tie pattern, computeRanks below) and the "Today: #N"
// line deliberately use DIFFERENT numbers -- POST's `rank` is plain
// array-position with no tie handling, table rank is tie-aware. Not a bug
// if they disagree on an exact-tie day.
//
// The DailyRecap card auto-opens as a popup modal, 2s after today's entry
// (and allSites) are ready -- see recapOpen below -- but only the first
// time it's ready each day; LS_KEYS.RECAP_SHOWN persists the date so
// revisiting the Daily tab later that same day doesn't reopen it. Tapping
// Close, or tapping the dark backdrop outside the card, dismisses it
// (closeRecap) -- but the same card then just keeps sitting inline in the
// page, exactly as it did before the modal existed, until the next day's
// results replace it. Share captures the rendered DailyRecap node as a PNG
// via html-to-image and shares/downloads it directly -- no separate
// preview step. Disabled only if today's stats_daily entry is somehow
// missing (shouldn't happen; Leaderboard is only reachable after playing
// today).
//
// The same handleShare is also wired to a persistent Share button in the
// bottom action row (lb-actions), left of Play Classic, so sharing doesn't
// require opening the recap modal first. It's disabled rather than hidden
// when hasTodayEntry/hasSites are false, since dailyRecapRef.current is
// null in that case (DailyRecap isn't mounted at all -- see the gate a few
// lines below).

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

function ShareIcon() {
  return (
    <svg className="lb-recap-share-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
    </svg>
  );
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

/** True once the recap modal has already auto-opened for `date` -- a plain
 *  date-string equality check, so a stale value from an earlier day never
 *  suppresses today's one-time auto-open. */
function hasAutoShownRecap(date) {
  return localStorage.getItem(LS_KEYS.RECAP_SHOWN) === date;
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
  const hasTodayEntry = !!todayEntry;
  const hasSites = !!(allSites && allSites.length > 0);

  // Auto-opens once today's recap is ready, but only the first time: waits
  // 2s (so the leaderboard/recap have visibly settled before popping the
  // modal over them) then checks LS_KEYS.RECAP_SHOWN, which persists the
  // date this already fired. Without that guard, revisiting the Daily tab
  // later the same day would re-run this effect (loading/hasTodayEntry/
  // hasSites all still true) and pop the modal open again every time.
  const [recapOpen, setRecapOpen] = useState(false);
  // True from the moment Close/backdrop is tapped until the whole close
  // sequence (card fade-out, reflow, backdrop fade-out) has finished --
  // see closeRecap for the phase breakdown and .lb-recap-backdrop in
  // Leaderboard.css for why a separate backdrop element (rather than the
  // wrap's own opacity) is what actually hides the mid-close reflow.
  const [recapClosing, setRecapClosing] = useState(false);
  // True only during the backdrop's own final fade-out (phase 3 below) --
  // toggles .lb-recap-backdrop-fading, which is what actually animates it.
  const [backdropFading, setBackdropFading] = useState(false);
  const closeTimerRef = useRef(null);
  const closeRafRef = useRef([]);
  const fadeTimerRef = useRef(null);
  const openTimerRef = useRef(null);
  useEffect(() => {
    if (loading || !hasTodayEntry || !hasSites) return undefined;
    if (hasAutoShownRecap(today)) return undefined;
    openTimerRef.current = setTimeout(() => {
      localStorage.setItem(LS_KEYS.RECAP_SHOWN, today);
      setRecapOpen(true);
    }, 2000);
    return () => clearTimeout(openTimerRef.current);
  }, [loading, hasTodayEntry, hasSites, today]);

  useEffect(() => () => {
    clearTimeout(closeTimerRef.current);
    clearTimeout(fadeTimerRef.current);
    closeRafRef.current.forEach(cancelAnimationFrame);
  }, []);

  const closeRecap = () => {
    // Ignore close attempts mid-share -- html-to-image is actively reading
    // the live DOM node; unmounting it out from under that capture could
    // produce a blank/partial image.
    if (sharing || recapClosing) return;
    setRecapClosing(true);
    // Phase 1 (0-220ms): the card fades/shrinks per the existing animation
    // in Leaderboard.css, still fixed-positioned on top of the backdrop,
    // which stays fully opaque throughout.
    closeTimerRef.current = setTimeout(() => {
      // Phase 2: drop the card's fixed positioning so it reflows back into
      // the page's inline layout -- this instantly shifts every sibling
      // below it (Play Classic/Blitz etc.), but the separate backdrop is
      // still fully opaque and, being position:fixed with a higher
      // z-index than the now-static wrap, physically covers that entire
      // reflow regardless of the card's own opacity. The double rAF just
      // waits a frame for that (now invisible) reflow to actually paint
      // before phase 3 starts revealing it.
      setRecapOpen(false);
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => {
          // Phase 3: the page has already silently settled behind it, so
          // fading the backdrop away now (.lb-recap-backdrop-fading) is a
          // plain opacity transition over an already-final layout --
          // nothing left to shift, nothing to flicker.
          setBackdropFading(true);
          fadeTimerRef.current = setTimeout(() => {
            setRecapClosing(false);
            setBackdropFading(false);
          }, 220); // matches the backdrop's own fade-out transition duration
        });
        closeRafRef.current.push(raf2);
      });
      closeRafRef.current = [raf1];
    }, 220);
  };

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
            {ranked.map((row, i) => {
              const isYou = rank != null && row.tableRank === rank;
              return (
                <div
                  className={`lb-row${isYou ? ' lb-row-you' : ''}`}
                  key={i}
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                >
                  <span>{row.tableRank}</span>
                  <span className="lb-name">
                    {row.player_name}
                  </span>
                  <span>{row.total_pts.toLocaleString()}</span>
                  <span>{Math.round(row.total_dist).toLocaleString()} km</span>
                </div>
              );
            })}
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

      {/* Deliberately outside the !fetchError gate above -- built entirely
          from local stats_daily + allSites (no network call), so a flaky
          leaderboard fetch must not hide it. Today's completed round stays
          visible on every Daily-tab open regardless of server/connectivity
          state -- and stays put in the page (not just the modal) until the
          next day's results replace todayEntry.

          One single DailyRecap instance/ref throughout: recapOpen only
          toggles lb-recap-wrap-open, which turns the wrap into a
          full-viewport flex container that centers the card over a
          separate .lb-recap-backdrop (kept as its own element, not part of
          the wrap, specifically so it can stay opaque and hide the wrap's
          close-time reflow -- see closeRecap). Tapping the backdrop, or
          the wrap outside the card, closes it; the inner stopPropagation
          keeps taps on the card/buttons from bubbling up and closing it.
          Handlers are only attached while the modal is actually open, so
          the inline (closed) state has zero listeners -- identical to a
          plain always-inline card. */}
      {!loading && hasTodayEntry && hasSites && (
        <>
          {(recapOpen || recapClosing) && (
            <div
              className={`lb-recap-backdrop${backdropFading ? ' lb-recap-backdrop-fading' : ''}`}
              onClick={recapOpen ? closeRecap : undefined}
            />
          )}
          <div
            className={`lb-recap-wrap${recapOpen ? ' lb-recap-wrap-open' : ''}${recapClosing ? ' lb-recap-wrap-closing' : ''}`}
            onClick={recapOpen ? closeRecap : undefined}
          >
            <div
              className="lb-recap-inner"
              onClick={recapOpen ? (e) => e.stopPropagation() : undefined}
            >
              <DailyRecap
                ref={dailyRecapRef}
                date={today}
                allSites={allSites}
                totalScore={todayEntry?.total ?? null}
                totalDist={todayEntry?.dist ?? null}
              />
              {recapOpen && (
                <div className="lb-recap-actions">
                  <button
                    type="button"
                    className="lb-recap-share-btn"
                    disabled={sharing}
                    onClick={handleShare}
                  >
                    {sharing ? 'Preparing…' : 'Share'}
                    <ShareIcon />
                  </button>
                  <button type="button" className="lb-recap-close-btn" onClick={closeRecap}>
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="lb-actions">
        <button
          type="button"
          className="lb-share-btn"
          disabled={sharing || !hasTodayEntry || !hasSites}
          onClick={handleShare}
        >
          {sharing ? 'Preparing…' : 'Share'}
          <ShareIcon />
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
