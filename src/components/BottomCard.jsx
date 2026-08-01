// src/components/BottomCard.jsx
// Pre-guess floating pill -> post-guess expanded card.
//
// Three wiring choices worth flagging:
//   1. Confirm Guess lives inside the pill at all times, disabled until
//      `markerPlaced` is true, rather than only appearing in PLACING --
//      avoids a layout jump between READING and PLACING.
//   2. One generic icon (the tiger mark), tinted per the round's category
//      color, is used in both pill and card, rather than a per-category icon.
//   3. Round-to-round push transition: this component never remounts
//      itself (Classic/DailyMap render one persistent instance each, no
//      `key` on <BottomCard>), so the pill/card swap has always just been a
//      CSS class change on the same DOM node. The new site's card slides in
//      from the left on every round (BottomCard.css's always-on
//      bc-slide-in-left animation, replayed each time by giving THIS
//      component's root a fresh `key={site.id}`), while the previous
//      round's card simultaneously slides out to the right. That outgoing
//      card can't just be "this same node animating away", though --
//      useClassicRound.js/useDailyRound.js each clear `result`/replace
//      `site` at a different point in their own LOADING handoff, so the
//      old content is gone from props before a props-driven exit animation
//      would get a chance to read it. Next Site/Skip are wrapped
//      (handleNextSiteClick/handleSkipClick) to snapshot the departing
//      round's content into local `outgoing` state at the moment of the
//      click instead, and render it as a separate, `inert` "ghost" sibling
//      that animates away on its own clock (see beginExit() below).
//
// Icons below are inline SVGs (no icon-library dependency). IconMark's path
// data lives in tigerMarkPath.js instead of being pasted here, since it's
// also reused by Header.jsx, BlitzCard.jsx and MapContainer.jsx and is too
// large (~7.5KB) to duplicate.
//
// Show Site Boundary renders as a small chip at the right edge of the
// result row (distance + pts) rather than its own row, to save vertical space.

import { useId, useState, useEffect, useRef, forwardRef, memo, lazy, Suspense } from 'react';
import { CATEGORY_META, SCORING, CARD_SLIDE_MS } from '../config';
import { TIGER_MARK_VIEWBOX, TIGER_MARK_ASPECT, TIGER_MARK_PATH } from './tigerMarkPath';
import ScoreRemark from './ScoreRemark.jsx';
import AnimatedScore from './AnimatedScore.jsx';
import './BottomCard.css';

// Lazy, not a static import: BottomCard is statically reachable from
// DailyMap (mounted immediately, Daily being the default tab), so a static
// import here rides into that first-paint dependency graph even though a
// perfect guess -- the only thing that renders this -- can't happen before
// at least one round has been played. Confirmed via a real build: without
// this, ConfettiBurst-*.{js,css} were fetched as part of DailyMap's own
// preload batch despite never being modulepreloaded from index.html
// directly. Suspense fallback={null} is safe here -- the burst is a bonus
// animation, not something the result card is incomplete without while its
// tiny chunk fetches.
const ConfettiBurst = lazy(() => import('./ConfettiBurst.jsx'));

// "Zoom in and tap to place pin" -- shown above the pill until the player's
// first pin placement of the browser session (sessionStorage, not
// localStorage: it's meant to reappear next visit, just not mid-session --
// e.g. after switching from Daily to Classic having already placed a pin).
// Read/written directly on every render rather than mirrored into its own
// piece of React state, so a flag set by one mode's BottomCard instance
// (Classic/Daily each mount their own) is picked up by the other the next
// time IT re-renders too, instead of only updating whichever instance
// happened to be mounted at the moment the flag was set.
const SEEN_PIN_TIP_KEY = 'eg_seen_pin_tip';

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

// Single chevron, rotated via CSS (.bc-collapse-toggle.is-collapsed) rather
// than swapped for a separate "up" glyph -- one icon, the rotation itself
// communicates the toggle's other state.
function IconChevronDown({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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

// ---------------------------------------------------------------------------
// BottomCard
// ---------------------------------------------------------------------------

// Inserts soft hyphens (U+00AD) so long names wrap to fill each line
// instead of jumping whole words to line 2 -- BottomCard.css's .bc-card-name/
// .bc-site-name deliberately have no word-break override, since
// word-break: break-all has a hard spec rule suppressing ALL hyphen
// rendering (even at a \u00AD), which is what erased the mark at the
// break entirely. Plain word-break (normal) treats each \u00AD here as a
// first-class break opportunity -- same priority as a space -- so the
// browser still fills the line to the nearest one and renders a visible
// "-" there by default (hyphens: manual), no `hyphens: auto` dictionary
// lookup needed (which wouldn't know proper nouns/place names anyway).
//
// Only inserted inside runs of 5+ letters, at 2-letter intervals, and only
// where 2+ letters remain ahead -- e.g. "Annamalai" gets break points after
// "An" and "namal" but not after "annamala", so a break can never strand
// a single orphan letter next to a bracket/paren (was producing
// "(Annamala\u00AD" / "i)" for "Indira Gandhi (Annamalai) National Park").
// Punctuation (brackets, spaces) is excluded automatically since \p{L}
// only matches letters, so a run never crosses into it.
function softHyphenate(text) {
  return text.replace(/\p{L}{5,}/gu, (word) =>
    word.replace(/(\p{L}{2})(?=\p{L}{2,})/gu, '$1\u00AD')
  );
}

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
 * @param {boolean} props.collapsed - owned by the parent (not local state)
 *   so it can drive RecenterButton's position in the same layout pass; see
 *   ClassicMap.jsx/DailyMap.jsx's cardHeight useLayoutEffect.
 * @param {(collapsed: boolean) => void} props.onToggleCollapsed
 * @param {number|null} [props.cardHeight] - same measured value driving
 *   RecenterButton's `bottom`, applied here as an inline `max-height` cap
 *   during REVEALING. Without this, the CSS class-based caps (80vh/120px)
 *   are transitioned toward instead of the real content height, so the
 *   card visually finishes growing/shrinking well before its 0.3s
 *   transition elapses -- desyncing it from the button's `bottom`
 *   transition, which always runs the full 0.3s toward its real target.
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
  collapsed,
  onToggleCollapsed,
  cardHeight,
}, ref) {
  const titleId = useId();
  const isRevealing = roundState === 'REVEALING';
  const isDaily = mode === 'daily';
  const meta = CATEGORY_META[site.category];
  // Perfect score only happens when the guess landed inside the site's
  // boundary (useClassicRound.js / useDailyRound.js both short-circuit
  // rawScore to SCORING.MAX_SCORE in that case) -- checking finalScore
  // against MAX_SCORE rather than re-deriving insideBoundary here means a
  // Daily round with hint penalties correctly does NOT celebrate a
  // boundary hit that got docked below 5000.
  const isPerfect = isRevealing && result && result.finalScore === SCORING.MAX_SCORE;

  // isPerfect stays true for as long as the player sits on this REVEALING
  // result (i.e. until Next Site), but Classic/DailyMap never unmount on
  // tab switch -- App.jsx only toggles display:none/block. A CSS animation
  // frozen mid-flight by an ancestor's display:none restarts from 0% the
  // moment display flips back to block, so tying ConfettiBurst directly to
  // isPerfect replayed the whole star burst every time the player reopened
  // a tab where their last (still-unadvanced) guess happened to be perfect.
  // Mirrors MilestoneToast's self-dismiss pattern: render it for exactly as
  // long as its own animation actually runs (2600ms max piece duration,
  // see ConfettiBurst.jsx's PIECES_PER_SIDE loop), then drop it from the
  // tree so there's nothing left for a later display toggle to replay.
  const CONFETTI_DISPLAY_MS = 2700;
  const [confettiSiteId, setConfettiSiteId] = useState(null);
  const confettiTimerRef = useRef(null);
  useEffect(() => {
    if (!isPerfect) return undefined;
    setConfettiSiteId(site.id);
    confettiTimerRef.current = setTimeout(() => setConfettiSiteId(null), CONFETTI_DISPLAY_MS);
    return () => clearTimeout(confettiTimerRef.current);
  }, [isPerfect, site.id]);

  // ---- Round-to-round push transition --------------------------------
  // `outgoing` holds a frozen snapshot of whatever was on screen the
  // instant Next Site or Skip was clicked -- the departing pill or card,
  // exactly as the player last saw it -- so it can go on animating out to
  // the right on its own, independent of how fast (or in what order)
  // useClassicRound.js/useDailyRound.js clear `result` or swap in the next
  // `site` afterward. `uid` (not just site.id) guarantees a fresh React
  // key even in a single-site pool, where the "next" site can legitimately
  // be the same object as the one leaving.
  const [outgoing, setOutgoing] = useState(null);
  const exitTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(exitTimerRef.current), []);

  function beginExit() {
    setOutgoing({
      uid: `${site.id}-${Date.now()}`,
      site,
      result,
      collapsed,
      hintLevel,
      markerPlaced,
      isCard: isRevealing,
    });
    clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => setOutgoing(null), CARD_SLIDE_MS);
  }

  // Snapshot-then-delegate: capture this render's props before calling the
  // real handler, which is what actually advances roundState/site/result.
  function handleNextSiteClick() {
    beginExit();
    onNextSite();
  }

  function handleSkipClick() {
    beginExit();
    onSkip();
  }

  // Only relevant pre-guess (READING/PLACING) -- once revealed there's
  // nothing left to place, and markerPlaced already covers "this round's
  // pin is down." sessionStorage.getItem is synchronous and re-read fresh
  // on every render, so this stays correct even across BottomCard's two
  // separate mount points (Classic + Daily).
  const showPinTip = !isRevealing && !markerPlaced
    && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(SEEN_PIN_TIP_KEY);

  useEffect(() => {
    if (markerPlaced && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SEEN_PIN_TIP_KEY, '1');
    }
  }, [markerPlaced]);

  // Expanded reveal card's collapse toggle -- collapses down to just
  // name + state (no logo/category label/description/score/etc.). `collapsed`
  // and its reset-on-new-result are owned by the parent now, not here (see
  // props doc above) -- collapsing this card and re-measuring RecenterButton's
  // offset need to happen in the same layout pass, which requires the parent
  // to know the instant the toggle is clicked rather than finding out via a
  // child re-render.

  // Pill and card markup, factored out so the exact same JSX can render
  // both the live, interactive card (current props) and the frozen ghost
  // snapshot (outgoing's captured props) below -- everything either one
  // needs is passed in explicitly rather than closed over, since the
  // ghost's data is deliberately NOT the current props. `ghost` only
  // changes two things: the id that feeds aria-labelledby (a ghost mustn't
  // duplicate the live card's id) and whether the score counts up
  // (AnimatedScore replaying its count-up on a card that's already leaving
  // would just be distracting motion, not a real reveal).
  function renderPillBody({ site: pillSite, hintLevel: pillHintLevel, markerPlaced: pillMarkerPlaced, ghost }) {
    const remaining = 2 - pillHintLevel;
    const exhausted = pillHintLevel >= 2;
    return (
      <div className="bc-pill">
        <div className="bc-pill-top">
          <span className="bc-icon" aria-hidden="true"><IconMark size={30} /></span>
          <span className="bc-pill-text">
            <span id={ghost ? undefined : titleId} className="bc-site-name">{softHyphenate(pillSite.name)}</span>
            {pillHintLevel >= 1 && (
              <span className="bc-hint-state">{pillSite.state.join(', ')}</span>
            )}
          </span>
        </div>

        <div className="bc-pill-actions">
          {!isDaily && onSkip && (
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
            disabled={exhausted}
            aria-label={exhausted ? 'No hints remaining' : `Use hint (${remaining} remaining)`}
            title={exhausted ? 'No hints remaining' : 'Use a hint'}
          >
            <IconHint />
            {!exhausted && <span className="bc-hint-count">{remaining}</span>}
          </button>

          <button
            type="button"
            className="bc-confirm-btn"
            onClick={onConfirm}
            disabled={!pillMarkerPlaced}
            aria-label="Confirm guess"
          >
            Confirm
          </button>
        </div>
      </div>
    );
  }

  function renderCardBody({ site: cardSite, result: cardResult, collapsed: cardCollapsed, ghost }) {
    const cardMeta = CATEGORY_META[cardSite.category];
    const cardIsPerfect = cardResult.finalScore === SCORING.MAX_SCORE;
    const cardIsScored = !cardResult.skipped && cardResult.distanceKm != null;

    return (
      <div className="bc-card">
        <button
          type="button"
          className={`bc-collapse-toggle ${cardCollapsed ? 'is-collapsed' : ''}`}
          onClick={() => onToggleCollapsed(!cardCollapsed)}
          aria-label={cardCollapsed ? 'Expand details' : 'Collapse details'}
          title={cardCollapsed ? 'Expand details' : 'Collapse details'}
        >
          <IconChevronDown />
        </button>

        {!cardCollapsed && (
          <div className="bc-card-header">
            <span className="bc-icon bc-icon-lg" aria-hidden="true"><IconMark size={30} /></span>
            <span className="bc-category-label">{cardMeta.label.toUpperCase()}</span>
          </div>
        )}

        <h2 id={ghost ? undefined : titleId} className="bc-card-name">{softHyphenate(cardSite.name)}</h2>

        <div className="bc-meta-row">
          <span className="bc-meta-item bc-state-name"><IconPin size={15} /> {cardSite.state.join(', ')}</span>
          {!cardCollapsed && cardSite.year && (
            <span className="bc-meta-item"><IconCalendar size={15} /> Est. {cardSite.year}</span>
          )}
        </div>

        {!cardCollapsed && (
          <>
            {cardSite.desc && <p className="bc-desc">{cardSite.desc}</p>}

            {cardSite.species && (
              <div className="bc-species">
                <IconPaw size={15} /> Key species: {cardSite.species}
              </div>
            )}

            <hr className="bc-divider" />

            <div className="bc-result-row">
              {cardSite.area_km2 != null && (
                <span className="bc-meta-item bc-area-item">{cardSite.area_km2.toLocaleString()} km²</span>
              )}
              <span className="bc-meta-item bc-distance-item">
                <IconPin size={15} />
                {cardResult.skipped || cardResult.distanceKm == null
                  ? 'Skipped'
                  : `${Math.round(cardResult.distanceKm).toLocaleString()} km away`}
              </span>
              <span className={`bc-meta-item bc-score ${cardIsPerfect ? 'bc-score-perfect' : ''}`}>
                <IconStar size={15} />{' '}
                {!ghost && cardIsScored
                  ? <AnimatedScore key={cardSite.id} value={cardResult.finalScore} />
                  : cardResult.finalScore.toLocaleString()} pts
              </span>
            </div>

            {isDaily && cardResult.hintPenalty > 0 && (
              <div className="bc-daily-line bc-penalty">
                Hint penalty: -{cardResult.hintPenalty.toLocaleString()}
              </div>
            )}
            {isDaily && (
              <div className="bc-daily-line">
                Round score: {cardResult.finalScore.toLocaleString()} / {SCORING.MAX_SCORE.toLocaleString()} pts
              </div>
            )}

            <div className="bc-actions">
              {cardSite.hasBoundary && onShowBoundary && (
                <button type="button" className="bc-boundary-btn" onClick={onShowBoundary}>
                  <IconFrame /> Site Boundary
                </button>
              )}
              <button type="button" className="bc-next-btn" onClick={handleNextSiteClick}>
                {nextLabel}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {showPinTip && (
        <div className="bc-pin-tip" aria-hidden="true">Zoom in and tap to place pin</div>
      )}
      {/* Screen-wide corner-to-center confetti burst on a perfect (boundary
          hit) guess, and the big centered "Excellent!"/"Way Off"/etc remark.
          Both rendered as siblings of .bottom-card, not descendants --
          .bottom-card has overflow:hidden, which would clip a full-screen
          effect. ScoreRemark does its own REVEALING/result gating and
          site.id keying internally (see ScoreRemark.jsx). */}
      {confettiSiteId === site.id && (
        <Suspense fallback={null}>
          <ConfettiBurst key={site.id} />
        </Suspense>
      )}
      <ScoreRemark roundState={roundState} result={result} />

      {/* Departing round's frozen snapshot -- see beginExit() above for why
          this has to be captured at click time rather than animated from
          props. `inert` takes its buttons out of the tab order and makes
          them unclickable for the ~380ms it's still visible sliding away
          (pointer-events:none in BottomCard.css backs this up); it's
          otherwise the exact same markup the live card had a moment ago. */}
      {outgoing && (
        <div
          key={outgoing.uid}
          className={`bottom-card bc-ghost ${outgoing.isCard ? `is-expanded ${outgoing.collapsed ? 'is-collapsed' : ''}` : 'is-pill'}`}
          style={{
            '--eg-accent': CATEGORY_META[outgoing.site.category].color,
            '--eg-accent-text': CATEGORY_META[outgoing.site.category].textColor ?? CATEGORY_META[outgoing.site.category].color,
          }}
          inert
          aria-hidden="true"
        >
          {outgoing.isCard
            ? renderCardBody({ site: outgoing.site, result: outgoing.result, collapsed: outgoing.collapsed, ghost: true })
            : renderPillBody({ site: outgoing.site, hintLevel: outgoing.hintLevel, markerPlaced: outgoing.markerPlaced, ghost: true })}
        </div>
      )}

      <div
        ref={ref}
        key={site.id}
        className={`bottom-card ${isRevealing ? `is-expanded ${collapsed ? 'is-collapsed' : ''}` : 'is-pill'}`}
        style={{
          '--eg-accent': meta.color,
          '--eg-accent-text': meta.textColor ?? meta.color,
          ...(isRevealing && cardHeight ? { maxHeight: `${cardHeight}px` } : null),
        }}
        role="region"
        aria-labelledby={titleId}
      >
        {!isRevealing && renderPillBody({ site, hintLevel, markerPlaced, ghost: false })}
        {isRevealing && result && renderCardBody({ site, result, collapsed, ghost: false })}
      </div>
    </>
  );
});

export default memo(BottomCard);
