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
//
// Round-to-round push transition: same mechanism as BottomCard.jsx (see its
// header comment, point 3) -- the live card keeps `key={site.id}` so
// BottomCard.css's always-on bc-slide-in-left animation replays every
// round, and Next Site/Skip snapshot the departing pill or card into local
// `outgoing` state (beginExit()) so it can render as an inert ghost sibling
// sliding out to the right, independent of how fast useBlitzRound.js clears
// `result`/swaps in the next `site` afterward.

import { useId, useState, useEffect, useRef, forwardRef } from 'react';
import { CATEGORY_META, CARD_SLIDE_MS } from '../config.js';
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

  // ---- Round-to-round push transition -- mirrors BottomCard.jsx's
  // outgoing/beginExit exactly (see that file's header comment, point 3,
  // for the full rationale). `outgoing` freezes whatever was on screen the
  // instant Next Site or Skip was clicked so it can keep animating out to
  // the right on its own clock, independent of useBlitzRound.js's LOADING
  // handoff clearing `result`/swapping `site` out from under it.
  const [outgoing, setOutgoing] = useState(null);
  const exitTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(exitTimerRef.current), []);

  function beginExit() {
    setOutgoing({
      uid: `${site.id}-${Date.now()}`,
      site,
      selectedState,
      result,
      isCard: isRevealing,
    });
    clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => setOutgoing(null), CARD_SLIDE_MS);
  }

  function handleNextSiteClick() {
    beginExit();
    onNextSite();
  }

  function handleSkipClick() {
    beginExit();
    onSkip();
  }

  // Pill and card markup, factored out so the same JSX renders both the
  // live, interactive card (current props) and the frozen ghost snapshot
  // (outgoing's captured props) below. `ghost` only changes which node
  // owns aria-labelledby's id -- a ghost mustn't duplicate the live card's.
  function renderPillBody({ site: pillSite, selectedState: pillSelectedState, ghost }) {
    return (
      <div className="bc-pill">
        <div className="bc-pill-top">
          <span className="bc-icon" aria-hidden="true"><IconMark /></span>
          <span className="bc-pill-text">
            <span id={ghost ? undefined : titleId} className="bc-site-name">{pillSite.name}</span>
          </span>
        </div>

        <div className="bc-pill-actions">
          {onSkip && (
            <button
              type="button"
              className="bc-skip-btn"
              onClick={handleSkipClick}
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
            disabled={!pillSelectedState}
            aria-label="Confirm guess"
          >
            Confirm
          </button>
        </div>
      </div>
    );
  }

  function renderCardBody({ site: cardSite, result: cardResult, ghost }) {
    const cardMeta = CATEGORY_META[cardSite.category];
    const cardCloseCall = !cardResult.isCorrect && isCloseCall(cardResult.guessedState, cardResult.correctStates);

    return (
      <div className="bc-card bz-compact">
        <div className="bc-card-header">
          <span className="bc-icon bc-icon-lg" aria-hidden="true"><IconMark size={30} /></span>
          <span className="bc-category-label">{cardMeta.label.toUpperCase()}</span>
        </div>

        <h2 id={ghost ? undefined : titleId} className="bc-card-name">{cardSite.name}</h2>

        {(cardSite.area_km2 != null || cardResult.isCorrect) && (
          <div className="bc-meta-row">
            {cardSite.area_km2 != null && (
              <span className="bc-meta-item">{cardSite.area_km2.toLocaleString()} km²</span>
            )}
            {/* Wrong guesses already name the state(s) in the badge below --
                only repeat it here when correct, so it isn't shown twice. */}
            {cardResult.isCorrect && (
              <span className="bc-meta-item">State: {cardResult.correctStates.join(', ')}</span>
            )}
          </div>
        )}

        {/* Keyed on site.id so a new round always remounts it -- same
            fresh-play-on-every-round convention as ConfettiBurst.jsx and
            ScoreRemark.jsx -- ensuring the pop-in below replays even if
            two consecutive rounds land on the same correct/wrong
            outcome. The departing ghost's copy of this same element is a
            fresh mount too, so BlitzCard.css mutes its animation -- see
            that file's `.bc-ghost .bz-badge` rule. */}
        <div
          key={cardSite.id}
          className={`bz-badge ${cardResult.isCorrect ? 'bz-badge-correct' : cardCloseCall ? 'bz-badge-wrong bz-badge-close' : 'bz-badge-wrong'}`}
        >
          {cardResult.isCorrect ? <IconCheck /> : <IconCross />}
          <span>
            {cardResult.isCorrect
              ? 'Correct!'
              : cardCloseCall
                ? `So close! It's in ${cardResult.correctStates.join(', ')} — right next door`
                : `Wrong — it's in ${cardResult.correctStates.join(', ')}`}
          </span>
        </div>

        <div className="bc-actions">
          {cardSite.hasBoundary && (
            <button type="button" className="bc-boundary-btn" onClick={onShowBoundary}>
              <IconFrame /> Site Boundary
            </button>
          )}
          <button type="button" className="bc-next-btn" onClick={handleNextSiteClick} aria-label="Next site">
            Next Site
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Departing round's frozen snapshot -- see beginExit() above for why
          this has to be captured at click time rather than animated from
          props. `inert` takes it out of the tab order and makes it
          unclickable for the ~380ms it's still visible sliding away
          (pointer-events:none in BottomCard.css backs this up). */}
      {outgoing && (
        <div
          key={outgoing.uid}
          className="bottom-card bc-ghost"
          style={{ '--eg-accent': CATEGORY_META[outgoing.site.category].color }}
          inert
          aria-hidden="true"
        >
          {outgoing.isCard
            ? renderCardBody({ site: outgoing.site, result: outgoing.result, ghost: true })
            : renderPillBody({ site: outgoing.site, selectedState: outgoing.selectedState, ghost: true })}
        </div>
      )}

      <div
        ref={ref}
        key={site.id}
        className={`bottom-card ${isRevealing ? 'is-expanded' : 'is-pill'}`}
        style={{ '--eg-accent': meta.color }}
        role="region"
        aria-labelledby={titleId}
      >
        {!isRevealing && renderPillBody({ site, selectedState, ghost: false })}
        {isRevealing && result && renderCardBody({ site, result, ghost: false })}
      </div>
    </>
  );
});

export default BlitzCard;
