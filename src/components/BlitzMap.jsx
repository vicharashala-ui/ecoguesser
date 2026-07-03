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
// No BlitzMap.css -- nothing left to style at this level once the
// empty-pool case (can't occur; `sites` is always the full unfiltered
// allSites, no filter UI in v1) and the layer-toggle panel (forced
// borders-on, no toggle UI) are both out of scope. RecenterButton,
// MapContainer, and BlitzCard all bring their own CSS.

import { useEffect } from 'react';
import MapContainer from './MapContainer.jsx';
import BlitzCard from './BlitzCard.jsx';
import RecenterButton from './RecenterButton.jsx';
import { useBlitzRound } from '../hooks/useBlitzRound.js';
import { useMapState } from '../hooks/useMapState.js';
import { showSelection, showReveal, clearAll } from '../game/blitzHighlight.js';
import { LAYER_IDS } from '../config.js';

/**
 * @param {{current: import('maplibre-gl').Map|null}} mapRef
 * @param {React.CSSProperties} style
 * @param {import('../config').Site[]} sites - full unfiltered list from App.jsx
 */
export default function BlitzMap({ mapRef, style, sites }) {
  const {
    roundState, site, selectedState, result,
    streak, bestStreak, totalCorrect, totalAttempted,
    handleStateClick, handleConfirm, handleNextSite,
  } = useBlitzRound(sites);

  const { mapReady } = useMapState(mapRef, 'blitz');
  // political is forced true inside useMapState's onLoad for mode==='blitz'
  // -- this component never calls setPolitical itself.

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
      showReveal(map, result.correctStates, result.guessedState, result.isCorrect);
    } else if (roundState === 'LOADING') {
      clearAll(map);
    }
  }, [mapRef, mapReady, roundState, result]);

  return (
    <div style={style}>
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
          totalCorrect={totalCorrect}
          totalAttempted={totalAttempted}
          onConfirm={handleConfirm}
          onNextSite={handleNextSite}
        />
      )}
    </div>
  );
}
