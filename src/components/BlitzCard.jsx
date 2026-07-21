// src/components/BlitzCard.jsx
// Blitz's guess panel: same pill -> expanded-card shell as BottomCard.jsx,
// reusing BottomCard.css directly for the shell (.bottom-card, .bc-pill,
// .bc-pill-top, .bc-pill-actions, .bc-card, .bc-card-header, .bc-meta-row,
// .bc-actions, .bc-boundary-btn, etc.), plus badge styles and the
// .bz-compact spacing override in BlitzCard.css. If BottomCard.css is ever
// renamed, this file's import below needs to follow.
//
// Critical: the pill must NEVER reveal site.state before Confirm -- Hint
// only highlights the containing region(s) on the map (blitzHighlight.js's
// showHintRegion), never the state name itself, so `site.state`/
// `correctStates` text may only appear once roundState === 'REVEALING'.
//
// Expanded card is deliberately compact: no Streak line/divider (the
// session streak lives in BlitzMap.jsx's persistent top-right streak card
// instead, visible across the whole round rather than just the reveal), and
// the state name is only shown once -- skipped in the meta row on a wrong
// guess since the badge below already names it ("Wrong -- it's in ...").

import { useId, forwardRef } from 'react';
import { CATEGORY_META } from '../config.js';
import { TIGER_MARK_VIEWBOX, TIGER_MARK_ASPECT, TIGER_MARK_PATH } from './tigerMarkPath';
import { STATE_ADJACENCY } from '../data/stateAdjacency.js';
import './BottomCard.css';
import './BlitzCard.css';

// True when a wrong guess still borders one of the correct state(s) --
// STATE_ADJACENCY is generated from india-states.topojson's shared arcs
// (see scripts/buildStateAdjacency.js), so this is a plain lookup, no
// runtime geometry work. Softens the badge below from a flat "Wrong" into
// a "so close" near-miss instead, same spirit as showing distance in
// Classic/Daily rather than just right/wrong.
function isCloseCall(guessedState, correctStates) {
  if (!guessedState) return false;
  const neighbors = STATE_ADJACENCY[guessedState];
  if (!neighbors) return false;
  return correctStates.some((s) => neighbors.includes(s));
}

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

// Badge icons -- correct/wrong prefix glyphs, same inline-SVG convention as
// every icon above.
function IconCheck({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCross({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
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
  const closeCall = !!result && !result.isCorrect && isCloseCall(result.guessedState, result.correctStates);

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

          {/* Keyed on site.id so a new round always remounts it -- same
              fresh-play-on-every-round convention as ConfettiBurst.jsx and
              ScoreRemark.jsx -- ensuring the pop-in below replays even if
              two consecutive rounds land on the same correct/wrong
              outcome. */}
          <div
            key={site.id}
            className={`bz-badge ${result.isCorrect ? 'bz-badge-correct' : closeCall ? 'bz-badge-wrong bz-badge-close' : 'bz-badge-wrong'}`}
          >
            {result.isCorrect ? <IconCheck /> : <IconCross />}
            <span>
              {result.isCorrect
                ? 'Correct!'
                : closeCall
                  ? `So close! It's in ${result.correctStates.join(', ')} — right next door`
                  : `Wrong — it's in ${result.correctStates.join(', ')}`}
            </span>
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
