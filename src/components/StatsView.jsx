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
  computeCollectionStats,
} from '../game/stats.js';
import { computeAchievements } from '../game/achievements.js';
import AchievementIcon from './AchievementIcon.jsx';
import './StatsView.css';

const BUCKET_LABELS = ['0-5k', '5-10k', '10-15k', '15-20k', '20-25k'];

// Tab order + per-section accent/tint, read by the sliding subtab indicator
// (item 6) and by .sv-heading/.sv-empty-icon's CSS custom props (items 7,
// 8) -- one map so the indicator and every chip/icon in a section always
// agree on its color instead of four hardcoded CSS class variants drifting
// out of sync with each other.
//
// dark* pair: only for --sv-accent/--sv-tint (StatsView.css picks between
// them via html[data-theme='dark'], see .sv-body there) -- the indicator
// pill below keeps using the plain `accent` value regardless of theme,
// since it's a filled swatch with white text on top (readable against
// either), not flat text on the page background the way --sv-accent is.
// classic/awards get a brighter darkAccent because their light-mode hex
// only clears ~3:1 against a dark page (fails 4.5:1 text contrast);
// daily/blitz already clear 5:1+ so their dark values just repeat as-is.
const TABS = [
  { id: 'daily', label: 'Daily', accent: '#65a30d', tint: '#f7fee7', darkAccent: '#65a30d', darkTint: 'rgba(101, 163, 13, 0.16)' },
  { id: 'classic', label: 'Classic', accent: '#2563eb', tint: '#eff6ff', darkAccent: '#60a5fa', darkTint: 'rgba(96, 165, 250, 0.16)' },
  { id: 'blitz', label: 'Blitz', accent: '#f59e0b', tint: '#fffbeb', darkAccent: '#f59e0b', darkTint: 'rgba(245, 158, 11, 0.16)' },
  { id: 'awards', label: 'Awards', accent: '#9333ea', tint: '#faf5ff', darkAccent: '#c084fc', darkTint: 'rgba(192, 132, 252, 0.16)' },
];

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

// Small reusable stat tile -- centralizes the icon+value+label markup so
// the icon chip (item 4) doesn't mean repeating <AchievementIcon> across
// every one of the ~15 stat cards across Daily/Classic/Blitz below.
function StatCard({ icon, value, label }) {
  return (
    <div className="sv-stat">
      <div className="sv-stat-icon">
        <AchievementIcon name={icon} size={16} />
      </div>
      <span className="sv-stat-value">{value}</span>
      <span className="sv-stat-label">{label}</span>
    </div>
  );
}

function DailySection() {
  const stats = useMemo(() => computeDailyStats(loadDailyStats()), []);

  if (stats.games === 0) {
    return (
      <div className="sv-empty">
        <div className="sv-empty-icon"><AchievementIcon name="compass" size={30} /></div>
        <p>No Daily Challenges played yet.</p>
        <p className="sv-empty-sub">Play today's challenge to start building your stats.</p>
      </div>
    );
  }

  return (
    <>
      <div className="sv-stat-row">
        <StatCard icon="compass" value={stats.games} label="Games" />
        <StatCard icon="flame" value={`${stats.streak}d`} label="Streak" />
        <StatCard icon="trophy" value={`${stats.bestStreak}d`} label="Best streak" />
      </div>

      <div className="sv-stat-row">
        <StatCard icon="target" value={stats.avgScore.toLocaleString()} label="Avg score" />
        <StatCard icon="star" value={stats.bestScore.toLocaleString()} label="Best score" />
      </div>

      <p className="sv-heading">Score distribution</p>
      <p className="sv-subheading">Number of Daily Challenges finishing in each score range</p>
      <ScoreHistogram distribution={stats.distribution} labels={BUCKET_LABELS} />

      <div className="sv-stat-row">
        <StatCard icon="compass" value={`${stats.avgDistPerGame.toLocaleString()} km`} label="Avg dist / game" />
        <StatCard
          icon="compass"
          value={stats.avgDistPerGuess != null ? `${stats.avgDistPerGuess.toLocaleString()} km` : '--'}
          label="Avg dist / guess"
        />
        <StatCard
          icon="bolt"
          value={stats.bestGuess != null ? `${stats.bestGuess.toLocaleString()} km` : '--'}
          label="Best guess"
        />
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
        <div className="sv-empty-icon"><AchievementIcon name="flag" size={30} /></div>
        <p>No Classic rounds played yet.</p>
        <p className="sv-empty-sub">Play a round of Classic to start building your stats.</p>
      </div>
    );
  }

  return (
    <>
      <div className="sv-stat-row">
        <StatCard icon="flag" value={stats.rounds.toLocaleString()} label="Total rounds" />
        <StatCard icon="target" value={stats.avgScore.toLocaleString()} label="Avg score" />
      </div>

      <div className="sv-stat-row">
        <StatCard icon="compass" value={`${stats.avgDist.toLocaleString()} km`} label="Avg distance" />
        <StatCard
          icon="bolt"
          value={stats.bestGuess != null ? `${stats.bestGuess.toLocaleString()} km` : '--'}
          label="Best guess"
        />
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
        <div className="sv-empty-icon"><AchievementIcon name="bolt" size={30} /></div>
        <p>No Blitz rounds played yet.</p>
        <p className="sv-empty-sub">Play a round of Blitz to start building your stats.</p>
      </div>
    );
  }

  return (
    <>
      <div className="sv-stat-row">
        <StatCard icon="flag" value={stats.rounds.toLocaleString()} label="Rounds" />
        <StatCard icon="target" value={`${stats.accuracy}%`} label="Accuracy" />
        <StatCard icon="flame" value={stats.bestStreak} label="Best streak" />
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

// "N / 837 explored" completionist counter -- see stats.js's
// computeCollectionStats. Rendered at the top of the Awards tab, above the
// achievement badges, since it's the headline "collection" stat the rest
// of the tab builds on. Shares AchievementsSection's rAF-delayed `grown`
// flip (passed in as a prop) so its progress bar animates in alongside the
// achievements-unlocked one instead of on its own separate timer.
function CollectionSection({ sites, grown }) {
  const stats = useMemo(() => computeCollectionStats(sites), [sites]);

  // `sites` is [] until App.jsx's /protected-areas.json fetch resolves --
  // rendering "0 / 0 explored" in that brief window would read as broken,
  // so this section just doesn't render until real site data has arrived.
  if (stats.total === 0) return null;

  const pct = Math.round((stats.seen / stats.total) * 100);

  return (
    <>
      <p className="sv-heading">Site Collection</p>
      <p className="sv-subheading">Distinct protected areas you've encountered in Classic or Blitz</p>
      <div className="sv-ach-summary">
        <div className="sv-ach-summary-top">
          <span className="sv-ach-summary-count">{stats.seen} / {stats.total}</span>
          <span className="sv-ach-summary-label">explored</span>
        </div>
        <div className="sv-ach-summary-track">
          <div className="sv-ach-summary-fill" style={{ width: grown ? `${pct}%` : '0%' }} />
        </div>
      </div>
      <div className="sv-cat-grid">
        {DAILY.CATEGORIES.map((cat) => (
          <div className="sv-cat-item" key={cat}>
            <span className="sv-cat-dot" style={{ background: CATEGORY_META[cat].color }} />
            <span className="sv-cat-label">{CATEGORY_META[cat].label}</span>
            <span className="sv-cat-score">{stats.byCategory[cat].seen} / {stats.byCategory[cat].total}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// Awards sub-tab. Purely derived from the OTHER three modes' already-
// persisted stats (see achievements.js) -- no separate "achievements"
// localStorage entry, so nothing here needs to be written back on unlock.
function AchievementsSection({ sites }) {
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
      <CollectionSection sites={sites} grown={grown} />

      <p className="sv-heading">Achievements</p>
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

export default function StatsView({ sites = [] }) {
  const [tab, setTab] = useState('daily');
  const activeIndex = TABS.findIndex((t) => t.id === tab);
  const active = TABS[activeIndex];

  return (
    <div className="sv-screen">
      <h1 className="sv-title">Statistics</h1>

      <div className="sv-subtabs">
        {/* Sliding pill behind the buttons -- position comes from
            activeIndex (tabs are equal-width, so index*100% lines it up
            with no DOM measuring needed) and its color previews the
            section's accent the body below is about to switch to. */}
        <div
          className="sv-subtabs-indicator"
          style={{ transform: `translateX(${activeIndex * 100}%)`, background: active.accent }}
        />
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`sv-subtab${tab === t.id ? ' sv-subtab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className="sv-body"
        // Exposes this section's accent/tint to .sv-heading and
        // .sv-empty-icon via CSS custom props, instead of four
        // near-duplicate per-tab class variants in the CSS. Light/dark
        // exposed separately (not as a single --sv-accent/--sv-tint) so
        // StatsView.css's html[data-theme='dark'] rule can pick the dark
        // pair via the cascade -- it can't override an inline style's own
        // custom property directly, since inline always wins a same-name
        // conflict regardless of external selector specificity.
        style={{
          '--sv-accent-light': active.accent,
          '--sv-accent-dark': active.darkAccent,
          '--sv-tint-light': active.tint,
          '--sv-tint-dark': active.darkTint,
        }}
      >
        {tab === 'daily' ? <DailySection />
          : tab === 'classic' ? <ClassicSection />
          : tab === 'blitz' ? <BlitzSection />
          : <AchievementsSection sites={sites} />}
      </div>
    </div>
  );
}
