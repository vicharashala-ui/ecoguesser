// src/components/BottomCard.jsx
// Pre-guess floating pill -> post-guess expanded card.
//
// Two wiring choices worth flagging:
//   1. Confirm Guess lives inside the pill at all times, disabled until
//      `markerPlaced` is true, rather than only appearing in PLACING --
//      avoids a layout jump between READING and PLACING.
//   2. One generic icon (the tiger mark), tinted per the round's category
//      color, is used in both pill and card, rather than a per-category icon.
//
// Icons below are inline SVGs (no icon-library dependency). IconMark's path
// data lives in tigerMarkPath.js instead of being pasted here, since it's
// also reused by Header.jsx, BlitzCard.jsx and MapContainer.jsx and is too
// large (~7.5KB) to duplicate.
//
// Show Site Boundary renders as a small chip at the right edge of the
// result row (distance + pts) rather than its own row, to save vertical space.

import { useId, useState, useEffect, forwardRef } from 'react';
import { CATEGORY_META, SCORING, DAILY } from '../config';
import { TIGER_MARK_VIEWBOX, TIGER_MARK_ASPECT, TIGER_MARK_PATH } from './tigerMarkPath';
import './BottomCard.css';

const DAILY_MAX_TOTAL = SCORING.MAX_SCORE * DAILY.CATEGORIES.length; // 25,000

// ---------------------------------------------------------------------------
// Icons -- minimal inline SVGs, currentColor so they inherit text color.
// ---------------------------------------------------------------------------

// Sized up from the old leaf's 18/22px -- the tiger mark's internal detail
// (stripes, eyes) blurs into a blob below ~24px.
function IconMark({ size = 24 }) {
  return (
    <svg width={size} height={Math.round(size * TIGER_MARK_ASPECT)} viewBox={TIGER_MARK_VIEWBOX} aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d={TIGER_MARK_PATH} />
    </svg>
  );
}

function IconHint({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 18h6M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M12 3a6 6 0 0 0-3.5 10.9c.5.36.5.6.5 1.1v.5h6v-.5c0-.5 0-.74.5-1.1A6 6 0 0 0 12 3Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPin({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <circle cx="12" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconCalendar({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconStar({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5l2.6 5.4 5.9.7-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9-4.3-4.1 5.9-.7L12 3.5Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPaw({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="7" cy="9" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="9" r="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12.5 12c3 0 5.5 2 5.5 4.5s-2 3.5-4 3.5c-.9 0-1.4-.4-1.5-.9-.2-.8-.8-1.3-1.5-1.3s-1.3.5-1.5 1.3c-.1.5-.6.9-1.5.9-2 0-4-1-4-3.5S9.5 12 12.5 12Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFrame({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSkip({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 6l7 6-7 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6l7 6-7 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevron({ size = 16, direction = 'down' }) {
  const rotation = direction === 'up' ? 180 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// BottomCard
// ---------------------------------------------------------------------------

/**
 * @param {Object} props
 * @param {'READING'|'PLACING'|'REVEALING'} props.roundState
 * @param {import('../config').Site} props.site - current round's target site
 * @param {boolean} props.markerPlaced - has the player tapped the map yet
 * @param {0|1|2} props.hintLevel
 * @param {() => void} props.onHint
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onNextSite
 * @param {() => void} [props.onShowBoundary] - zooms in on the revealed
 *   site's boundary (resultLayer.js's zoomToSiteBoundary). Renders only when
 *   provided and site.hasBoundary.
 * @param {() => void} [props.onSkip] - Classic-only; abandons the current
 *   site for a new one. Renders only when provided and mode !== 'daily'.
 * @param {string} [props.nextLabel='Next Site'] - Daily's round 5 uses 'Results'.
 * @param {'classic'|'daily'} props.mode
 * @param {import('../config').RoundResult|null} props.result - set once roundState === 'REVEALING'
 * @param {number|null} props.dailyTotal - cumulative score after this round (daily only)
 * @param {React.Ref<HTMLDivElement>} ref - forwarded to `.bottom-card` so
 *   ClassicMap.jsx can measure its real rendered height for fitBounds padding.
 */
const BottomCard = forwardRef(function BottomCard({
  roundState,
  site,
  markerPlaced,
  hintLevel,
  onHint,
  onConfirm,
  onNextSite,
  onShowBoundary,
  onSkip,
  nextLabel = 'Next Site',
  mode,
  result,
  dailyTotal,
}, ref) {
  const titleId = useId();
  const isRevealing = roundState === 'REVEALING';
  const isDaily = mode === 'daily';
  const meta = CATEGORY_META[site.category];
  const hintsRemaining = 2 - hintLevel;
  const hintsExhausted = hintLevel >= 2;
  // Perfect score only happens when the guess landed inside the site's
  // boundary (useClassicRound.js / useDailyRound.js both short-circuit
  // rawScore to SCORING.MAX_SCORE in that case) -- checking finalScore
  // against MAX_SCORE rather than re-deriving insideBoundary here means a
  // Daily round with hint penalties correctly does NOT celebrate a
  // boundary hit that got docked below 5000.
  const isPerfect = isRevealing && result && result.finalScore === SCORING.MAX_SCORE;

  // Collapse toggle -- lets the player tuck the expanded reveal card down to
  // just name + state so it doesn't block the map. Keyed off `result` (a new
  // object every round) rather than a boolean so a fresh round always opens
  // expanded, matching recordedResultRef's identity-check pattern elsewhere.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(false);
  }, [result]);

  return (
    <div
      ref={ref}
      className={`bottom-card ${isRevealing ? 'is-expanded' : 'is-pill'}`}
      style={{ '--eg-accent': meta.color }}
      role="region"
      aria-labelledby={titleId}
    >
      {!isRevealing && (
        <div className="bc-pill">
          <div className="bc-pill-top">
            <span className="bc-icon" aria-hidden="true"><IconMark /></span>
            <span className="bc-pill-text">
              <span id={titleId} className="bc-site-name">{site.name}</span>
              {hintLevel >= 1 && (
                <span className="bc-hint-state">{site.state.join(', ')}</span>
              )}
            </span>
          </div>

          <div className="bc-pill-actions">
            {!isDaily && onSkip && (
              <button
                type="button"
                className="bc-skip-btn"
                onClick={onSkip}
                aria-label="Skip this site"
                title="Skip this site"
              >
                <IconSkip />
              </button>
            )}

            <button
              type="button"
              className="bc-hint-btn"
              onClick={onHint}
              disabled={hintsExhausted}
              aria-label={
                hintsExhausted
                  ? 'No hints remaining'
                  : `Use hint (${hintsRemaining} remaining)`
              }
              title={hintsExhausted ? 'No hints remaining' : 'Use a hint'}
            >
              <IconHint />
              {!hintsExhausted && <span className="bc-hint-count">{hintsRemaining}</span>}
            </button>

            <button
              type="button"
              className="bc-confirm-btn"
              onClick={onConfirm}
              disabled={!markerPlaced}
              aria-label="Confirm guess"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {isRevealing && result && (
        <div className={`bc-card${collapsed ? ' bc-card-collapsed' : ''}`}>
          <div className="bc-card-header">
            <span className="bc-icon bc-icon-lg" aria-hidden="true"><IconMark size={30} /></span>
            <span className="bc-category-label">{meta.label.toUpperCase()}</span>
            <button
              type="button"
              className="bc-collapse-btn"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand details' : 'Collapse details'}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              <IconChevron direction={collapsed ? 'up' : 'down'} />
            </button>
          </div>

          <h2 id={titleId} className="bc-card-name">{site.name}</h2>

          <div className="bc-meta-row">
            <span className="bc-meta-item bc-state-name"><IconPin size={15} /> {site.state.join(', ')}</span>
            {!collapsed && site.year && (
              <span className="bc-meta-item"><IconCalendar size={15} /> Est. {site.year}</span>
            )}
          </div>

          {!collapsed && (
            <>
              {site.desc && <p className="bc-desc">{site.desc}</p>}

              {site.species && (
                <div className="bc-species">
                  <IconPaw size={15} /> Key species: {site.species}
                </div>
              )}

              <hr className="bc-divider" />

              <div className="bc-result-row">
                <span className="bc-meta-item">
                  <IconPin size={15} />
                  {result.skipped || result.distanceKm == null
                    ? 'Skipped'
                    : `${Math.round(result.distanceKm).toLocaleString()} km away`}
                </span>
                <span className={`bc-meta-item bc-score ${isPerfect ? 'bc-score-perfect' : ''}`}>
                  <IconStar size={15} /> {result.finalScore.toLocaleString()} pts
                  {isPerfect && (
                    <span className="bc-celebrate" key={site.id} aria-hidden="true">
                      <span className="bc-celebrate-label">Perfect!</span>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <span key={i} className="bc-spark" style={{ '--i': i }} />
                      ))}
                    </span>
                  )}
                </span>

                {site.hasBoundary && onShowBoundary && (
                  <button
                    type="button"
                    className="bc-boundary-btn-sm"
                    onClick={onShowBoundary}
                    aria-label="Show site boundary"
                    title="Show site boundary"
                  >
                    <IconFrame size={14} /> Boundary
                  </button>
                )}
              </div>

              {isDaily && result.hintPenalty > 0 && (
                <div className="bc-daily-line bc-penalty">
                  Hint penalty: -{result.hintPenalty.toLocaleString()}
                </div>
              )}
              {isDaily && (
                <>
                  <div className="bc-daily-line">
                    Round score: {result.finalScore.toLocaleString()} pts
                  </div>
                  <div className="bc-daily-line">
                    Total: {(dailyTotal ?? 0).toLocaleString()} / {DAILY_MAX_TOTAL.toLocaleString()}
                  </div>
                </>
              )}

              <div className="bc-actions">
                <button
                  type="button"
                  className="bc-trivia-btn"
                  disabled
                  aria-label="Play Trivia - coming soon"
                  title="Coming soon"
                >
                  Play Trivia
                </button>
                <button type="button" className="bc-next-btn" onClick={onNextSite}>
                  {nextLabel}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default BottomCard;
