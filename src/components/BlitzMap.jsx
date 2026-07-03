// src/components/BlitzMap.jsx
//
// Wires MapContainer + BlitzCard + useBlitzRound into the playable Blitz
// screen. Mirrors ClassicMap.jsx's role but stripped of everything
// pin-drop/distance-specific: no SatelliteOverlay, no layer-toggle panel
// (borders are forced on inside useMapState for mode==='blitz'), no
// resultLayer.js fitBounds/boundary machinery, no difficulty/filters props.
//
// RecenterButton's REVEALING-time offset is a static estimate rather than
// ClassicMap's measured cardRef height -- BlitzCard's expanded content has
// no variable-length fields (no site.desc/species/year), so its height is
// effectively constant. Adjust the 260px constant below if BlitzCard.css's
// real rendered height drifts from this.
//
// BlitzMap.css holds the one thing left to style at this level: the
// top-right "State Names" toggle (mirrors DailyMap.css's .dm-layer-panel).
// Borders themselves stay forced-on/non-togglable per useMapState.

import { useEffect } from 'react';
import MapContainer from './MapContainer.jsx';
import BlitzCard from './BlitzCard.jsx';
import RecenterButton from './RecenterButton.jsx';
import { useBlitzRound } from '../hooks/useBlitzRound.js';
import { useMapState } from '../hooks/useMapState.js';
import { showSelection, showReveal, clearAll, zoomToBoundary, clearBoundary } from '../game/blitzHighlight.js';
import { LAYER_IDS } from '../config.js';
import './BlitzMap.css';

/**
 * @param {{current: import('maplibre-gl').Map|null}} mapRef
 * @param {React.CSSProperties} style
 * @param {import('../config').Site[]} sites - full unfiltered list from App.jsx
 */
export default function BlitzMap({ mapRef, style, sites }) {
  const {
    roundState, site, selectedState, result,
    streak, bestStreak,
    handleStateClick, handleConfirm, handleNextSite,
  } = useBlitzRound(sites);

  const { mapReady, politicalNames, setPoliticalNames } = useMapState(mapRef, 'blitz');
  // political is forced true inside useMapState's onLoad for mode==='blitz'
  // -- this component never calls setPolitical itself. politicalNames (the
  // "State Names" toggle below) stays player-controlled.

  function handleMapClick(lat, lng) {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const p = map.project([lng, lat]);
    // 3px query box, not a single point -- a bare point query is brittle
    // right on a state border (sub-pixel rounding from the project()
    // round-trip can land just outside the polygon), exactly where players
    // click most often in this game.
    const bbox = [[p.x - 3, p.y - 3], [p.x + 3, p.y + 3]];
    const [feature] = map.queryRenderedFeatures(bbox, { layers: [LAYER_IDS.BLITZ_FILL] });
    handleStateClick(feature?.properties?.st_nm ?? null);
  }

  function handleShowBoundary() {
    zoomToBoundary(mapRef.current);
  }

  // SELECTING preview. Deliberately does nothing while REVEALING -- the
  // effect below owns the blue->green/red handoff so the two never race.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || roundState === 'REVEALING') return;
    if (roundState === 'SELECTING' && selectedState) showSelection(map, selectedState);
    else clearAll(map);
  }, [mapRef, mapReady, roundState, selectedState]);

  // REVEALING -> green/red (showReveal opens with its own clearAll).
  // LOADING -> clear everything before the next site's blue preview starts.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (roundState === 'REVEALING' && result) {
      showReveal(map, result.correctStates, result.guessedState, result.isCorrect, result.site);
    } else if (roundState === 'LOADING') {
      clearAll(map);
    }
  }, [mapRef, mapReady, roundState, result]);

  // State names: force-shown on REVEALING regardless of the manual toggle
  // below (so the answer is always legible), reset to hidden every new
  // LOADING so each round starts blank. Also clears any "Show Boundary"
  // polygon from the previous site here, for the same reason.
  useEffect(() => {
    if (roundState === 'REVEALING') setPoliticalNames(true);
    else if (roundState === 'LOADING') {
      setPoliticalNames(false);
      clearBoundary(mapRef.current);
    }
  }, [mapRef, roundState, setPoliticalNames]);

  return (
    <div style={style}>
      <div className="bz-layer-panel">
        <label>
          <input
            type="checkbox"
            checked={politicalNames}
            onChange={() => setPoliticalNames(!politicalNames)}
          />
          State Names
        </label>
      </div>

      <MapContainer mapRef={mapRef} onMapClick={handleMapClick} guess={null} />
      <RecenterButton
        mapRef={mapRef}
        style={roundState === 'REVEALING'
          ? { bottom: 'calc(var(--eg-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 12px + 260px + 12px)' }
          : undefined}
      />

      {site && (
        <BlitzCard
          roundState={roundState}
          site={site}
          selectedState={selectedState}
          result={result}
          streak={streak}
          bestStreak={bestStreak}
          onConfirm={handleConfirm}
          onNextSite={handleNextSite}
          onShowBoundary={handleShowBoundary}
        />
      )}
    </div>
  );
}
