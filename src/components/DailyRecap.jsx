// src/components/DailyRecap.jsx
//
// Shown inside Leaderboard once the day's 5 rounds are done. Reconstructs
// the day's sites via getDailySites (same deterministic pick used to run the
// round) since stats_daily only persists category/distance/score, not the
// full site objects (see daily.js). Renders a small India outline with a
// pin per site, colored by CATEGORY_META, plus a name+state list.

import { getDailySites } from '../game/daily.js';
import { OUTLINE_VIEWBOX, INDIA_OUTLINE_PATH, projectToOutline } from '../data/indiaOutline.js';
import { CATEGORY_META, LS_KEYS } from '../config.js';
import './DailyRecap.css';

function PinMarker({ x, y, color }) {
  // Same teardrop shape as BottomCard's IconPin, scaled down and filled
  // solid (vs. outlined) to read clearly at mini-map size.
  const scale = 0.028;
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

export default function DailyRecap({ date, allSites }) {
  if (!allSites || allSites.length === 0) return null;

  const sites = getDailySites(date, allSites);
  const playerName = localStorage.getItem(LS_KEYS.NAME) || 'You';

  return (
    <div className="dr-card">
      <div className="dr-header">
        <div className="dr-brand">
          <span className="dr-wordmark">EcoGuesser</span>
          <span className="dr-pill">Daily</span>
        </div>
        <span className="dr-player">{playerName}</span>
      </div>

      <div className="dr-body">
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

        <svg
          className="dr-map"
          viewBox={`0 0 ${OUTLINE_VIEWBOX.width} ${OUTLINE_VIEWBOX.height}`}
          role="img"
          aria-label="Map of today's 5 sites"
        >
          <path d={INDIA_OUTLINE_PATH} className="dr-outline" />
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
    </div>
  );
}
