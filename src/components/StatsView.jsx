// src/components/StatsView.jsx
//
// Section 9b's Stats tab. Reachable two ways -- BottomNav's Stats tab (now
// wired instead of disabled) and SideDrawer's "Statistics" footer link,
// which just calls the same switchTab('stats') App.jsx already uses for
// Daily/Classic.
//
// Interpretation call: the spec heading says "Full-screen view, sub-tabs:
// Daily | Classic," but the ASCII mockup below it shows both DAILY
// CHALLENGE and CLASSIC MODE blocks stacked with a divider, which reads
// more like "one scrollable page" than "two mutually-exclusive tabs." Went
// with the heading's literal words -- real sub-tab switching, one section
// visible at a time -- since mockups elsewhere in this spec are
// consistently approximate (see BottomCard.jsx's own header comment on its
// two gap-filling assumptions), and an actual toggle is the more useful
// interaction on a phone-width screen than a long stacked scroll.
//
// Pure presentational component -- all math lives in stats.js
// (computeDailyStats/computeClassicStats) so it stays testable independent
// of rendering, and no localStorage read/derivation logic is duplicated here.

import { useState, useMemo } from 'react';
import { CATEGORY_META } from '../config.js';
import {
  loadDailyStats,
  loadNormalStats,
  computeDailyStats,
  computeClassicStats,
} from '../game/stats.js';
import './StatsView.css';

const BUCKET_LABELS = ['0-5k', '5-10k', '10-15k', '15-20k', '20-25k'];

function Sparkline({ values }) {
  if (values.length === 0) return null;
  const w = 280;
  const h = 48;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = values.length > 1 ? i * step : w / 2;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg className="sv-sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DailySection() {
  const stats = useMemo(() => computeDailyStats(loadDailyStats()), []);

  if (stats.games === 0) {
    return (
      <div className="sv-empty">
        <p>No Daily Challenges played yet.</p>
        <p className="sv-empty-sub">Play today's challenge to start building your stats.</p>
      </div>
    );
  }

  const maxBucket = Math.max(...stats.distribution, 1);

  return (
    <>
      <div className="sv-stat-row">
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.games}</span>
          <span className="sv-stat-label">Games</span>
        </div>
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.streak}d</span>
          <span className="sv-stat-label">Streak</span>
        </div>
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.bestStreak}d</span>
          <span className="sv-stat-label">Best streak</span>
        </div>
      </div>

      <div className="sv-stat-row">
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.avgScore.toLocaleString()}</span>
          <span className="sv-stat-label">Avg score</span>
        </div>
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.bestScore.toLocaleString()}</span>
          <span className="sv-stat-label">Best score</span>
        </div>
      </div>

      <p className="sv-heading">Score distribution</p>
      <div className="sv-dist">
        {stats.distribution.map((count, i) => (
          <div className="sv-dist-row" key={BUCKET_LABELS[i]}>
            <span className="sv-dist-label">{BUCKET_LABELS[i]}</span>
            <div className="sv-dist-bar-track">
              <div className="sv-dist-bar" style={{ width: `${(count / maxBucket) * 100}%` }} />
            </div>
            <span className="sv-dist-count">{count}</span>
          </div>
        ))}
      </div>

      <div className="sv-stat-row">
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.avgDistPerGame.toLocaleString()} km</span>
          <span className="sv-stat-label">Avg dist / game</span>
        </div>
        <div className="sv-stat">
          <span className="sv-stat-value">
            {stats.avgDistPerGuess != null ? `${stats.avgDistPerGuess.toLocaleString()} km` : '--'}
          </span>
          <span className="sv-stat-label">Avg dist / guess</span>
        </div>
        <div className="sv-stat">
          <span className="sv-stat-value">
            {stats.bestGuess != null ? `${stats.bestGuess.toLocaleString()} km` : '--'}
          </span>
          <span className="sv-stat-label">Best guess</span>
        </div>
      </div>

      <p className="sv-heading">By category</p>
      <div className="sv-cat-grid">
        {Object.entries(stats.byCategory).map(([cat, score]) => (
          <div className="sv-cat-item" key={cat}>
            <span className="sv-cat-dot" style={{ background: CATEGORY_META[cat].color }} />
            <span className="sv-cat-label">{CATEGORY_META[cat].label}</span>
            <span className="sv-cat-score">{score != null ? score.toLocaleString() : '--'}</span>
          </div>
        ))}
      </div>

      <div className="sv-footer-row">
        <span>{stats.hints} hints</span>
        <span>{stats.timeouts} timeouts</span>
        <span>{stats.skips} skips</span>
      </div>
    </>
  );
}

function ClassicSection() {
  const stats = useMemo(() => computeClassicStats(loadNormalStats()), []);

  if (stats.rounds === 0) {
    return (
      <div className="sv-empty">
        <p>No Classic rounds played yet.</p>
        <p className="sv-empty-sub">Play a round of Classic to start building your stats.</p>
      </div>
    );
  }

  return (
    <>
      <div className="sv-stat-row">
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.rounds.toLocaleString()}</span>
          <span className="sv-stat-label">Total rounds</span>
        </div>
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.avgScore.toLocaleString()}</span>
          <span className="sv-stat-label">Avg score</span>
        </div>
      </div>

      <div className="sv-stat-row">
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.avgDist.toLocaleString()} km</span>
          <span className="sv-stat-label">Avg distance</span>
        </div>
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.bestGuess != null ? `${stats.bestGuess.toLocaleString()} km` : '--'}</span>
          <span className="sv-stat-label">Best guess</span>
        </div>
      </div>

      <p className="sv-heading">Score trend (last {stats.trend.length})</p>
      <Sparkline values={stats.trend} />
    </>
  );
}

export default function StatsView() {
  const [tab, setTab] = useState('daily');

  return (
    <div className="sv-screen">
      <h1 className="sv-title">Statistics</h1>

      <div className="sv-subtabs">
        <button
          type="button"
          className={`sv-subtab${tab === 'daily' ? ' sv-subtab-active' : ''}`}
          onClick={() => setTab('daily')}
        >
          Daily
        </button>
        <button
          type="button"
          className={`sv-subtab${tab === 'classic' ? ' sv-subtab-active' : ''}`}
          onClick={() => setTab('classic')}
        >
          Classic
        </button>
      </div>

      <div className="sv-body">
        {tab === 'daily' ? <DailySection /> : <ClassicSection />}
      </div>
    </div>
  );
}
