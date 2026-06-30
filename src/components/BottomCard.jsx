// src/components/BottomCard.jsx
//
// Pre-guess floating pill -> post-guess expanded card, per spec Section 8.
//
// Two assumptions made where the spec's ASCII mockups didn't pin down the
// exact wiring (flagged here so they're easy to revisit):
//   1. Confirm Guess lives INSIDE the pre-guess pill at all times, disabled
//      until `markerPlaced` is true -- rather than only appearing once the
//      round-state-machine formally enters PLACING. This matches Decision #8
//      ("greyed until marker placed") literally and avoids a layout jump
//      between READING and PLACING.
//   2. One generic icon (leaf), tinted with the round's category color, is
//      used in both pill and card -- the spec's `[tree]` placeholder appears
//      identically across all five categories in both mockups, not as a
//      per-category icon.
//
// No icon library dependency -- everything below is a small inline SVG so
// this drops in without an `npm install`. Swap for lucide-react later if
// preferred; the call sites (<IconHint />, <IconPin /> etc.) won't change.

import { useId, forwardRef } from 'react';
import { CATEGORY_META, SCORING, DAILY } from '../config';
import './BottomCard.css';

const DAILY_MAX_TOTAL = SCORING.MAX_SCORE * DAILY.CATEGORIES.length; // 25,000

// ---------------------------------------------------------------------------
// Icons -- minimal inline SVGs, currentColor so they inherit text color.
// ---------------------------------------------------------------------------

function IconLeaf({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 4C12 4 4 9 4 17c0 1.66 1.34 3 3 3 8 0 13-8 13-16Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
      <path d="M7 19c3-4 7-8 12-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
 * @param {string} [props.nextLabel='Next Site'] - round 5's button reads
 *   'Results' instead (Daily only); Classic never overrides this.
 * @param {'classic'|'daily'} props.mode
 * @param {import('../config').RoundResult|null} props.result - set once roundState === 'REVEALING'
 * @param {number|null} props.dailyTotal - cumulative score AFTER this round (daily mode only)
 * @param {React.Ref<HTMLDivElement>} ref - forwarded to the outer `.bottom-card` div so
 *   callers (ClassicMap.jsx) can measure its real rendered height -- the expanded
 *   card's height varies with content (site.desc length, daily-only lines), so
 *   resultLayer.js's map fitBounds padding reads this rather than a guessed constant.
 */
const BottomCard = forwardRef(function BottomCard({
  roundState,
  site,
  markerPlaced,
  hintLevel,
  onHint,
  onConfirm,
  onNextSite,
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
          <span className="bc-icon" aria-hidden="true"><IconLeaf /></span>

          <span className="bc-pill-text">
            <span id={titleId} className="bc-site-name">{site.name}</span>
            {hintLevel >= 1 && (
              <span className="bc-hint-state">{site.state.join(', ')}</span>
            )}
          </span>

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
      )}

      {isRevealing && result && (
        <div className="bc-card">
          <div className="bc-card-header">
            <span className="bc-icon bc-icon-lg" aria-hidden="true"><IconLeaf size={22} /></span>
            <span className="bc-category-label">{meta.label.toUpperCase()}</span>
          </div>

          <h2 id={titleId} className="bc-card-name">{site.name}</h2>

          <div className="bc-meta-row">
            <span className="bc-meta-item"><IconPin size={15} /> {site.state.join(', ')}</span>
            {site.year && (
              <span className="bc-meta-item"><IconCalendar size={15} /> Est. {site.year}</span>
            )}
          </div>

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
            <span className="bc-meta-item bc-score">
              <IconStar size={15} /> {result.finalScore.toLocaleString()} pts
            </span>
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
        </div>
      )}
    </div>
  );
});

export default BottomCard;
