// src/components/BlitzMap.jsx
//
// Wires MapContainer + BlitzCard + useBlitzRound into the playable Blitz
// screen. Mirrors ClassicMap.jsx's role but stripped of everything
// pin-drop/distance-specific: no SatelliteOverlay, no layer-toggle panel
// (borders are forced on inside useMapState for mode==='blitz'), no
// difficulty. Category + Region/State filters ARE shared with Classic now
// (per direct request) -- same `filters` prop/SideDrawer instance, applied
// here the same way ClassicMap.jsx applies it to its own sitePool.
//
// RecenterButton's REVEALING-time offset now reads BlitzCard's real
// measured height via cardRef, same cardRef/cardHeight/transitionend
// pattern as ClassicMap.jsx -- it used to assume a static 260px estimate,
// but BlitzCard's expanded content isn't actually constant-height:
// correctStates can list more than one state for sites that straddle a
// border, wrapping the badge/state line onto an extra line, so a fixed
// estimate could undershoot and let the expanded card cover the crosshair
// button. handleShowBoundary passes the same measured height through to
// blitzHighlight.js's zoomToBoundary() so the tight boundary zoom doesn't
// end up under the card either.
//
// State Names: the top-right toggle is fully player-controlled now -- it
// used to force itself on during REVEALING regardless of what the player
// had set, so the answer always appeared automatically. It now only resets
// to hidden at the start of each new round (LOADING), same as before.
//
// BlitzMap.css holds the one thing left to style at this level: the
// top-right "State Names" toggle (mirrors DailyMap.css's .dm-layer-panel).
// Borders themselves stay forced-on/non-togglable per useMapState.

import { useEffect, useMemo, useRef, useState } from 'react';
import MapContainer from './MapContainer.jsx';
import BlitzCard from './BlitzCard.jsx';
import RecenterButton from './RecenterButton.jsx';
import { useBlitzRound } from '../hooks/useBlitzRound.js';
import { useMapState } from '../hooks/useMapState.js';
import {
  showSelection, showReveal, clearAll, zoomToBoundary, clearBoundary,
  showHintRegion, hideHintRegion,
} from '../game/blitzHighlight.js';
import { siteMatchesFilter, DEFAULT_FILTERS, getRegionHintStates } from '../utils/filters.js';
import { LAYER_IDS, MAP_CONFIG, MAP_STYLE_BLITZ } from '../config.js';
import './BlitzMap.css';

// Used to build zoomToBoundary()'s fitPadding once "Show Boundary" is
// pressed -- top/left/right are fixed screen margins; `bottom` is computed
// per-round from cardRef's actual measured height, same constants
// ClassicMap.jsx uses for its own REVEAL_FIT_SIDES/REVEAL_CARD_GAP.
const REVEAL_FIT_SIDES = { top: 60, left: 40, right: 40 };
const REVEAL_CARD_GAP = 20; // breathing room above the card's top edge

/**
 * @param {{current: import('maplibre-gl').Map|null}} mapRef
 * @param {React.CSSProperties} style
 * @param {import('../config').Site[]} sites - full unfiltered list from App.jsx
 * @param {{categories: string[], states: string[]}} [filters] - same lifted
 *   filter state as ClassicMap.jsx (Category + Region/State), now shared
 *   with Blitz per direct request.
 */
export default function BlitzMap({ mapRef, style, sites, filters = DEFAULT_FILTERS }) {
  const sitePool = useMemo(
    () => sites.filter((s) => siteMatchesFilter(s, filters)),
    [sites, filters]
  );

  const {
    roundState, site, selectedState, result,
    handleStateClick, handleConfirm, handleNextSite, handleSkip,
  } = useBlitzRound(sitePool);

  const { mapReady, politicalNames, setPoliticalNames } = useMapState(mapRef, 'blitz');
  // political is forced true inside useMapState's onLoad for mode==='blitz'
  // -- this component never calls setPolitical itself. politicalNames (the
  // "State Names" toggle below) stays player-controlled.

  const cardRef = useRef(null); // measures BlitzCard's real height, same role as ClassicMap.jsx's cardRef
  // Tracks that height during REVEALING so RecenterButton can sit above the
  // expanded card instead of being hidden by it.
  const [cardHeight, setCardHeight] = useState(null);

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
    const map = mapRef.current;
    if (!map) return;
    const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? 0;
    zoomToBoundary(map, { ...REVEAL_FIT_SIDES, bottom: measuredHeight + REVEAL_CARD_GAP });
  }

  // Hint button -- highlights every state in the correct region(s) amber for
  // 3s, then auto-clears. Can be tapped any number of times per round (no
  // counter/penalty); each tap just resets the 3s window rather than
  // stacking timers.
  const hintTimeoutRef = useRef(null);
  function handleHint() {
    const map = mapRef.current;
    if (!map || !site) return;
    if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    showHintRegion(map, getRegionHintStates(site.state));
    hintTimeoutRef.current = setTimeout(() => {
      hideHintRegion(mapRef.current);
      hintTimeoutRef.current = null;
    }, 3000);
  }

  // SELECTING preview. Deliberately does nothing while REVEALING -- the
  // effect below owns the blue->green/red handoff so the two never race.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || roundState === 'REVEALING') return;
    if (roundState === 'SELECTING' && selectedState) showSelection(map, selectedState);
    else clearAll(map);
  }, [mapRef, mapReady, roundState, selectedState]);

  // REVEALING -> green/red (showReveal opens with its own clearAll), plus an
  // immediate fast reset to the default India-wide framing per direct
  // request -- Blitz previously never touched the camera on reveal, so
  // whatever zoom/pan the player was at when they tapped a state just sat
  // there. 500ms keeps it snappy and distinct from the 1200ms "Show
  // Boundary" zoom below, which is meant to linger once requested.
  // LOADING -> clear everything before the next site's blue preview starts.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (roundState === 'REVEALING' && result) {
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = null;
      }
      hideHintRegion(map);
      showReveal(map, result.correctStates, result.guessedState, result.isCorrect, result.site);
      map.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: MAP_CONFIG.FIT_PADDING, duration: 500 });
    } else if (roundState === 'LOADING') {
      clearAll(map);
    }
  }, [mapRef, mapReady, roundState, result]);

  // State names: fully player-controlled via the toggle below -- no longer
  // force-shown on REVEALING (the player now chooses whether to reveal
  // them, per direct request). Still resets to hidden every new LOADING so
  // each round starts blank rather than carrying over from the last one.
  // Also clears any "Show Boundary" polygon from the previous site here,
  // for the same reason.
  useEffect(() => {
    if (roundState === 'LOADING') {
      setPoliticalNames(false);
      clearBoundary(mapRef.current);
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = null;
      }
      hideHintRegion(mapRef.current);
    }
  }, [mapRef, roundState, setPoliticalNames]);

  // Belt-and-braces cleanup if the player navigates away from Blitz mid-timer.
  useEffect(() => {
    return () => {
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    };
  }, []);

  // Measures BlitzCard's real expanded height the instant roundState flips
  // to REVEALING -- synchronously, in the same commit the class changes in,
  // well before BottomCard.css's 0.3s max-height transition finishes -- so
  // this initially reads a height still close to the pill's 64px, not the
  // expanded card's real height. Corrected by the transitionend effect below
  // once the animation actually completes. Same race/fix ClassicMap.jsx
  // documents for its own cardRef.
  useEffect(() => {
    if (roundState !== 'REVEALING') return;
    const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? 0;
    setCardHeight(measuredHeight);
  }, [roundState, result]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || roundState !== 'REVEALING') return;

    function onTransitionEnd(e) {
      if (e.target !== card || e.propertyName !== 'max-height') return;
      setCardHeight(card.getBoundingClientRect().height);
    }
    card.addEventListener('transitionend', onTransitionEnd);
    return () => card.removeEventListener('transitionend', onTransitionEnd);
  }, [roundState]);

  return (
    <div style={style}>
      <div className="bz-layer-panel">
        <label>
          <input
            type="checkbox"
            checked={politicalNames}
            disabled={!mapReady}
            onChange={() => setPoliticalNames(!politicalNames)}
          />
          State Names
        </label>
      </div>

      {sitePool.length === 0 && (
        <div className="bz-empty-pool">No sites match these filters.</div>
      )}

      <MapContainer mapRef={mapRef} onMapClick={handleMapClick} guess={null} mapStyle={MAP_STYLE_BLITZ} />
      <RecenterButton
        mapRef={mapRef}
        style={
          roundState === 'REVEALING' && cardHeight
            ? { bottom: `calc(var(--eg-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 12px + ${cardHeight}px + 12px)` }
            : undefined
        }
      />

      {site && (
        <BlitzCard
          ref={cardRef}
          roundState={roundState}
          site={site}
          selectedState={selectedState}
          result={result}
          onConfirm={handleConfirm}
          onNextSite={handleNextSite}
          onSkip={handleSkip}
          onHint={handleHint}
          onShowBoundary={handleShowBoundary}
        />
      )}
    </div>
  );
}
