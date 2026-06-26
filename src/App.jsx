import { useState, useEffect, useRef } from 'react';
import MapContainer from './components/MapContainer.jsx';
import SatelliteOverlay from './components/SatelliteOverlay.jsx';
import { useMapState } from './hooks/useMapState.js';

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
  const mapRef = useRef(null);

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

  // --- TEMPORARY MAP SMOKE TEST -- delete once confirmed working ---
  return <MapSmokeTest mapRef={mapRef} siteCount={allSites.length} />;
}

function MapSmokeTest({ mapRef, siteCount }) {
  const { political, politicalNames, satellite, satelliteUnavailable,
          setPolitical, setPoliticalNames, setSatellite } =
    useMapState(mapRef, 'classic');

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <MapContainer mapRef={mapRef} />
      <SatelliteOverlay active={satellite} />
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 10,
        background: 'rgba(255,255,255,0.9)', padding: '0.75rem', borderRadius: '8px',
        fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '0.5rem',
      }}>
        <div>Loaded {siteCount} sites</div>
        <label><input type="checkbox" checked={political} onChange={e => setPolitical(e.target.checked)} /> Borders</label>
        <label><input type="checkbox" checked={politicalNames} onChange={e => setPoliticalNames(e.target.checked)} /> Names</label>
        <label><input type="checkbox" checked={satellite} onChange={e => setSatellite(e.target.checked)} /> Satellite</label>
        {satelliteUnavailable && <div style={{ color: '#dc2626' }}>Satellite unavailable</div>}
      </div>
    </div>
  );
}
