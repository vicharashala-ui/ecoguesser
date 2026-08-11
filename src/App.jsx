import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import BottomNav from './components/BottomNav.jsx';
import Header from './components/Header.jsx';
import MapLoadingOverlay from './components/MapLoadingOverlay.jsx';
import { recordDailyResult, hasPlayedToday } from './game/stats.js';
import { warmSharedMapData } from './hooks/sharedMapData.js';
import { useAchievementUnlocks, preloadAchievements } from './hooks/useAchievementUnlocks.js';
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
// tab, InfoModal only once opened from SideDrawer, SideDrawer only once the
// hamburger is tapped, AchievementToast only once an achievement actually
// unlocks, and InstallPrompt only once installPromptReady flips true
// (share card settled -- see that state's own comment) and its own
// MIN_DELAY_MS has then passed. Leaderboard also drags in
// html-to-image (the recap share-card export) -- deferring it keeps that
// out of the initial bundle too. InstallPrompt's event-capture half (the
// one-shot, un-refireable beforeinstallprompt listener) already lives in
// utils/installPromptCapture.js, imported eagerly from main.jsx -- this is
// only the banner JSX/CSS, which has no browser API of its own and is safe
// to defer (see that file's own header comment).
const DailySummary = lazy(() => import('./components/DailySummary.jsx'));
const Leaderboard = lazy(() => import('./components/Leaderboard.jsx'));
const StatsView = lazy(() => import('./components/StatsView.jsx'));
const InfoModal = lazy(() => import('./components/InfoModal.jsx'));
const SideDrawer = lazy(() => import('./components/SideDrawer.jsx'));
const InstallPrompt = lazy(() => import('./components/InstallPrompt.jsx'));
const AchievementToast = lazy(() => import('./components/AchievementToast.jsx'));

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
  // Gates the two deferred-prefetch effects below (ClassicMap/BlitzMap warm
  // and warmSharedMapData). Both used to fire on requestIdleCallback/window
  // 'load', which measure main-thread and document-resource idleness --
  // neither tracks whether DailyMap's own MapLibre critical path (vendor
  // chunk + style + first tiles/glyphs) has actually finished. Lighthouse
  // trace showed this idle callback firing at ~1.8s while vendor-maplibre
  // (244KB) was still 3s from finishing its own download, so the prefetch
  // was competing for bandwidth with the thing it was supposed to wait
  // behind. mapReady (DailyMap's useMapState, surfaced via onMapReady
  // below) is the actual signal: MapLibre's own 'load' event, which only
  // fires once the map has nothing left in flight.
  const [dailyMapReady, setDailyMapReady] = useState(false);
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
  // Gates InstallPrompt: stays false until the Daily recap/share card is
  // actually off-screen -- Leaderboard's onRecapSettled fires once that's
  // true, whether because the card had nothing to wait for (already shown
  // earlier today), the player closed it, or Leaderboard unmounted (tab
  // switch) before either happened. This is what makes InstallPrompt show
  // shortly *after* the share card closes instead of racing it. Never
  // flips back once true -- showing the nudge on a later tab switch is fine.
  const [installPromptReady, setInstallPromptReady] = useState(false);
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
    // 838 sites' worth of object-literal syntax through the general JS
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
    if (!dailyMapReady) return;
    const prefetch = () => {
      import('./components/ClassicMap.jsx');
      import('./components/BlitzMap.jsx');
      // Same reasoning as the two chunk prefetches above -- see
      // useAchievementUnlocks.js's preloadAchievements() comment for why
      // this is a cache warm rather than a static import.
      preloadAchievements();
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(prefetch, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 2000);
    return () => clearTimeout(id);
  }, [dailyMapReady]);

  // warmSharedMapData() alone is ~345KB gzip (india-boundary.geojson +
  // india-states.topojson + india-state-labels.geojson) -- big enough to
  // fight the map's own still-loading OFM tiles/glyphs for bandwidth on a
  // slow connection if it starts too early. It used to gate on window
  // 'load' before starting its own idle/timeout countdown, on the theory
  // that 'load' means "the page's own declared resources have settled" --
  // but 'load' also waits on <link rel=modulepreload>/preload tags, so it
  // fires as soon as those (and everything else still in flight) finish,
  // not specifically once the map's tiles are done. Lighthouse trace showed
  // this firing at ~2.7s while vendor-maplibre.js was still 1.8s from
  // finishing. dailyMapReady (MapLibre's own 'load' event, see
  // onMapReady below) is the direct signal instead: by definition nothing
  // from the map's own critical path is still in flight once it's true.
  //
  // navigator.connection is Chromium-only (undefined in Safari/Firefox) --
  // where available, saveData or a 2G effectiveType skips the warm-up
  // outright, since competing for bandwidth costs more there than borders
  // popping in a beat later is worth. Best-effort only; unsupported
  // browsers just get the mapReady-gating above with no skip.
  useEffect(() => {
    if (!dailyMapReady) return;
    const conn = navigator.connection;
    if (conn && (conn.saveData || /2g/.test(conn.effectiveType ?? ''))) return;

    let idleId;
    let timeoutId;
    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(warmSharedMapData, { timeout: 5000 });
    } else {
      timeoutId = setTimeout(warmSharedMapData, 2000);
    }

    return () => {
      if (idleId != null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [dailyMapReady]);

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
          onMapReady={() => setDailyMapReady(true)}
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
            onRecapSettled={() => setInstallPromptReady(true)}
          />
        </Suspense>
      )}
      {activeTab === 'stats' && (
        <Suspense fallback={null}>
          <StatsView sites={allSites} />
        </Suspense>
      )}
      {newAchievement && (
        <Suspense fallback={null}>
          <AchievementToast key={newAchievement.id} achievement={newAchievement} onDone={dismissAchievement} />
        </Suspense>
      )}
      <BottomNav activeTab={activeTab} onTabChange={switchTab} />
      <Header
        onMenuClick={() => { drawerEverOpened.current = true; setDrawerOpen(true); }}
        titleIsH1={!(activeTab === 'stats' || (activeTab === 'daily' && dailyPhase === 'leaderboard'))}
      />
      <Suspense fallback={null}>
        <InstallPrompt readyToShow={installPromptReady} />
      </Suspense>
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
