// src/components/ClassicMap.jsx
// Wires MapContainer + BottomCard + useClassicRound into the playable
// Classic mode screen. mapRef/visible pass through from App.jsx's tab
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

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, memo } from 'react';
import MapContainer from './MapContainer.jsx';
import BottomCard from './BottomCard.jsx';
import RecenterButton from './RecenterButton.jsx';
import MilestoneToast from './MilestoneToast.jsx';
import AchievementToast from './AchievementToast.jsx';
import MapLoadingOverlay from './MapLoadingOverlay.jsx';
import { useClassicRound } from '../hooks/useClassicRound.js';
import { useMapState } from '../hooks/useMapState.js';
import { useAchievementUnlocks } from '../hooks/useAchievementUnlocks.js';
import { siteMatchesFilter, DEFAULT_FILTERS } from '../utils/filters.js';
import { MAP_CONFIG } from '../config.js';
import { showResult, clearResult, zoomToSiteBoundary, RESULT_FIT_EASING, ROUND_RESET_DURATION_MS } from '../game/resultLayer.js';
import { showHint2, hideHint2 } from '../game/stateHighlight.js';
import { recordClassicResult, recordSiteEncounter, loadNormalStats, computeEmaAvgDist } from '../game/stats.js';
import ClassicDistanceGauge from './ClassicDistanceGauge.jsx';
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
// IconMountain/IconMapFlat alternate on the same square with terrain on/off
// -- see the square's usage below for which mode each shows.
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
 * @param {boolean} visible - controls display:block/none + fade-in for tab switching (see ClassicMap.css)
 * @param {import('../config').Site[]} sites - full loaded site list (from App.jsx)
 * @param {{categories: string[], states: string[]}} [filters] - lifted to App.jsx via SideDrawer
 * @param {'easy'|'normal'|'hard'} [difficulty] - lifted to App.jsx via SideDrawer
 */
function ClassicMap({ mapRef, visible, sites, filters = DEFAULT_FILTERS, difficulty }) {
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
    political, satellite, satelliteUnavailable, mapReady, mapLoadSlow, terrain,
    setPolitical, setSatellite, setDifficulty, setTerrain,
  } = useMapState(mapRef, 'classic');
  const { current: newAchievement, recordAndDetect, dismissCurrent: dismissAchievement } = useAchievementUnlocks();

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
  // EMA of Classic round distances, for ClassicDistanceGauge. Initialized
  // from existing storage so a returning player sees their real recent
  // average immediately, not a post-first-round pop-in.
  const [avgDist, setAvgDist] = useState(() => computeEmaAvgDist(loadNormalStats()));
  useEffect(() => {
    if (roundState !== 'REVEALING' || !result) return;
    if (recordedResultRef.current === result) return;
    recordedResultRef.current = result;
    const seenCount = recordAndDetect(() => {
      const updatedStats = recordClassicResult(result);
      setAvgDist(computeEmaAvgDist(updatedStats));
      return recordSiteEncounter(result.site.id);
    });
    if (seenCount !== null && seenCount % 10 === 0) setMilestone(seenCount);
  }, [roundState, result, recordAndDetect]);

  // "Show Site Boundary" button -- zooms in on the revealed site's polygon.
  // Recomputes fitPadding live since cardRef's height can only be read live.
  const handleShowBoundary = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? 0;
    zoomToSiteBoundary(map, { ...REVEAL_FIT_SIDES, bottom: measuredHeight + REVEAL_CARD_GAP });
  }, [mapRef]);

  // What clicking the Terrain/Basemap square actually does, for its
  // aria-label/title -- satellite-on is its own case since that click no
  // longer flips terrain, it just turns satellite off (see the square's
  // onClick and its comment below).
  const terrainBtnAction = satellite
    ? 'Turn off satellite view'
    : terrain ? 'Switch to basemap' : 'Switch to terrain map';

  return (
    <div className={visible ? 'eg-classic-map is-active' : 'eg-classic-map'}>
      <MapContainer
        mapRef={mapRef}
        onMapClick={handleMapClick}
        guess={guess}
        guessMarkerVisible={roundState !== 'REVEALING'}
      />
      <MapLoadingOverlay active={!mapReady} slow={mapLoadSlow} />
      <RecenterButton
        mapRef={mapRef}
        style={
          roundState === 'REVEALING' && cardHeight
            ? { bottom: `calc(var(--eg-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 12px + ${cardHeight}px + 12px)` }
            : undefined
        }
      />
      {/* Vignette/glow overlay removed -- was darkening satellite view edges. */}

      {milestone !== null && (
        <MilestoneToast key={milestone} count={milestone} onDone={() => setMilestone(null)} />
      )}
      {newAchievement && (
        <AchievementToast key={newAchievement.id} achievement={newAchievement} onDone={dismissAchievement} />
      )}

      {/* Top-left stack -- sits directly under the hamburger (Header.jsx),
          mirroring cm-top-right-stack's offset formula but anchored left
          instead of right. Borders lived in cm-top-right-stack before; moved
          here to free up the right stack for gauge/mode controls only. */}
      <div className="cm-top-left-stack">
        <div className="cm-layer-panel">
          <label className="eg-toggle">
            <input type="checkbox" className="eg-toggle-input" checked={political} disabled={!mapReady} onChange={(e) => setPolitical(e.target.checked)} />
            <span className="eg-toggle-track"><span className="eg-toggle-thumb" /></span>
            <span className={!mapReady ? 'eg-toggle-disabled' : undefined}>Borders</span>
          </label>
        </div>
      </div>

      {/* Rendered outside .cm-top-right-stack, above MapLoadingOverlay's
          z-index -- the gauge reads localStorage, not live map state, so it
          has no reason to wait on mapReady the way the mode row below it
          does. Sharing the stack's z-index tier used to bury it under the
          loading overlay until tiles finished loading (or forever, if load
          stalled). Positioned to sit exactly above .cm-top-right-stack,
          which is shifted down by this panel's height + gap to compensate. */}
      <div className="cm-gauge-stack">
        <ClassicDistanceGauge avgDist={avgDist} visible={visible} />
      </div>

      {/* Top-right stack -- mode row (Terrain/Basemap + Satellite), own
          standalone boxes, not wrapped in any panel background. Mirrors
          DailyMap.jsx/BlitzMap.jsx's top-right-stack pattern. Correctly
          stays under the loading overlay -- these are live map controls,
          already `disabled={!mapReady}` too. */}
      <div className="cm-top-right-stack">
        <div className="cm-mode-row">
          {/* Terrain/Basemap is one control, not two -- icon and caption show
              the CURRENT mode ("Terrain" + mountain while terrain is on,
              "Basemap" + flat map otherwise), same direction as
              aria-pressed below, so a labeled "Terrain" box always means
              terrain is what's currently showing, not what tapping would
              switch to. Clicking flips it, at which point both the icon
              and caption flip together to the new current mode.
              .is-active is unconditional here (unlike the satellite square,
              which has a true off state) -- this button is always showing
              one of its two modes, never "neither", so it's always
              highlighted; only the icon/caption/aria-pressed change to say
              which mode. While satellite is on, this button is dimmed via
              .is-inert but stays clickable -- clicking it turns satellite
              off and reveals whatever terrain/basemap choice was already
              set (the preference kept ticking over in the background, see
              useMapState.js's terrainRef), rather than also flipping it on
              the same click. */}
          <div className="cm-mode-item">
            <button
              type="button"
              className={`cm-mode-btn is-active${satellite ? ' is-inert' : ''}`}
              disabled={!mapReady}
              onClick={() => (satellite ? setSatellite(false) : setTerrain(!terrain))}
              aria-label={terrainBtnAction}
              aria-pressed={terrain}
              title={terrainBtnAction}
            >
              {terrain ? <IconMountain size={18} /> : <IconMapFlat size={18} />}
              <span className="cm-mode-label" aria-hidden="true">{terrain ? 'Terrain' : 'Basemap'}</span>
            </button>
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
              <IconSatellite size={18} />
              <span className="cm-mode-label" aria-hidden="true">Satellite</span>
            </button>
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
          cardHeight={cardHeight}
        />
      )}
    </div>
  );
}

export default memo(ClassicMap);
