import { useState, useEffect, useRef } from 'react';
import ClassicMap from './components/ClassicMap.jsx';
import { DailyMap } from './components/DailyMap.jsx';
import BottomNav from './components/BottomNav.jsx';
import DailySummary from './components/DailySummary.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import { recordDailyResult, hasPlayedToday } from './game/stats.js';

const screenStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
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

  // Section 4's tab-switching machinery. classicEverActivated is a ref (not
  // state) deliberately -- per spec, so flipping it doesn't cost a second
  // render; by the time switchTab's setActiveTab triggers the real render,
  // the ref is already true and ClassicMap mounts in that same pass.
  const classicEverActivated = useRef(false);
  const [activeTab, setActiveTab] = useState('daily');
  const classicMapRef = useRef(null);
  const dailyMapRef = useRef(null);

  // Section 4 Daily sub-flow: 'round' (DailyMap) -> 'summary' (auto-submit)
  // -> 'leaderboard'. Starts at 'leaderboard' if today's already been played
  // -- checked against localStorage, not just in-session state, so a
  // returning player who reloads mid-day lands on the leaderboard instead
  // of a fresh round.
  const [dailyPhase, setDailyPhase] = useState(() => (hasPlayedToday() ? 'leaderboard' : 'round'));
  const [dailySummaryData, setDailySummaryData] = useState(null); // { totalPts, totalDist }
  const [dailyLeaderboardData, setDailyLeaderboardData] = useState(null); // { top10, rank, banner } | null
  // READING/PLACING = unconfirmed guess in flight; drives the "Leave this
  // round?" guard below. NOT_STARTED/REVEALING are safe to nav away from.
  const [dailyRoundState, setDailyRoundState] = useState('NOT_STARTED');

  function switchTab(newTab) {
    if (newTab === activeTab) return;
    const midRound =
      activeTab === 'daily' &&
      dailyPhase === 'round' &&
      (dailyRoundState === 'READING' || dailyRoundState === 'PLACING');
    if (midRound && !window.confirm('Leave this round? Your progress will be lost.')) return;

    if (newTab === 'classic') classicEverActivated.current = true;
    setActiveTab(newTab);
    // Neither map redraws its canvas while display:none, so each becomes
    // mis-sized the moment it's shown again unless resized post-switch.
    requestAnimationFrame(() => {
      if (newTab === 'classic' && classicMapRef.current) classicMapRef.current.resize();
      if (newTab === 'daily' && dailyMapRef.current) dailyMapRef.current.resize();
    });
  }

  // DailyMap's round 5 hands off here (Section 4: round 5's "Next" ->
  // DAILY_SUMMARY, not back through LOADING). Stats are written here, once,
  // right at the real completion -- not inside DailySummary itself, which
  // can remount (see its own header comment on the mid-submit-tab-switch
  // gap) and must not re-trigger the streak math on a second mount.
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
      <div style={screenStyle}>
        <div style={{ fontSize: '32px', fontWeight: 800, color: '#16a34a', marginBottom: '1rem' }}>
          EcoGuesser
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
      <div style={screenStyle}>
        <div style={{ fontSize: '32px', fontWeight: 800, color: '#16a34a', marginBottom: '0.5rem' }}>
          EcoGuesser
        </div>
        <p style={{ fontSize: '18px', fontWeight: 400, color: '#6b7280', marginBottom: '1.5rem' }}>
          India's Protected Areas
        </p>
        <div className="eg-spinner" />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* DailyMap mounts immediately (Section 4: "DailyMap mounted
          immediately"); ClassicMap only after its tab is first activated,
          and both stay mounted afterward -- display:none, not unmount, so
          MapLibre never recreates its WebGL context on every tab switch. */}
      {classicEverActivated.current && (
        <ClassicMap
          mapRef={classicMapRef}
          sites={allSites}
          style={{ position: 'absolute', inset: 0, display: activeTab === 'classic' ? 'block' : 'none' }}
        />
      )}
      <DailyMap
        mapRef={dailyMapRef}
        sites={allSites}
        onComplete={handleDailyComplete}
        onRoundStateChange={setDailyRoundState}
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
        />
      )}
      {activeTab === 'daily' && dailyPhase === 'leaderboard' && (
        <Leaderboard data={dailyLeaderboardData} onPlayClassic={() => switchTab('classic')} />
      )}
      <BottomNav activeTab={activeTab} onTabChange={switchTab} />
    </div>
  );
}
