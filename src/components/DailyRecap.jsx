// src/components/DailyRecap.jsx
//
// Shown inside Leaderboard once the day's 5 rounds are done. Reconstructs
// the day's sites via getDailySites (same deterministic pick used to run the
// round) since stats_daily only persists category/distance/score, not the
// full site objects (see daily.js). Renders an India outline with a pin per
// site, colored by CATEGORY_META, a name+state legend, and (when today's
// stats_daily entry has recorded totals) a Total Score box above a Total
// Distance box. Logo is the same shared tiger mark used in Header.jsx.

import { forwardRef } from 'react';
import { getDailySites } from '../game/daily.js';
import { OUTLINE_VIEWBOX, INDIA_OUTLINE_PATH, INDIA_STATE_BORDERS_PATH, projectToOutline } from '../data/indiaOutline.js';
import { CATEGORY_META, LS_KEYS } from '../config.js';
import { TIGER_MARK_VIEWBOX, TIGER_MARK_ASPECT, TIGER_MARK_PATH } from './tigerMarkPath.js';
import './DailyRecap.css';

function PinMarker({ x, y, color }) {
  // Same teardrop shape as BottomCard's IconPin, scaled to read clearly at
  // the enlarged mini-map size (previously 0.028 -- a leftover scale tuned
  // for a much smaller map -- which rendered pins at a fraction of a pixel).
  const scale = 0.5;
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale}) translate(-12, -21)`}>
      <path
        d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z"
        fill={color}
        stroke="#ffffff"
        strokeWidth="1.2"
      />
      <circle cx="12" cy="9" r="2.4" fill="#ffffff" />
    </g>
  );
}

function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const LOGO_SIZE = 22;

const DailyRecap = forwardRef(function DailyRecap({ date, allSites, totalDist, totalScore }, ref) {
  if (!allSites || allSites.length === 0) return null;

  const sites = getDailySites(date, allSites);
  const playerName = localStorage.getItem(LS_KEYS.NAME) || 'You';

  return (
    <div className="dr-card" ref={ref}>
      <div className="dr-header">
        <div className="dr-brand-block">
          <div className="dr-brand">
            <svg
              className="dr-logo"
              width={LOGO_SIZE}
              height={Math.round(LOGO_SIZE * TIGER_MARK_ASPECT)}
              viewBox={TIGER_MARK_VIEWBOX}
              aria-hidden="true"
            >
              <path fillRule="evenodd" d={TIGER_MARK_PATH} />
            </svg>
            <span className="dr-wordmark">EcoGuesser</span>
            <span className="dr-pill">Daily</span>
          </div>
          <span className="dr-date">{formatDisplayDate(date)}</span>
        </div>
        <span className="dr-player">{playerName}</span>
      </div>

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

      <div className="dr-lower">
        <ul className="dr-list">
          {sites.map((site) => (
            <li key={site.id} className="dr-list-item">
              <span
                className="dr-dot"
                style={{ background: CATEGORY_META[site.category].color }}
              />
              <span className="dr-site-text">
                <span className="dr-site-name">{site.name}</span>
                <span className="dr-site-state">{site.state.join(', ')}</span>
              </span>
            </li>
          ))}
        </ul>

        {(totalScore != null || totalDist != null) && (
          <div className="dr-stats-col">
            {totalScore != null && (
              <div className="dr-stats-box">
                <span className="dr-stats-label">Total Score</span>
                <span className="dr-stats-value">{Math.round(totalScore).toLocaleString()}</span>
                <span className="dr-stats-unit">pts</span>
              </div>
            )}
            {totalDist != null && (
              <div className="dr-stats-box">
                <span className="dr-stats-label">Total Distance</span>
                <span className="dr-stats-value">{Math.round(totalDist).toLocaleString()}</span>
                <span className="dr-stats-unit">km</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default DailyRecap;
