import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import BottomNav from './components/BottomNav.jsx';
import Header from './components/Header.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import AchievementToast from './components/AchievementToast.jsx';
import MapLoadingOverlay from './components/MapLoadingOverlay.jsx';
import { recordDailyResult, hasPlayedToday } from './game/stats.js';
import { warmSharedMapData } from './hooks/sharedMapData.js';
import { useAchievementUnlocks } from './hooks/useAchievementUnlocks.js';
import { DEFAULT_FILTERS } from './utils/filters.js';

// All three map components are now code-split, including DailyMap (the
// default tab) -- it used to be imported eagerly on the reasoning that it
// "needs MapLibre on first paint anyway", but that's only true once it
// mounts, not for the app shell itself. Splitting it out means the splash
// screen (index.html/main.jsx) can hand off to this shell -- and this
// shell's own loading feedback (MapLoadingOverlay below, as DailyMap's
// Suspense fallback) -- without waiting on the ~273KB gzip MapLibre chunk
// first. Total bytes/requests are unchanged; only the visible split
// between "static splash logo" and "spinner + loading text" moves earlier,
// since the shell bundle mounts sooner. MapLoadingOverlay itself has no
// MapLibre dependency (BrandSpinner -> tigerMarkPath.js only), so importing
// it eagerly here for the fallback doesn't undo the split.
const DailyMap = lazy(() =>
  import('./components/DailyMap.jsx').then((m) => ({ default: m.DailyMap }))
);
const ClassicMap = lazy(() => import('./components/ClassicMap.jsx'));
const BlitzMap = lazy(() => import('./components/BlitzMap.jsx'));

// None of these render on first paint either -- DailySummary/Leaderboard
// only appear after a Daily round completes, StatsView only on the Stats
// tab, InfoModal only once opened from SideDrawer, and SideDrawer only once
// the hamburger is tapped. Leaderboard also drags in html-to-image (the
// recap share-card export) -- deferring it keeps that out of the initial
// bundle too. InstallPrompt stays eager (imported above): it needs to
// attach the beforeinstallprompt listener immediately on load to catch and
// stash the event, so it can't wait on a lazy chunk fetch.
const DailySummary = lazy(() => import('./components/DailySummary.jsx'));
const Leaderboard = lazy(() => import('./components/Leaderboard.jsx'));
const StatsView = lazy(() => import('./components/StatsView.jsx'));
const InfoModal = lazy(() => import('./components/InfoModal.jsx'));
const SideDrawer = lazy(() => import('./components/SideDrawer.jsx'));

const screenStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--eg-cream, #f8f6f1)',
  textAlign: 'center',
  padding: '2rem',
};

const buttonStyle = {
  padding: '0.75rem 1.5rem',
  background: 'var(--eg-brand, #227743)',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '1rem',
};

export default function App() {
  const [allSites, setAllSites] = useState([]);
  const [sitesError, setSitesError] = useState(false);
  const [dailySites, setDailySites] = useState(null); // today's 5 sites, from /api/daily-manifest

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
  // Same deferred-mount pattern as classicEverActivated -- SideDrawer is
  // lazy-loaded (see top of file), and since it's otherwise unconditionally
  // in the tree (open={drawerOpen} controls its own CSS state, not
  // mounting), rendering it eagerly would fetch its chunk on first paint
  // regardless. This ref keeps that fetch deferred until the hamburger is
  // actually tapped once.
  const drawerEverOpened = useRef(false);
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
  const { current: newAchievement, recordAndDetect, dismissCurrent: dismissAchievement } = useAchievementUnlocks();

  // drawerOpen is global (both tabs); classicFilters affects ClassicMap's
  // AND BlitzMap's site pools. Daily's pool is fixed and untouched by this.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [classicFilters, setClassicFilters] = useState(DEFAULT_FILTERS);

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
  const handleDailyComplete = useCallback((results) => {
    const totalPts = results.reduce((sum, r) => sum + r.finalScore, 0);
    const totalDist = results.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0);
    recordAndDetect(() => recordDailyResult(results, totalPts, totalDist));
    setDailySummaryData({ totalPts, totalDist, results });
    setDailyPhase('summary');
  }, [recordAndDetect]);

  function handleSummaryDone(leaderboardPayload) {
    setDailyLeaderboardData(leaderboardPayload);
    setDailyPhase('leaderboard');
  }

  function loadSites() {
    // Fetched, not import()'d -- this used to be bundled as a JS module
    // (`import('./data/protected-areas.json')`), which forces V8 to parse
    // 837 sites' worth of object-literal syntax through the general JS
    // parser. Native JSON.parse (what fetch().json() uses under the hood)
    // is a simpler, faster grammar for the same data -- real savings on a
    // payload this size, particularly on mid-range mobile CPUs. Moving the
    // file to public/ (see scripts/processData.js) also lets it be
    // regenerated/redeployed without a JS rebuild, same as the other
    // site/state GeoJSON files there.
    fetch('/protected-areas.json')
      .then((r) => r.json())
      .then(setAllSites)
      .catch(() => setSitesError(true));
  }

  useEffect(() => { loadSites(); }, []);

  // /api/daily-manifest: today's 5 Daily sites, precomputed server-side so
  // Daily (the default tab) doesn't have to wait on the full protected-
  // areas.json catalog above. Deliberately no sitesError-style handling on
  // failure -- this is a pure speed-up with an identical fallback already
  // built into useDailyRound (it derives the same 5 sites from allSites
  // once that arrives), so a failed/errored fetch here just means Daily
  // starts at its old speed, never a broken state.
  useEffect(() => {
    fetch('/api/daily-manifest')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.sites) setDailySites(data.sites); })
      .catch(() => {});
  }, []);

  // Idle-prefetch Classic/Blitz's lazy chunks. Daily is the default tab and
  // already owns the network/CPU budget for its own first paint (MapLibre +
  // sites JSON), so this waits for a genuinely idle moment before spending
  // any of it -- by the time a player actually taps Classic or Blitz, the
  // chunk is usually already cached and mounts with no fetch-and-parse
  // delay. Safari has no requestIdleCallback, hence the setTimeout fallback
  // (a fixed 2s guess at "probably idle by now" instead of a real idle
  // signal). Effect fires once; browser dynamic-import caching means a
  // later lazy() call for the same chunk is a cache hit, not a re-fetch.
  useEffect(() => {
    const prefetch = () => {
      import('./components/ClassicMap.jsx');
      import('./components/BlitzMap.jsx');
      // Also warm the shared border/state/label data useMapState's onLoad
      // needs (~345KB gzip) -- otherwise none of it starts downloading
      // until MapLibre's 'load' fires, so borders pop in visibly after the
      // map on slow connections. Same promise cache as onLoad, so this is
      // a pure head start, never a duplicate fetch -- see
      // warmSharedMapData's comment in useMapState.js.
      warmSharedMapData();
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(prefetch, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 2000);
    return () => clearTimeout(id);
  }, []);

  if (sitesError) {
    return (
      <div className="eg-app-shell-height" style={screenStyle}>
        <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--eg-brand, #227743)', marginBottom: '1rem' }}>
          EcoGuesser<sup style={{ fontSize: '0.4em', fontWeight: 700, verticalAlign: 'super', marginLeft: '0.1em' }}>™</sup>
        </div>
        <p style={{ color: 'var(--eg-ink, #111827)', marginBottom: '0.25rem' }}>Couldn't load game data.</p>
        <p style={{ color: 'var(--eg-ink-secondary, #6b7280)', marginBottom: '1.5rem' }}>Check your connection and try again.</p>
        <button onClick={() => { setSitesError(false); loadSites(); }} style={buttonStyle}>
          Try again
        </button>
      </div>
    );
  }

  // No `allSites.length === 0` gate here on purpose: DailyMap/ClassicMap/
  // BlitzMap and their round hooks already tolerate sites=[] (useDailyRound
  // shows its own "Loading today's challenge..." pill until allSites
  // arrives). Blocking the whole tree behind the sites fetch was a pure
  // waterfall -- MapContainer's own tile/sprite/glyph/DEM requests (the
  // actually slow part) never started until protected-areas.json had been
  // fetched, parsed, and committed. Mounting immediately lets both fetches
  // race in parallel instead of running serially.
  return (
    <div className="eg-app-shell-height" style={{ position: 'relative', width: '100vw' }}>
      {/* DailyMap mounts immediately; ClassicMap/BlitzMap only after their
          tab is first activated, and all stay mounted afterward --
          display:none, not unmount, so MapLibre never recreates its WebGL
          context on every tab switch. Each also gets `animation:
          eg-tab-fade-in` (see index.css) exactly when its display flips to
          'block', so switching in feels like a fade rather than an instant
          hard cut -- the outgoing panel still disappears instantly (no
          fade-out), which keeps this a same-render display swap rather
          than a period where two maps are both painting. */}
      {classicEverActivated.current && (
        <Suspense fallback={null}>
          <ClassicMap
            mapRef={classicMapRef}
            sites={allSites}
            filters={classicFilters}
            visible={activeTab === 'classic'}
          />
        </Suspense>
      )}
      {blitzEverActivated.current && (
        <Suspense fallback={null}>
          <BlitzMap
            mapRef={blitzMapRef}
            sites={allSites}
            filters={classicFilters}
            visible={activeTab === 'blitz'}
          />
        </Suspense>
      )}
      <Suspense fallback={<MapLoadingOverlay active />}>
        <DailyMap
          mapRef={dailyMapRef}
          sites={allSites}
          dailySites={dailySites}
          onComplete={handleDailyComplete}
          active={activeTab === 'daily'}
          visible={activeTab === 'daily' && dailyPhase === 'round'}
        />
      </Suspense>
      {activeTab === 'daily' && dailyPhase === 'summary' && dailySummaryData && (
        <Suspense fallback={null}>
          <DailySummary
            totalPts={dailySummaryData.totalPts}
            totalDist={dailySummaryData.totalDist}
            results={dailySummaryData.results}
            onDone={handleSummaryDone}
          />
        </Suspense>
      )}
      {activeTab === 'daily' && dailyPhase === 'leaderboard' && (
        <Suspense fallback={null}>
          <Leaderboard
            data={dailyLeaderboardData}
            onPlayClassic={() => switchTab('classic')}
            onPlayBlitz={() => switchTab('blitz')}
            allSites={allSites}
          />
        </Suspense>
      )}
      {activeTab === 'stats' && (
        <Suspense fallback={null}>
          <StatsView sites={allSites} />
        </Suspense>
      )}
      {newAchievement && (
        <AchievementToast key={newAchievement.id} achievement={newAchievement} onDone={dismissAchievement} />
      )}
      <BottomNav activeTab={activeTab} onTabChange={switchTab} />
      <Header
        onMenuClick={() => { drawerEverOpened.current = true; setDrawerOpen(true); }}
        titleIsH1={!(activeTab === 'stats' || (activeTab === 'daily' && dailyPhase === 'leaderboard'))}
      />
      <InstallPrompt />
      {infoModalVariant && (
        <Suspense fallback={null}>
          <InfoModal variant={infoModalVariant} onClose={() => setInfoModalVariant(null)} />
        </Suspense>
      )}
      {drawerEverOpened.current && (
        <Suspense fallback={null}>
          <SideDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            sites={allSites}
            filters={classicFilters}
            onApplyFilters={setClassicFilters}
            showFilters={activeTab === 'daily' || activeTab === 'classic' || activeTab === 'blitz'}
            filtersDisabled={activeTab === 'daily'}
            onNavigate={setInfoModalVariant}
          />
        </Suspense>
      )}
    </div>
  );
}
