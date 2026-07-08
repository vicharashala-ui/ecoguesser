// src/components/DailyRecap.jsx
//
// Shown inside Leaderboard once the day's 5 rounds are done. Reconstructs
// the day's sites via getDailySites (same deterministic pick used to run the
// round) since stats_daily only persists category/distance/score, not the
// full site objects (see daily.js). Renders an India outline with a pin per
// site, colored by CATEGORY_META, a name+state legend, and (when today's
// stats_daily entry has recorded totals) a Total Score box above a Total
// Distance box. Logo is the same shared tiger mark used in Header.jsx.

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { getDailySites } from '../game/daily.js';
import { OUTLINE_VIEWBOX, INDIA_OUTLINE_PATH, INDIA_STATE_BORDERS_PATH, projectToOutline } from '../data/indiaOutline.js';
import { CATEGORY_META, LS_KEYS, formatSiteName } from '../config.js';
import { TIGER_MARK_VIEWBOX, TIGER_MARK_ASPECT, TIGER_MARK_PATH } from './tigerMarkPath.js';
import './DailyRecap.css';

const PIN_TEARDROP_PATH = 'M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z';

function PinMarker({ x, y, color }) {
  // Same teardrop shape as BottomCard's IconPin, scaled to read clearly at
  // the enlarged mini-map size (previously 0.028 -- a leftover scale tuned
  // for a much smaller map -- which rendered pins at a fraction of a pixel).
  // Bumped again from 0.5 -- the map panel itself was later shrunk (400px
  // -> 300px max-width) for mobile-fit reasons, which shrank these pins
  // right along with it, to the point of being hard to see.
  // Flat by design (no drop shadow) to match the share-card reference.
  const scale = 0.78;
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale}) translate(-12, -21)`}>
      <path d={PIN_TEARDROP_PATH} fill={color} stroke="#ffffff" strokeWidth="1.2" />
      <circle cx="12" cy="9" r="2.4" fill="#ffffff" />
    </g>
  );
}

// Small badge-sized version of the same teardrop, for the Total Distance
// stats box -- reuses PIN_TEARDROP_PATH rather than a second pin shape.
function PinBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d={PIN_TEARDROP_PATH} fill="#ffffff" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3h8v5a4 4 0 0 1-8 0V3Z" />
      <path d="M8 4H4v2a4 4 0 0 0 4 4" />
      <path d="M16 4h4v2a4 4 0 0 0-4 4" />
      <path d="M12 12v4" />
      <path d="M9 20h6" />
      <rect x="10" y="16" width="4" height="4" />
    </svg>
  );
}

function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Sized to roughly match the height of the title+date text stack beside it
// (previously a much smaller 22px mark confined inside a small corner
// badge -- now shown at full size directly next to the wordmark).
const LOGO_SIZE = 34;

// The card is always laid out at this fixed width, then visually scaled
// down to fit narrower screens via CSS transform. This keeps every
// element's relative position identical to desktop at any size, instead
// of re-flowing (stacking, wrapping) at smaller widths.
const CARD_DESIGN_WIDTH = 460;

/** Measures `outerRef`'s available width and `cardRef`'s natural (untransformed)
 *  height, and returns the scale + pixel dims for a wrapper that exactly fits
 *  the scaled-down card. offsetWidth/offsetHeight are unaffected by the card's
 *  own CSS transform, so this doesn't fight with the scale it's producing. */
function useCardScale(outerRef, cardRef) {
  const [dims, setDims] = useState({ scale: 1, width: CARD_DESIGN_WIDTH, height: 0 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const card = cardRef.current;
    if (!outer || !card) return undefined;

    const recalc = () => {
      const scale = Math.min(outer.clientWidth / CARD_DESIGN_WIDTH, 1) || 1;
      setDims({ scale, width: CARD_DESIGN_WIDTH * scale, height: card.offsetHeight * scale });
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(outer);
    ro.observe(card);
    return () => ro.disconnect();
  }, [outerRef, cardRef]);

  return dims;
}

const DailyRecap = forwardRef(function DailyRecap({ date, allSites, totalDist, totalScore }, ref) {
  const outerRef = useRef(null);
  const cardRef = useRef(null);
  const { scale, width, height } = useCardScale(outerRef, cardRef);

  // Merges the forwarded ref (Leaderboard's html-to-image capture target)
  // with the local ref this component needs for its own height measurement.
  const setCardRef = (node) => {
    cardRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  if (!allSites || allSites.length === 0) return null;

  const sites = getDailySites(date, allSites);
  const playerName = localStorage.getItem(LS_KEYS.NAME) || 'You';

  return (
    <div className="dr-outer" ref={outerRef}>
      <div className="dr-viewport" style={{ width, height }}>
        <div
          className="dr-card"
          ref={setCardRef}
          style={{ width: CARD_DESIGN_WIDTH, transform: `scale(${scale})` }}
        >
          <div className="dr-header">
            <div className="dr-logo-brand">
              <svg
                className="dr-logo"
                width={LOGO_SIZE}
                height={Math.round(LOGO_SIZE * TIGER_MARK_ASPECT)}
                viewBox={TIGER_MARK_VIEWBOX}
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  fill="#14532d"
                  stroke="#14532d"
                  strokeWidth="14"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  d={TIGER_MARK_PATH}
                />
              </svg>
              <div className="dr-brand-block">
                <div className="dr-brand">
                  <span className="dr-wordmark">EcoGuesser<sup className="eg-tm">™</sup></span>
                  <span className="dr-pill">Daily</span>
                </div>
                <span className="dr-tagline">
                  <span className="dr-tagline-word">Explore</span>
                  <span className="dr-tagline-dot">.</span>
                  <span className="dr-tagline-word">Learn</span>
                  <span className="dr-tagline-dot">.</span>
                  <span className="dr-tagline-word">Protect</span>
                </span>
              </div>
            </div>
            <div className="dr-player-block">
              <span className="dr-player">{playerName}</span>
              <span className="dr-date">{formatDisplayDate(date)}</span>
            </div>
          </div>

          <div className="dr-map-panel">
            <svg
              className="dr-map"
              viewBox={`0 0 ${OUTLINE_VIEWBOX.width} ${OUTLINE_VIEWBOX.height}`}
              role="img"
              aria-label="Map of today's 5 sites"
            >
              <path d={INDIA_OUTLINE_PATH} className="dr-outline" />
              <path d={INDIA_STATE_BORDERS_PATH} className="dr-state-borders" />
              {sites.map((site) => {
                const { x, y } = projectToOutline(site.centroid_lat, site.centroid_lng);
                return (
                  <PinMarker
                    key={site.id}
                    x={x}
                    y={y}
                    color={CATEGORY_META[site.category].color}
                  />
                );
              })}
            </svg>
          </div>

          <div className="dr-lower">
            <div className="dr-list-card">
              <ul className="dr-list">
                {sites.map((site) => (
                  <li key={site.id} className="dr-list-item">
                    <span
                      className="dr-dot"
                      style={{ background: CATEGORY_META[site.category].color }}
                    />
                    <span className="dr-site-text">
                      <span className="dr-site-name">{formatSiteName(site)}</span>
                      <span className="dr-site-state">{site.state.join(', ')}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {(totalScore != null || totalDist != null) && (
              <div className="dr-stats-col">
                {totalScore != null && (
                  <div className="dr-stats-box dr-stats-box--score">
                    <span className="dr-stats-icon dr-stats-icon--score"><TrophyIcon /></span>
                    <span className="dr-stats-label">Total Score</span>
                    <span className="dr-stats-value">{Math.round(totalScore).toLocaleString()}</span>
                    <span className="dr-stats-unit">pts</span>
                  </div>
                )}
                {totalDist != null && (
                  <div className="dr-stats-box dr-stats-box--distance">
                    <span className="dr-stats-icon dr-stats-icon--distance"><PinBadgeIcon /></span>
                    <span className="dr-stats-label">Total Distance</span>
                    <span className="dr-stats-value">{Math.round(totalDist).toLocaleString()}</span>
                    <span className="dr-stats-unit">km</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default DailyRecap;
