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

      <p className="sv-heading">By category</p>
      <ScoreHistogram
        distribution={DAILY.CATEGORIES.map((cat) => stats.byCategory[cat])}
        labels={DAILY.CATEGORIES.map((cat) => CATEGORY_META[cat].label)}
        format={(pct) => `${pct}%`}
        ariaLabel="Accuracy by category histogram"
      />
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
      </div>

      <div className="sv-body">
        {tab === 'daily' ? <DailySection /> : tab === 'classic' ? <ClassicSection /> : <BlitzSection />}
      </div>
    </div>
  );
}
