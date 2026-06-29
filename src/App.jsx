import { useState, useEffect, useRef } from 'react';
import ClassicMap from './components/ClassicMap.jsx';

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

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <ClassicMap mapRef={mapRef} sites={allSites} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
