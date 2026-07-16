// src/components/StatsView.jsx
// Stats tab, reachable via BottomNav. Sub-tabs (Daily | Classic) switch
// between two stacked sections rather than a long scroll -- more useful on
// a phone-width screen.
//
// Pure presentational component -- all math lives in stats.js
// (computeDailyStats/computeClassicStats) so it stays testable independent
// of rendering, and no localStorage read/derivation logic is duplicated here.

import { useState, useMemo, useEffect } from 'react';
import { CATEGORY_META, DAILY } from '../config.js';
import {
  loadDailyStats,
  loadNormalStats,
  loadBlitzStats,
  computeDailyStats,
  computeClassicStats,
  computeBlitzStats,
} from '../game/stats.js';
import { computeAchievements } from '../game/achievements.js';
import './StatsView.css';

const BUCKET_LABELS = ['0-5k', '5-10k', '10-15k', '15-20k', '20-25k'];

// Vertical bar chart shared by Daily's score distribution and by Classic's
// and Blitz's "by category" breakdowns -- all three use the same shared
// green fill (StatsView.css .sv-hist-bar). Bars grow in on mount via a
// one-shot rAF-delayed height change -- the height is set to 0 on first
// render, then flipped to its real value a frame later so the CSS
// `transition: height` in StatsView.css actually has something to animate
// between, instead of the final height just appearing instantly on first
// paint.
function ScoreHistogram({ distribution, labels, format = (v) => v, ariaLabel = 'Score distribution histogram' }) {
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const max = Math.max(...distribution.map((v) => v ?? 0), 1);

  return (
    <div className="sv-hist" role="img" aria-label={ariaLabel}>
      {distribution.map((value, i) => (
        <div className="sv-hist-col" key={labels[i]}>
          <span className={`sv-hist-count${!value ? ' sv-hist-count-zero' : ''}`}>
            {value == null ? '--' : format(value)}
          </span>
          <div className="sv-hist-bar-track">
            <div
              className="sv-hist-bar"
              style={{ height: grown ? `${((value ?? 0) / max) * 100}%` : '0%' }}
            />
          </div>
          {/* Category labels vary in length ("Ramsar Site" vs "Wildlife
              Sanctuary"), so without a fixed reservation the shorter ones
              wrap to a single line while longer ones wrap to two, leaving
              less label height above them and shifting that bar's track
              (and so its visible bottom edge) relative to its neighbors.
              StatsView.css reserves 2 lines' worth of height on every
              .sv-hist-label unconditionally -- Daily's score-bucket labels
              are always short/one-line, so the extra reserved space is a
              no-op for that chart, but it keeps Classic/Blitz's
              category-label bars level regardless of which labels happen
              to wrap. This lives on the base class (not a prop-gated
              modifier) so it can't silently break if some other prop
              (e.g. a color feature) it used to be tied to is ever removed. */}
          <span className="sv-hist-label">{labels[i]}</span>
        </div>
      ))}
    </div>
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
      <p className="sv-subheading">Number of Daily Challenges finishing in each score range</p>
      <ScoreHistogram distribution={stats.distribution} labels={BUCKET_LABELS} />

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
      <p className="sv-subheading">Your average distance from that category's site, across all Daily Challenges played</p>
      <div className="sv-cat-grid">
        {Object.entries(stats.byCategory).map(([cat, dist]) => (
          <div className="sv-cat-item" key={cat}>
            <span className="sv-cat-dot" style={{ background: CATEGORY_META[cat].color }} />
            <span className="sv-cat-label">{CATEGORY_META[cat].label}</span>
            <span className="sv-cat-score">{dist != null ? `${dist.toLocaleString()} km` : '--'}</span>
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

      <p className="sv-heading">Avg distance by category</p>
      <ScoreHistogram
        distribution={DAILY.CATEGORIES.map((cat) => stats.byCategory[cat])}
        labels={DAILY.CATEGORIES.map((cat) => CATEGORY_META[cat].label)}
        format={(km) => `${km} km`}
        ariaLabel="Average distance by category histogram"
      />
    </>
  );
}

function BlitzSection() {
  const stats = useMemo(() => computeBlitzStats(loadBlitzStats()), []);

  if (stats.rounds === 0) {
    return (
      <div className="sv-empty">
        <p>No Blitz rounds played yet.</p>
        <p className="sv-empty-sub">Play a round of Blitz to start building your stats.</p>
      </div>
    );
  }

  return (
    <>
      <div className="sv-stat-row">
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.rounds.toLocaleString()}</span>
          <span className="sv-stat-label">Rounds</span>
        </div>
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.accuracy}%</span>
          <span className="sv-stat-label">Accuracy</span>
        </div>
        <div className="sv-stat">
          <span className="sv-stat-value">{stats.bestStreak}</span>
          <span className="sv-stat-label">Best streak</span>
        </div>
      </div>

      <p className="sv-heading">Accuracy by category</p>
      <ScoreHistogram
        distribution={DAILY.CATEGORIES.map((cat) => stats.byCategory[cat])}
        labels={DAILY.CATEGORIES.map((cat) => CATEGORY_META[cat].label)}
        format={(pct) => `${pct}%`}
        ariaLabel="Accuracy by category histogram"
      />
    </>
  );
}

// Shape names rendered per achievement.icon (see achievements.js). Kept
// separate from the achievement data itself so achievements.js stays
// render-agnostic / unit-testable without a DOM. Stroke-based, viewBox
// 0 0 24 24 -- same inline-SVG convention as BottomNav.jsx/BottomCard.jsx
// (currentColor so locked/unlocked coloring is driven entirely by the CSS
// class on the wrapping .sv-ach-icon, not a prop here).
function AchievementIcon({ name, size = 24 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  switch (name) {
    case 'flag':
      return (
        <svg {...common}>
          <path d="M5 21V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5 4h13l-3 4 3 4H5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'flame':
      return (
        <svg {...common}>
          <path
            d="M12 21c-3.5 0-6-2.2-6-5.6 0-2 1-3.6 1-3.6s.4 1.4 1.4 2c-.3-2.6.6-5.4 3-7.3.4 1.8 1.3 2.8 2.3 3.7 1.7 1.5 2.3 3.1 2.3 5.2 0 3.4-2.5 5.6-4 5.6Z"
            stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
          />
        </svg>
      );
    case 'trophy':
      return (
        <svg {...common}>
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 13v3.5M9 20h6M9.5 20c0-1.8 1-2.3 2.5-2.3s2.5.5 2.5 2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <path
            d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3Z"
            stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
          />
        </svg>
      );
    case 'crown':
      return (
        <svg {...common}>
          <path d="M4 18h16l-1.3-8-4 3.2L12 8l-2.7 5.2-4-3.2L4 18Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M5 20.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'leaf':
      return (
        <svg {...common}>
          <path d="M5 19c8 1 13-4 14-14-9 0-14 5-14 14Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M6 18C10 13 13 10 17 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'target':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="m14.8 9.2-1.6 4.4-4.4 1.6 1.6-4.4 4.4-1.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...common}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

const ACHIEVEMENT_GROUPS = [
  { mode: 'daily', label: 'Daily' },
  { mode: 'classic', label: 'Classic' },
  { mode: 'blitz', label: 'Blitz' },
  { mode: 'meta', label: 'Overall' },
];

// One badge card. `grown` is lifted to AchievementsSection (not a per-badge
// useState) so every progress bar on the tab shares a single rAF-delayed
// 0%->real% flip -- same mount-grow trick as ScoreHistogram above, just
// hoisted since a badge grid can have a dozen bars animating at once.
function AchievementBadge({ achievement, grown }) {
  const { title, description, icon, unlocked, progress } = achievement;
  const pct = progress ? Math.min(100, (progress.current / progress.target) * 100) : null;

  return (
    <div className={`sv-ach-badge${unlocked ? ' sv-ach-badge-unlocked' : ''}`}>
      <div className="sv-ach-icon">
        <AchievementIcon name={icon} />
      </div>
      <div className="sv-ach-body">
        <div className="sv-ach-title-row">
          <span className="sv-ach-title">{title}</span>
          {unlocked && <span className="sv-ach-check" aria-hidden="true">✓</span>}
        </div>
        <span className="sv-ach-desc">{description}</span>
        {!unlocked && progress && (
          <>
            <div className="sv-ach-progress-track">
              <div
                className="sv-ach-progress-fill"
                style={{ width: grown ? `${pct}%` : '0%' }}
              />
            </div>
            <span className="sv-ach-progress-label">
              {Math.min(progress.current, progress.target).toLocaleString()} / {progress.target.toLocaleString()}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// Awards sub-tab. Purely derived from the OTHER three modes' already-
// persisted stats (see achievements.js) -- no separate "achievements"
// localStorage entry, so nothing here needs to be written back on unlock.
function AchievementsSection() {
  const achievements = useMemo(() => computeAchievements(), []);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const summaryPct = achievements.length ? Math.round((unlockedCount / achievements.length) * 100) : 0;

  return (
    <>
      <div className="sv-ach-summary">
        <div className="sv-ach-summary-top">
          <span className="sv-ach-summary-count">{unlockedCount} / {achievements.length}</span>
          <span className="sv-ach-summary-label">unlocked</span>
        </div>
        <div className="sv-ach-summary-track">
          <div className="sv-ach-summary-fill" style={{ width: grown ? `${summaryPct}%` : '0%' }} />
        </div>
      </div>

      {ACHIEVEMENT_GROUPS.map(({ mode, label }) => {
        const items = achievements.filter((a) => a.mode === mode);
        if (items.length === 0) return null;
        return (
          <div key={mode}>
            <p className="sv-heading">{label}</p>
            <div className="sv-ach-grid">
              {items.map((a) => (
                <AchievementBadge key={a.id} achievement={a} grown={grown} />
              ))}
            </div>
          </div>
        );
      })}
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
        <button
          type="button"
          className={`sv-subtab${tab === 'blitz' ? ' sv-subtab-active' : ''}`}
          onClick={() => setTab('blitz')}
        >
          Blitz
        </button>
        <button
          type="button"
          className={`sv-subtab${tab === 'awards' ? ' sv-subtab-active' : ''}`}
          onClick={() => setTab('awards')}
        >
          Awards
        </button>
      </div>

      <div className="sv-body">
        {tab === 'daily' ? <DailySection />
          : tab === 'classic' ? <ClassicSection />
          : tab === 'blitz' ? <BlitzSection />
          : <AchievementsSection />}
      </div>
    </div>
  );
}
