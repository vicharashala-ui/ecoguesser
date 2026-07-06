// src/components/BlitzCard.jsx
//
// Blitz's guess panel: same pill -> expanded-card shell as
// BottomCard.jsx, reusing BottomCard.css directly for the shell (.bottom-card,
// .bc-pill, .bc-pill-top, .bc-pill-actions, .bc-card, .bc-card-header,
// .bc-meta-row, .bc-actions, .bc-boundary-btn, etc.) -- pre-guess pill now
// mirrors BottomCard.jsx's two-row layout exactly (name row, then
// Skip/Hint/Confirm row), plus badge styles and the .bz-compact spacing
// override in BlitzCard.css. If BottomCard.css is ever renamed, this file's
// import below needs to follow.
//
// Critical: the pill must NEVER reveal site.state before Confirm -- Hint
// only highlights the containing region(s) on the map (blitzHighlight.js's
// showHintRegion), never the state name itself, so `site.state`/
// `correctStates` text may only appear once roundState === 'REVEALING'.
//
// Expanded card is deliberately compact: no Streak line/divider (removed
// per direct request -- Blitz's in-session streak is still tracked by
// useBlitzRound.js, just no longer surfaced here), and the state name is
// only shown once -- skipped in the meta row on a wrong guess since the
// badge below already names it ("Wrong -- it's in ...").

import { useId, forwardRef } from 'react';
import { CATEGORY_META, formatSiteName } from '../config.js';
import { TIGER_MARK_VIEWBOX, TIGER_MARK_ASPECT, TIGER_MARK_PATH } from './tigerMarkPath';
import './BottomCard.css';
import './BlitzCard.css';

// Same mark BottomCard.jsx uses -- path data is imported from
// tigerMarkPath.js rather than duplicated (it's ~7.5KB), unlike the small
// inline SVGs below which do follow this file's usual no-shared-module
// pattern.
function IconMark({ size = 24 }) {
  return (
    <svg width={size} height={Math.round(size * TIGER_MARK_ASPECT)} viewBox={TIGER_MARK_VIEWBOX} aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d={TIGER_MARK_PATH} />
    </svg>
  );
}

// Same icon BottomCard.jsx uses on its "Site Boundary" chip -- duplicated
// here rather than imported, per this codebase's no-shared-icon-module
// pattern (each component file owns its own small inline SVGs).
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

// Below two duplicated from BottomCard.jsx for the same reason as IconFrame.
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

function IconSkip({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 6l7 6-7 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6l7 6-7 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * @param {'LOADING'|'READING'|'SELECTING'|'REVEALING'} roundState
 * @param {import('../config').Site} site
 * @param {string|null} selectedState
 * @param {{guessedState:string, correctStates:string[], isCorrect:boolean}|null} result
 * @param {() => void} onConfirm
 * @param {() => void} onNextSite
 * @param {() => void} [onSkip] - abandons the current site for a new one,
 *   same semantics as Classic's Skip (BottomCard.jsx / useClassicRound.js).
 * @param {() => void} onHint - highlights every state in the correct
 *   region(s) amber for 3s. Can be tapped any number of times per round --
 *   there's no hint counter or penalty in Blitz.
 * @param {() => void} onShowBoundary - zooms in tight on site.hasBoundary's
 *   polygon, already auto-drawn on reveal. Button only renders when site.hasBoundary is true.
 * @param {React.Ref<HTMLDivElement>} ref - forwarded to the outer `.bottom-card` div so
 *   BlitzMap.jsx can measure its real rendered height -- the expanded card's
 *   height varies with content (correctStates can list more than one state
 *   for border-spanning sites, wrapping the badge/state line), so
 *   BlitzMap.jsx's RecenterButton offset and boundary-zoom padding read this
 *   rather than a guessed constant. Same contract as BottomCard.jsx's ref.
 */
const BlitzCard = forwardRef(function BlitzCard({
  roundState,
  site,
  selectedState,
  result,
  onConfirm,
  onNextSite,
  onSkip,
  onHint,
  onShowBoundary,
}, ref) {
  const titleId = useId();
  const isRevealing = roundState === 'REVEALING';
  const meta = CATEGORY_META[site.category];

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
              <span id={titleId} className="bc-site-name">{formatSiteName(site)}</span>
            </span>
          </div>

          <div className="bc-pill-actions">
            {onSkip && (
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
              aria-label="Hint - highlight the region"
              title="Highlight the correct region"
            >
              <IconHint />
            </button>

            <button
              type="button"
              className="bc-confirm-btn"
              onClick={onConfirm}
              disabled={!selectedState}
              aria-label="Confirm guess"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {isRevealing && result && (
        <div className="bc-card bz-compact">
          <div className="bc-card-header">
            <span className="bc-icon bc-icon-lg" aria-hidden="true"><IconMark size={30} /></span>
            <span className="bc-category-label">{meta.label.toUpperCase()}</span>
          </div>

          <h2 id={titleId} className="bc-card-name">{formatSiteName(site)}</h2>

          {(site.area_km2 != null || result.isCorrect) && (
            <div className="bc-meta-row">
              {site.area_km2 != null && (
                <span className="bc-meta-item">{site.area_km2.toLocaleString()} km²</span>
              )}
              {/* Wrong guesses already name the state(s) in the badge below --
                  only repeat it here when correct, so it isn't shown twice. */}
              {result.isCorrect && (
                <span className="bc-meta-item">State: {result.correctStates.join(', ')}</span>
              )}
            </div>
          )}

          <div className={`bz-badge ${result.isCorrect ? 'bz-badge-correct' : 'bz-badge-wrong'}`}>
            {result.isCorrect ? 'Correct!' : `Wrong — it's in ${result.correctStates.join(', ')}`}
          </div>

          <div className="bc-actions">
            {site.hasBoundary && (
              <button type="button" className="bc-boundary-btn" onClick={onShowBoundary}>
                <IconFrame /> Site Boundary
              </button>
            )}
            <button type="button" className="bc-next-btn" onClick={onNextSite} aria-label="Next site">
              Next Site
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default BlitzCard;
