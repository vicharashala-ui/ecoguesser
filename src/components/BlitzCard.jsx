// src/components/BlitzCard.jsx
//
// Blitz's guess panel: same pill -> expanded-card shell as
// BottomCard.jsx, reusing BottomCard.css directly for the shell (.bottom-card,
// .bc-pill, .bc-card, .bc-card-header, .bc-meta-row, .bc-actions,
// .bc-boundary-btn, etc.) -- only the content inside differs, plus badge
// styles and the .bz-compact spacing override in BlitzCard.css.
// If BottomCard.css is ever renamed, this file's import below needs to follow.
//
// Critical: the pill must NEVER reveal site.state before Confirm -- Blitz
// has no hint system, so `site.state`/`correctStates` may only appear
// once roundState === 'REVEALING'.
//
// Expanded card is deliberately compact: no Streak line/divider (removed
// per direct request -- Blitz's in-session streak is still tracked by
// useBlitzRound.js, just no longer surfaced here), and the state name is
// only shown once -- skipped in the meta row on a wrong guess since the
// badge below already names it ("Wrong -- it's in ...").

import { useId, forwardRef } from 'react';
import { CATEGORY_META } from '../config.js';
import './BottomCard.css';
import './BlitzCard.css';

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

/**
 * @param {'LOADING'|'READING'|'SELECTING'|'REVEALING'} roundState
 * @param {import('../config').Site} site
 * @param {string|null} selectedState
 * @param {{guessedState:string, correctStates:string[], isCorrect:boolean}|null} result
 * @param {() => void} onConfirm
 * @param {() => void} onNextSite
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
          <span className="bc-icon" aria-hidden="true"><IconLeaf /></span>

          <span className="bc-pill-text">
            <span id={titleId} className="bc-site-name">{site.name}</span>
          </span>

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
      )}

      {isRevealing && result && (
        <div className="bc-card bz-compact">
          <div className="bc-card-header">
            <span className="bc-icon bc-icon-lg" aria-hidden="true"><IconLeaf size={22} /></span>
            <span className="bc-category-label">{meta.label.toUpperCase()}</span>
          </div>

          <h2 id={titleId} className="bc-card-name">{site.name}</h2>

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
