import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { DailyMap } from './components/DailyMap.jsx';
import BottomNav from './components/BottomNav.jsx';
import DailySummary from './components/DailySummary.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import Header from './components/Header.jsx';
import SideDrawer from './components/SideDrawer.jsx';
import StatsView from './components/StatsView.jsx';
import InfoModal from './components/InfoModal.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import { recordDailyResult, hasPlayedToday } from './game/stats.js';
import { DEFAULT_FILTERS } from './utils/filters.js';
import { LS_KEYS } from './config.js';

// Code-split, not eagerly imported: DailyMap (default tab) already pulls in
// MapLibre on first paint, so these buy nothing there -- but Classic/Blitz
// only ever mount after their tab is first activated (see
// classicEverActivated/blitzEverActivated below), so deferring their
// module fetch to that moment keeps them out of the initial bundle.
const ClassicMap = lazy(() => import('./components/ClassicMap.jsx'));
const BlitzMap = lazy(() => import('./components/BlitzMap.jsx'));

const screenStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f8f6f1',
  textAlign: 'center',
  padding: '2rem',
};

const buttonStyle = {
  padding: '0.75rem 1.5rem',
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '1rem',
};

export default function App() {
  const [allSites, setAllSites] = useState([]);
  const [sitesError, setSitesError] = useState(false);

  // Tab-switching machinery. classicEverActivated is a ref (not state)
  // deliberately, so flipping it doesn't cost a second render -- by the
  // time switchTab's setActiveTab triggers the real render, the ref is
  // already true and ClassicMap mounts in that same pass.
  //
  // activeTab also takes 'stats', alongside 'daily'/'classic'/'blitz' -- it
  // needs no entry in classicEverActivated/the resize RAF below since
  // StatsView isn't a map.
  const classicEverActivated = useRef(false);
  const blitzEverActivated = useRef(false);
  const [activeTab, setActiveTab] = useState('daily');
  const classicMapRef = useRef(null);
  const dailyMapRef = useRef(null);
  const blitzMapRef = useRef(null);

  // Daily sub-flow: 'round' (DailyMap) -> 'summary' (auto-submit) ->
  // 'leaderboard'. Starts at 'leaderboard' if today's already been played --
  // checked against localStorage, not just in-session state, so a
  // returning player who reloads mid-day lands on the leaderboard instead
  // of a fresh round.
  const [dailyPhase, setDailyPhase] = useState(() => (hasPlayedToday() ? 'leaderboard' : 'round'));
  const [dailySummaryData, setDailySummaryData] = useState(null); // { totalPts, totalDist }
  const [dailyLeaderboardData, setDailyLeaderboardData] = useState(null); // { top10, rank, banner } | null

  // drawerOpen is global (both tabs); classicFilters affects ClassicMap's
  // AND BlitzMap's site pools. Daily's pool is fixed and untouched by this.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [classicFilters, setClassicFilters] = useState(DEFAULT_FILTERS);
  // Lifted the same way as classicFilters, so SideDrawer's DIFFICULTY
  // buttons and ClassicMap's useMapState-backed setter can both stay
  // controlled by one source of truth. Seeded from localStorage directly
  // (not via useMapState, which doesn't exist yet at this point in the
  // tree) so the drawer shows the right button highlighted even before
  // ClassicMap has ever mounted.
  const [classicDifficulty, setClassicDifficulty] = useState(
    () => localStorage.getItem(LS_KEYS.DIFFICULTY) || 'normal'
  );

  // null when closed, else one of 'howtoplay'/'about'/'privacy'. (Feedback
  // isn't part of this -- it's a self-contained box inside SideDrawer.jsx,
  // same as Player Name, with no App.jsx-level state at all.)
  const [infoModalVariant, setInfoModalVariant] = useState(null);

  function switchTab(newTab) {
    if (newTab === activeTab) return;

    if (newTab === 'classic') classicEverActivated.current = true;
    if (newTab === 'blitz') blitzEverActivated.current = true;
    setActiveTab(newTab);
    // Neither map redraws its canvas while display:none, so each becomes
    // mis-sized the moment it's shown again unless resized post-switch.
    requestAnimationFrame(() => {
      if (newTab === 'classic' && classicMapRef.current) classicMapRef.current.resize();
      if (newTab === 'daily' && dailyMapRef.current) dailyMapRef.current.resize();
      if (newTab === 'blitz' && blitzMapRef.current) blitzMapRef.current.resize();
    });
  }

  // DailyMap's round 5 hands off here. Stats are written once, right at
  // the real completion -- not inside DailySummary itself, which can
  // remount and must not re-trigger the streak math on a second mount.
  function handleDailyComplete(results) {
    const totalPts = results.reduce((sum, r) => sum + r.finalScore, 0);
    const totalDist = results.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0);
    recordDailyResult(results, totalPts, totalDist);
    setDailySummaryData({ totalPts, totalDist });
    setDailyPhase('summary');
  }

  function handleSummaryDone(leaderboardPayload) {
    setDailyLeaderboardData(leaderboardPayload);
    setDailyPhase('leaderboard');
  }

  function loadSites() {
    import('./data/protected-areas.json')
      .then(m => setAllSites(m.default))
      .catch(() => setSitesError(true));
  }

  useEffect(() => { loadSites(); }, []);

  if (sitesError) {
    return (
      <div className="eg-app-shell-height" style={screenStyle}>
        <div style={{ fontSize: '32px', fontWeight: 800, color: '#16a34a', marginBottom: '1rem' }}>
          EcoGuesser<sup style={{ fontSize: '0.4em', fontWeight: 700, verticalAlign: 'super', marginLeft: '0.1em' }}>™</sup>
        </div>
        <p style={{ color: '#111827', marginBottom: '0.25rem' }}>Couldn't load game data.</p>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Check your connection and try again.</p>
        <button onClick={() => { setSitesError(false); loadSites(); }} style={buttonStyle}>
          Try again
        </button>
      </div>
    );
  }

  if (allSites.length === 0) {
    return (
      <div className="eg-app-shell-height" style={screenStyle}>
        <div style={{ fontSize: '32px', fontWeight: 800, color: '#16a34a', marginBottom: '0.5rem' }}>
          EcoGuesser<sup style={{ fontSize: '0.4em', fontWeight: 700, verticalAlign: 'super', marginLeft: '0.1em' }}>™</sup>
        </div>
        <p style={{ fontSize: '18px', fontWeight: 400, color: '#6b7280', marginBottom: '1.5rem' }}>
          India's Protected Areas
        </p>
        <div className="eg-spinner" />
      </div>
    );
  }

  return (
    <div className="eg-app-shell-height" style={{ position: 'relative', width: '100vw' }}>
      {/* DailyMap mounts immediately; ClassicMap/BlitzMap only after their
          tab is first activated, and all stay mounted afterward --
          display:none, not unmount, so MapLibre never recreates its WebGL
          context on every tab switch. */}
      {classicEverActivated.current && (
        <Suspense fallback={null}>
          <ClassicMap
            mapRef={classicMapRef}
            sites={allSites}
            filters={classicFilters}
            difficulty={classicDifficulty}
            style={{ position: 'absolute', inset: 0, display: activeTab === 'classic' ? 'block' : 'none' }}
          />
        </Suspense>
      )}
      {blitzEverActivated.current && (
        <Suspense fallback={null}>
          <BlitzMap
            mapRef={blitzMapRef}
            sites={allSites}
            filters={classicFilters}
            style={{ position: 'absolute', inset: 0, display: activeTab === 'blitz' ? 'block' : 'none' }}
          />
        </Suspense>
      )}
      <DailyMap
        mapRef={dailyMapRef}
        sites={allSites}
        onComplete={handleDailyComplete}
        active={activeTab === 'daily'}
        style={{
          position: 'absolute',
          inset: 0,
          display: activeTab === 'daily' && dailyPhase === 'round' ? 'block' : 'none',
        }}
      />
      {activeTab === 'daily' && dailyPhase === 'summary' && dailySummaryData && (
        <DailySummary
          totalPts={dailySummaryData.totalPts}
          totalDist={dailySummaryData.totalDist}
          onDone={handleSummaryDone}
          onPlayClassic={() => switchTab('classic')}
          onPlayBlitz={() => switchTab('blitz')}
        />
      )}
      {activeTab === 'daily' && dailyPhase === 'leaderboard' && (
        <Leaderboard
          data={dailyLeaderboardData}
          onPlayClassic={() => switchTab('classic')}
          onPlayBlitz={() => switchTab('blitz')}
          allSites={allSites}
        />
      )}
      {activeTab === 'stats' && <StatsView />}
      <BottomNav activeTab={activeTab} onTabChange={switchTab} />
      <Header onMenuClick={() => setDrawerOpen(true)} />
      <InstallPrompt />
      {infoModalVariant && (
        <InfoModal variant={infoModalVariant} onClose={() => setInfoModalVariant(null)} />
      )}
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sites={allSites}
        filters={classicFilters}
        onApplyFilters={setClassicFilters}
        showFilters={activeTab === 'classic' || activeTab === 'blitz'}
        showDifficulty={activeTab === 'classic'}
        difficulty={classicDifficulty}
        onSetDifficulty={setClassicDifficulty}
        onNavigate={setInfoModalVariant}
      />
    </div>
  );
}
