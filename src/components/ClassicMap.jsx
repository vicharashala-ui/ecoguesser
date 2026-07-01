// src/components/ClassicMap.jsx
//
// Wires MapContainer + BottomCard + useClassicRound into the actual
// playable Classic mode screen. Matches the App-level tab-switching
// convention from Section 4 -- mapRef and style are passed straight
// through from the parent's classicMapRef/activeTab logic.
//
// `sites` is passed down from App.jsx rather than imported here directly --
// App.jsx already loads protected-areas.json and gates its loading/error
// screens on that succeeding, so this avoids a second independent import of
// the same data.
//
// Filters (Decision #10 -- category + region/state side drawer) aren't
// built yet. Defaulting to "every category, every state" so Classic is
// fully playable against the full 839-site pool right now; once the
// drawer exists, swap DEFAULT_FILTERS for real useState + the drawer's
// onChange, siteMatchesFilter()/sitePool below don't need to change.
//
// useMapState + SatelliteOverlay move here from the old MapSmokeTest in
// App.jsx -- this is now the component that actually owns the full-screen
// map view, so it's the one that should own layer state. The checkbox
// panel below is the same temporary control from MapSmokeTest, not the
// real icon-based toggle UI from Section 8 (not built yet) -- swap it out
// once that exists; setPolitical/setPoliticalNames/setSatellite don't need
// to change.
//
// Section 10/11 wiring (resultLayer.js / stateHighlight.js): driven off
// `result` rather than the hook's live `guess`/`site`, since `result` is the
// immutable snapshot of exactly what got scored -- handleMapClick still
// updates `guess` on any tap, including ones that land after Confirm, so
// using it directly here could show a reveal line for a guess that was
// never the one that got scored.

import { useState, useEffect, useMemo, useRef } from 'react';
import MapContainer from './MapContainer.jsx';
import BottomCard from './BottomCard.jsx';
import RecenterButton from './RecenterButton.jsx';
import SatelliteOverlay from './SatelliteOverlay.jsx';
import { useClassicRound } from '../hooks/useClassicRound.js';
import { useMapState } from '../hooks/useMapState.js';
import { siteMatchesFilter, REGION_STATES } from '../utils/filters.js';
import { DAILY, MAP_CONFIG } from '../config.js';
import { showResult, clearResult } from '../game/resultLayer.js';
import { showHint2, hideHint2 } from '../game/stateHighlight.js';
import './ClassicMap.css';

const ALL_STATES = Object.values(REGION_STATES).flat();

// DAILY.CATEGORIES is the same 5 short codes Classic's filter needs --
// reused here rather than re-listing them, so a category ever being added
// only needs updating in one place (config.js).
const DEFAULT_FILTERS = { categories: [...DAILY.CATEGORIES], states: ALL_STATES };

// Used to build resultLayer.js's fitBounds padding once Confirm is pressed --
// top/left/right are fixed screen margins; `bottom` is computed per-round from
// cardRef's actual measured height (see the reveal effect below), since the
// expanded BottomCard's height varies with site.desc length, daily-only
// lines, etc.
const REVEAL_FIT_SIDES = { top: 60, left: 40, right: 40 };
const REVEAL_CARD_GAP = 20; // breathing room above the card's top edge

/**
 * @param {{current: import('maplibre-gl').Map|null}} mapRef
 * @param {React.CSSProperties} style - controls display:block/none for tab switching
 * @param {import('../config').Site[]} sites - the full loaded site list (from App.jsx)
 */
export default function ClassicMap({ mapRef, style, sites }) {
  const filters = DEFAULT_FILTERS; // becomes useState once the side drawer exists

  const sitePool = useMemo(
    () => sites.filter((s) => siteMatchesFilter(s, filters)),
    [sites, filters]
  );

  const {
    roundState,
    site,
    guess,
    markerPlaced,
    hintLevel,
    result,
    handleMapClick,
    handleHint,
    handleConfirm,
    handleNextSite,
  } = useClassicRound(sitePool);

  const {
    political, politicalNames, satellite, satelliteUnavailable, mapReady,
    setPolitical, setPoliticalNames, setSatellite,
  } = useMapState(mapRef, 'classic');

  const cardRef = useRef(null); // measures BottomCard's real height for the reveal's fitBounds padding
  // Tracks that same height during REVEALING so RecenterButton can sit above
  // the expanded card instead of being hidden by it (per direct request --
  // it now stays visible through REVEALING too).
  const [cardHeight, setCardHeight] = useState(null);

  // Section 10 -- PLACING -> REVEALING shows the line/pin/boundary reveal;
  // any -> LOADING (including initial mount) clears it. Built off `result`
  // rather than `guess`/`site` so a post-Confirm tap can't desync the
  // visualization from what was actually scored (see file-header note).
  //
  // mapReady (a one-time latch from useMapState), not isStyleLoaded() --
  // isStyleLoaded() also flickers false during ANY in-flight style update,
  // including showResult's own source.setData() calls during its line-draw
  // animation, which was silently skipping this very effect's hint-hide
  // logic mid-reveal. mapReady only reflects whether the map has loaded at
  // least once, which is all addLayer/removeLayer actually need.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (roundState === 'REVEALING' && result && result.guessLat != null) {
      // Borders give useful context for the highlighted site boundary --
      // turn them on for this reveal. Turned back off at the next LOADING
      // below; the player can re-enable manually for a round if they want.
      setPolitical(true);

      // BottomCard has already re-rendered into its expanded layout by the
      // time this effect runs (same commit), so this reads its real height
      // rather than guessing at a fixed pixel value.
      const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? 0;
      setCardHeight(measuredHeight);
      const fitPadding = { ...REVEAL_FIT_SIDES, bottom: measuredHeight + REVEAL_CARD_GAP };
      showResult(map, { lat: result.guessLat, lng: result.guessLng }, result.site, {
        distanceKmOverride: result.distanceKm,
        fitPadding,
      });
    } else if (roundState === 'LOADING') {
      clearResult(map);
      setPolitical(false);
      // Next Site lands here -- reset the view to the default India-wide
      // framing per direct request, same fitBounds call RecenterButton/
      // MapContainer's initial load both use.
      map.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: 20 });
    }
  }, [mapRef, mapReady, roundState, result, setPolitical]);

  // (v8.19) BottomCard.css transitions max-height over 0.3s on pill->expanded
  // (is-pill -> is-expanded). The reveal effect above measures cardRef's
  // height the instant roundState flips to REVEALING -- synchronously, in
  // the same commit the class changes in, well before that 0.3s animation
  // finishes -- so it reads a height still close to the pill's 64px, not the
  // expanded card's real ~300-400px. cardHeight (and therefore
  // RecenterButton's computed `bottom` offset below) was getting frozen at
  // that too-small value, so once the card finished growing open it became
  // tall enough to sit on top of a RecenterButton that never moved to make
  // room for it (z-index 30 > 25). Fix: re-measure once the transition
  // actually completes and correct cardHeight then.
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

  // Section 11 -- Hint 2 highlights site.state on the map, but only while
  // the player can still act on it (READING/PLACING). hintLevel itself
  // isn't reset to 0 until the *next* round's LOADING effect runs -- it's
  // still 2 all through REVEALING (handleConfirm records it on `result`,
  // it doesn't clear it) -- so without the roundState check below the
  // state highlight would sit on top of resultLayer's own site-boundary
  // reveal for the entire REVEALING phase instead of handing off to it the
  // moment Confirm is pressed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !site) return;

    const shouldShow = hintLevel >= 2 && (roundState === 'READING' || roundState === 'PLACING');
    if (shouldShow) {
      showHint2(map, site);
    } else {
      hideHint2(map);
    }
  }, [mapRef, mapReady, hintLevel, site, roundState]);

  return (
    <div style={style}>
      <MapContainer mapRef={mapRef} onMapClick={handleMapClick} guess={guess} />
      <RecenterButton
        mapRef={mapRef}
        style={
          roundState === 'REVEALING' && cardHeight
            ? { bottom: `calc(var(--eg-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 12px + ${cardHeight}px + 12px)` }
            : undefined
        }
      />
      <SatelliteOverlay active={satellite} />

      {/* TEMPORARY layer toggle panel, carried over from the old MapSmokeTest --
          replace with the real icon-based control from Section 8 once built. */}
      <div className="cm-layer-panel">
        <label><input type="checkbox" checked={political} onChange={(e) => setPolitical(e.target.checked)} /> Borders</label>
        <label><input type="checkbox" checked={politicalNames} onChange={(e) => setPoliticalNames(e.target.checked)} /> Names</label>
        <label><input type="checkbox" checked={satellite} onChange={(e) => setSatellite(e.target.checked)} /> Satellite</label>
        {satelliteUnavailable && <div className="cm-sat-warning">Satellite unavailable</div>}
      </div>

      {sitePool.length === 0 && (
        <div className="cm-empty-pool">No sites match these filters.</div>
      )}

      {site && (
        <BottomCard
          ref={cardRef}
          roundState={roundState}
          site={site}
          markerPlaced={markerPlaced}
          hintLevel={hintLevel}
          onHint={handleHint}
          onConfirm={handleConfirm}
          onNextSite={handleNextSite}
          mode="classic"
          result={result}
        />
      )}
    </div>
  );
}
