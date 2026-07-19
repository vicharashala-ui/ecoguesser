// src/components/ClassicMap.jsx
// Wires MapContainer + BottomCard + useClassicRound into the playable
// Classic mode screen. mapRef/style pass through from App.jsx's tab
// switching; `sites` also comes from App.jsx (already loaded once there)
// rather than being re-imported here.
//
// `filters` and `difficulty` are lifted state from App.jsx, set via
// SideDrawer. Both default so Classic stays playable if rendered without
// them. difficulty flows in as a prop rather than out as a callback because
// setDifficulty lives inside useMapState(mapRef, 'classic'), instantiated
// in this component.
//
// The reveal/hint effects below key off `result` (the immutable scored
// snapshot), not the hook's live `guess`/`site` -- handleMapClick keeps
// updating `guess` on any tap after Confirm, so using it directly could
// show a reveal line for a guess that was never scored.

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import MapContainer from './MapContainer.jsx';
import BottomCard from './BottomCard.jsx';
import RecenterButton from './RecenterButton.jsx';
import SatelliteOverlay from './SatelliteOverlay.jsx';
import MilestoneToast from './MilestoneToast.jsx';
import { useClassicRound } from '../hooks/useClassicRound.js';
import { useMapState } from '../hooks/useMapState.js';
import { siteMatchesFilter, DEFAULT_FILTERS } from '../utils/filters.js';
import { MAP_CONFIG } from '../config.js';
import { showResult, clearResult, zoomToSiteBoundary, RESULT_FIT_EASING, ROUND_RESET_DURATION_MS } from '../game/resultLayer.js';
import { showHint2, hideHint2 } from '../game/stateHighlight.js';
import { recordClassicResult, recordSiteEncounter } from '../game/stats.js';
import './ClassicMap.css';

// fitBounds padding for the post-Confirm reveal; `bottom` is computed per
// round from BottomCard's measured height (see reveal effect below).
const REVEAL_FIT_SIDES = { top: 60, left: 40, right: 40 };
const REVEAL_CARD_GAP = 20; // gap above the card's top edge

// Layer-mode icons for the Terrain/Normal + Satellite square buttons below.
// Same stroke-only convention as BottomCard.jsx's icon set (viewBox 24x24,
// currentColor stroke) -- duplicated rather than shared per this codebase's
// no-shared-icon-module rule (see BlitzMap.jsx's IconFlame comment). Paths
// match the mountain/map-2/satellite glyphs from the approved mockup.
// IconMountain/IconMapFlat are shown on the same square, alternating with
// terrain on/off since the icon always shows the mode a click will switch
// *to* -- see the square's usage below.
function IconMountain({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18l-6.921 -14.612a2.3 2.3 0 0 0 -4.158 0l-6.921 14.612" />
      <path d="M7.5 11l2 2.5l2.5 -2.5l2 3l2.5 -2" />
    </svg>
  );
}

function IconMapFlat({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 18.5l-3 -1.5l-6 3v-13l6 -3l6 3l6 -3v7.5" />
      <path d="M9 4v13" />
      <path d="M15 7v5.5" />
      <path d="M21.121 20.121a3 3 0 1 0 -4.242 0c.418 .419 1.125 1.045 2.121 1.879c1.051 -.89 1.759 -1.516 2.121 -1.879" />
      <path d="M19 18v.01" />
    </svg>
  );
}

function IconSatellite({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.707 6.293l2.586 -2.586a1 1 0 0 1 1.414 0l5.586 5.586a1 1 0 0 1 0 1.414l-2.586 2.586a1 1 0 0 1 -1.414 0l-5.586 -5.586a1 1 0 0 1 0 -1.414" />
      <path d="M6 10l-3 3l3 3l3 -3" />
      <path d="M10 6l3 -3l3 3l-3 3" />
      <path d="M12 12l1.5 1.5" />
      <path d="M14.5 17a2.5 2.5 0 0 0 2.5 -2.5" />
      <path d="M15 21a6 6 0 0 0 6 -6" />
    </svg>
  );
}

/**
 * @param {{current: import('maplibre-gl').Map|null}} mapRef
 * @param {React.CSSProperties} style - controls display:block/none for tab switching
 * @param {import('../config').Site[]} sites - full loaded site list (from App.jsx)
 * @param {{categories: string[], states: string[]}} [filters] - lifted to App.jsx via SideDrawer
 * @param {'easy'|'normal'|'hard'} [difficulty] - lifted to App.jsx via SideDrawer
 */
export default function ClassicMap({ mapRef, style, sites, filters = DEFAULT_FILTERS, difficulty }) {
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
    handleSkip,
  } = useClassicRound(sitePool);

  const {
    political, satellite, satelliteUnavailable, mapReady, terrain,
    setPolitical, setSatellite, setDifficulty, setTerrain,
  } = useMapState(mapRef, 'classic');

  const cardRef = useRef(null); // measures BottomCard's height for reveal fitBounds padding
  // Tracked separately so RecenterButton can sit above the expanded card
  // during REVEALING instead of being hidden behind it.
  const [cardHeight, setCardHeight] = useState(null);
  // Lifted out of BottomCard (rather than its own local state) so the
  // collapse toggle and the cardHeight re-measure below fire in the same
  // React commit -- see the useLayoutEffect's comment for why that matters.
  const [collapsed, setCollapsed] = useState(false);

  // Applies the difficulty prop whenever it changes, including on mount once
  // mapReady flips true. Re-running on mount duplicates useMapState's own
  // init read from localStorage, but setDifficulty's underlying set calls
  // are idempotent, so this is harmless.
  useEffect(() => {
    if (!mapReady || !difficulty) return;
    setDifficulty(difficulty);
  }, [difficulty, mapReady, setDifficulty]);

  // PLACING -> REVEALING draws the reveal (line/pin/boundary); any -> LOADING
  // clears it. Uses `mapReady` rather than isStyleLoaded(), which also
  // flickers false during in-flight style updates -- including showResult's
  // own source.setData() calls -- and was intermittently skipping this
  // effect mid-reveal.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (roundState === 'REVEALING' && result && result.guessLat != null) {
      setCollapsed(false); // a collapse from the last round shouldn't carry into this one
      // BottomCard has already re-rendered into its expanded layout by the
      // time this runs, so this reads its real measured height. (cardHeight
      // itself is kept in sync by the useLayoutEffect below -- this one-off
      // read is only for the map's own fitBounds padding.)
      const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? 0;
      const fitPadding = { ...REVEAL_FIT_SIDES, bottom: measuredHeight + REVEAL_CARD_GAP };
      showResult(map, { lat: result.guessLat, lng: result.guessLng }, result.site, {
        distanceKmOverride: result.distanceKm,
        nearestLng: result.nearestLng,
        nearestLat: result.nearestLat,
        fitPadding,
      });
    } else if (roundState === 'LOADING') {
      clearResult(map);
      // Reset to the default India-wide framing for the next round -- same
      // eased curve resultLayer.js's own reveal fitBounds uses, so the
      // camera doesn't snap between a smoothed reveal and an untouched
      // default reset.
      map.fitBounds(MAP_CONFIG.INDIA_BOUNDS, {
        padding: MAP_CONFIG.FIT_PADDING,
        duration: ROUND_RESET_DURATION_MS,
        easing: RESULT_FIT_EASING,
      });
    }
  }, [mapRef, mapReady, roundState, result]);

  // Keeps cardHeight (and so RecenterButton's `bottom`) in sync with the
  // card's target height on every render that can change it -- including
  // the collapse/expand toggle, not just the initial pill -> expanded reveal.
  //
  // Uses scrollHeight, not getBoundingClientRect().height: scrollHeight
  // reports the content's natural height even while BottomCard.css's
  // max-height is still clipping the box, so it already reads the *target*
  // height before the 0.3s max-height transition has even started.
  //
  // Runs in useLayoutEffect (not useEffect) so setCardHeight is applied
  // before the browser paints. That's what fixes the desync: previously
  // cardHeight only updated on the card's own transitionend, so the card
  // visibly finished animating before the button's `bottom` transition even
  // began. Committing the new height in the same paint as the `collapsed`/
  // `roundState` class change means both elements' CSS transitions (card's
  // max-height, button's bottom -- both 0.3s ease) start on the same frame
  // and animate in sync.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || roundState !== 'REVEALING') return;
    setCardHeight(card.scrollHeight);
  }, [roundState, result, collapsed]);

  // Hint 2 highlights site.state on the map, but only while the player can
  // still act (READING/PLACING). hintLevel stays 2 through REVEALING (it's
  // only reset by the next round's LOADING effect), so the roundState check
  // hands off to resultLayer's own boundary reveal once Confirm is pressed.
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

  // Records the round once REVEALING starts. Guarded by object identity
  // against `result` (not a boolean) so React 18 Strict Mode's dev-only
  // double-invoke of this effect can't record the same round twice -- a
  // new round's `result` always compares unequal.
  const recordedResultRef = useRef(null);
  const [milestone, setMilestone] = useState(null);
  useEffect(() => {
    if (roundState !== 'REVEALING' || !result) return;
    if (recordedResultRef.current === result) return;
    recordedResultRef.current = result;
    recordClassicResult(result);
    const seenCount = recordSiteEncounter(result.site.id);
    if (seenCount !== null && seenCount % 10 === 0) setMilestone(seenCount);
  }, [roundState, result]);

  // "Show Site Boundary" button -- zooms in on the revealed site's polygon.
  // Recomputes fitPadding live since cardRef's height can only be read live.
  function handleShowBoundary() {
    const map = mapRef.current;
    if (!map) return;
    const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? 0;
    zoomToSiteBoundary(map, { ...REVEAL_FIT_SIDES, bottom: measuredHeight + REVEAL_CARD_GAP });
  }

  return (
    <div style={style}>
      <MapContainer
        mapRef={mapRef}
        onMapClick={handleMapClick}
        guess={guess}
        guessMarkerVisible={roundState !== 'REVEALING'}
      />
      <RecenterButton
        mapRef={mapRef}
        style={
          roundState === 'REVEALING' && cardHeight
            ? { bottom: `calc(var(--eg-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 12px + ${cardHeight}px + 12px)` }
            : undefined
        }
      />
      <SatelliteOverlay active={satellite} />

      {milestone !== null && (
        <MilestoneToast key={milestone} count={milestone} onDone={() => setMilestone(null)} />
      )}

      {/* Top-right stack -- Borders keeps its own glass panel (as it had
          before Terrain/Satellite were briefly merged into it); Terrain and
          Satellite are their own standalone boxes below it, not wrapped in
          any panel background. Mirrors DailyMap.jsx/BlitzMap.jsx's
          top-right-stack pattern for stacking independent HUD pieces. */}
      <div className="cm-top-right-stack">
        <div className="cm-layer-panel">
          <label className="eg-toggle">
            <input type="checkbox" className="eg-toggle-input" checked={political} disabled={!mapReady} onChange={(e) => setPolitical(e.target.checked)} />
            <span className="eg-toggle-track"><span className="eg-toggle-thumb" /></span>
            Borders{!mapReady && <span className="eg-toggle-loading-hint"> · loading</span>}
          </label>
        </div>
        <div className="cm-mode-row">
          {/* Terrain/Normal is one control, not two -- the icon always shows
              the mode a click will switch TO (mirrors a dark/light-mode
              toggle showing the sun while dark), so it reads "terrain" while
              flat and "normal" once terrain is on. Gets .is-active (same
              highlight as the satellite square) whenever terrain is on, so
              there's a visible cue for which mode is engaged, not just
              which icon is showing. Stays clickable (not disabled) while
              satellite is on, same "ready the instant satellite turns off"
              rationale the old checkbox had -- just dimmed via .is-inert so
              it reads as not doing anything right now. The caption below
              mirrors the icon's destination-mode wording rather than the
              current mode, so label and icon never disagree about what a
              tap does. */}
          <div className="cm-mode-item">
            <button
              type="button"
              className={`cm-mode-btn${terrain ? ' is-active' : ''}${satellite ? ' is-inert' : ''}`}
              disabled={!mapReady}
              onClick={() => setTerrain(!terrain)}
              aria-label={terrain ? 'Switch to normal map' : 'Switch to terrain map'}
              title={terrain ? 'Switch to normal map' : 'Switch to terrain map'}
            >
              {terrain ? <IconMapFlat /> : <IconMountain />}
            </button>
            <span className="cm-mode-label" aria-hidden="true">{terrain ? 'Normal' : 'Terrain'}</span>
          </div>
          <div className="cm-mode-item">
            <button
              type="button"
              className={`cm-mode-btn${satellite ? ' is-active' : ''}`}
              disabled={!mapReady}
              onClick={() => setSatellite(!satellite)}
              aria-label={satellite ? 'Turn off satellite view' : 'Turn on satellite view'}
              aria-pressed={satellite}
              title={satellite ? 'Turn off satellite view' : 'Turn on satellite view'}
            >
              <IconSatellite />
            </button>
            <span className="cm-mode-label" aria-hidden="true">Satellite</span>
          </div>
        </div>
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
          collapsed={collapsed}
          onToggleCollapsed={setCollapsed}
          onHint={handleHint}
          onConfirm={handleConfirm}
          onNextSite={handleNextSite}
          onShowBoundary={handleShowBoundary}
          onSkip={handleSkip}
          mode="classic"
          result={result}
        />
      )}
    </div>
  );
}
