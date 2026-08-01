// src/components/DailyMap.jsx
// Daily Challenge's playable round screen -- the Daily-mode counterpart to
// ClassicMap.jsx. Wires MapContainer + BottomCard + useDailyRound +
// useMapState together the same way ClassicMap.jsx does; useDailyRound owns
// no map state and no API calls.
//
// Scope boundary: this component owns the round itself (rounds 1-5, timer,
// hints) but not navigation away from it. It calls `onComplete(results)`
// once round 5 is confirmed and lets the caller (the screen router) decide
// what happens next (DAILY_SUMMARY -> POST /api/score, etc.).
//
// Two things intentionally differ from ClassicMap.jsx: Daily doesn't
// auto-toggle borders on REVEALING (state borders are forced on at all
// times via useMapState instead), and panning stays enabled during the
// reveal -- only the pause overlay disables map interaction (Effect 3 below).

import { useRef, useState, useEffect, useLayoutEffect, useCallback, memo } from 'react';
import MapContainer from './MapContainer.jsx';
import BottomCard from './BottomCard.jsx';
import RecenterButton from './RecenterButton.jsx';
import MapLoadingOverlay from './MapLoadingOverlay.jsx';
import { useDailyRound } from '../hooks/useDailyRound.js';
import { useMapState } from '../hooks/useMapState.js';
import { showResult, clearResult, zoomToSiteBoundary, RESULT_FIT_EASING, ROUND_RESET_DURATION_MS } from '../game/resultLayer.js';
import { showHint2, hideHint2 } from '../game/stateHighlight.js';
import { MAP_CONFIG, DAILY, CATEGORY_META } from '../config.js';
import './DailyMap.css';

// Icons -- same inline-SVG, currentColor convention as BottomCard.jsx's IconSkip etc.
// IconPause and IconPlay both stay mounted permanently (rather than being
// swapped via a ternary, which used to unmount/remount the whole subtree)
// so DailyMap.css can cross-fade between them -- a remount only ever gives
// the incoming icon an animated entrance, never the outgoing one an exit.
// `visible` just toggles the `is-visible` class; the transition itself
// lives entirely in CSS.
function IconPause({ size = 16, visible }) {
  return (
    <svg className={`dm-pause-icon${visible ? ' is-visible' : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="5" width="4" height="14" rx="2" fill="currentColor" />
      <rect x="13" y="5" width="4" height="14" rx="2" fill="currentColor" />
    </svg>
  );
}

function IconPlay({ size = 16, visible }) {
  return (
    <svg className={`dm-pause-icon${visible ? ' is-visible' : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 6.4v11.2a1 1 0 0 0 1.53.85l8.97-5.6a1 1 0 0 0 0-1.7l-8.97-5.6a1 1 0 0 0-1.53.85Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Layer-mode icons for the Terrain/Normal + Satellite square buttons --
// identical to ClassicMap.jsx's set, duplicated rather than shared per
// this codebase's no-shared-icon-module rule. Paths match the
// mountain/map-2/satellite glyphs from the approved mockup.
// Same glyph as BottomNav's Daily tab icon -- duplicated locally per this
// codebase's icon convention (no shared icon module).
function IconFire({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {/* translate recenters the path -- its raw coordinates sit ~1 unit
          left and ~1.75 units down from the viewBox center, which threw
          off badge centering regardless of flex alignment. */}
      <path
        d="M12 21c-3.5 0-6-2.2-6-5.6 0-2 1-3.6 1-3.6s.4 1.4 1.4 2c-.3-2.6.6-5.4 3-7.3.4 1.8 1.3 2.8 2.3 3.7 1.7 1.5 2.3 3.1 2.3 5.2 0 3.4-2.5 5.6-4 5.6Z"
        fill="currentColor" transform="translate(1, -1.75)"
      />
    </svg>
  );
}

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

function formatTime(totalSeconds) {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Dark text -> amber under 30s -> red under 10s.
function timerColor(remaining) {
  if (remaining < 10) return '#dc2626';
  if (remaining < 30) return '#f59e0b';
  return 'var(--eg-ink, #111827)';
}

export const DailyMap = memo(function DailyMap({ mapRef, visible, sites, dailySites, onComplete, active = true }) {
  const cardRef = useRef(null);
  // Tracks BottomCard's real height during REVEALING, so RecenterButton can
  // be positioned above the expanded card instead of being hidden by it.
  const [cardHeight, setCardHeight] = useState(null);
  // Lifted out of BottomCard (rather than its own local state) so the
  // collapse toggle and the cardHeight re-measure below fire in the same
  // React commit -- see the useLayoutEffect's comment for why that matters.
  const [collapsed, setCollapsed] = useState(false);

  const {
    mapReady,
    mapLoadSlow,
    satellite,
    satelliteUnavailable,
    terrain,
    setSatellite,
    setTerrain,
  } = useMapState(mapRef, 'daily');

  const {
    roundState,
    isLastRound,
    site,
    guess,
    markerPlaced,
    hintLevel,
    result,
    results,
    timeRemaining,
    paused,
    handleMapClick,
    handleHint,
    handleConfirm,
    handleNextSite,
    handleStart,
    handlePauseToggle,
  } = useDailyRound(sites, dailySites, active);

  // Effect 1 (mirrors ClassicMap.jsx): draws/clears the reveal off
  // [mapReady, roundState, result]. fitPadding is measured from the real
  // card height since Daily's extra summary lines (hint penalty / round
  // score / running total) change the card's height.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (roundState === 'REVEALING' && result) {
      setCollapsed(false); // a collapse from the last round shouldn't carry into this one
      // cardHeight itself is kept in sync by the useLayoutEffect below --
      // this one-off read is only for the map's own fitBounds padding.
      const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? 200;
      const fitPadding = { top: 60, bottom: measuredHeight + 20, left: 40, right: 40 };
      showResult(map, guess, site, {
        distanceKmOverride: result.distanceKm,
        nearestLng: result.nearestLng,
        nearestLat: result.nearestLat,
        fitPadding,
      });
    } else if (roundState === 'LOADING') {
      clearResult(map);
      // Next Site (and Skip's auto-advance) lands here -- reset to the
      // default India-wide framing, same eased curve resultLayer.js's own
      // reveal fitBounds uses so the camera doesn't snap between a
      // smoothed reveal and an untouched default reset.
      map.fitBounds(MAP_CONFIG.INDIA_BOUNDS, {
        padding: MAP_CONFIG.FIT_PADDING,
        duration: ROUND_RESET_DURATION_MS,
        easing: RESULT_FIT_EASING,
      });
    }
  }, [mapReady, roundState, result, guess, site, mapRef]);

  // Effect 2 (mirrors ClassicMap.jsx): Hint-2 highlight off
  // [mapReady, hintLevel, site, roundState]. Gated on roundState since
  // hintLevel stays 2 throughout REVEALING -- without this gate the
  // highlight would sit on top of resultLayer.js's own boundary reveal
  // instead of handing off to it the moment Confirm fires.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !site) return;

    const shouldShow = hintLevel >= 2 && (roundState === 'READING' || roundState === 'PLACING');
    if (shouldShow) showHint2(map, site);
    else hideHint2(map);
  }, [mapReady, hintLevel, site, roundState, mapRef]);

  // Same fix as ClassicMap.jsx: keeps cardHeight (and so RecenterButton's
  // `bottom`) in sync with the card's target height on every render that
  // can change it -- including the collapse/expand toggle, not just the
  // initial pill -> expanded reveal.
  //
  // Uses scrollHeight, not getBoundingClientRect().height: scrollHeight
  // reports the content's natural height even while BottomCard.css's
  // max-height is still clipping the box, so it already reads the *target*
  // height before the 0.3s max-height transition has even started.
  //
  // Runs in useLayoutEffect (not useEffect) so setCardHeight is applied
  // before the browser paints -- committing the new height in the same
  // paint as the `collapsed`/`roundState` class change means both elements'
  // CSS transitions (card's max-height, button's bottom -- both 0.3s ease)
  // start on the same frame and animate in sync, instead of the button
  // waiting for the card's transitionend to fire (previously visible as a
  // pause-then-jump).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || roundState !== 'REVEALING') return;
    setCardHeight(card.scrollHeight);
  }, [roundState, result, collapsed]);

  // Effect 3: pausing freezes the map in place -- disable every pan/zoom/
  // rotate handler on pause, restore them on resume.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const handlers = [
      map.dragPan, map.scrollZoom, map.boxZoom,
      map.dragRotate, map.touchZoomRotate, map.touchPitch,
      map.doubleClickZoom, map.keyboard,
    ];
    handlers.forEach((h) => (paused ? h.disable() : h.enable()));
  }, [paused, mapReady, mapRef]);

  // Round 5's "Next" hands off to the parent instead of looping back to
  // LOADING; this is what triggers the DAILY_SUMMARY transition.
  const handleNext = useCallback(() => {
    if (isLastRound) {
      onComplete?.(results);
    } else {
      handleNextSite();
    }
  }, [isLastRound, results, handleNextSite, onComplete]);

  // "Show Site Boundary" button -- zooms in on the revealed site's polygon.
  // Recomputes fitPadding live since cardRef's height can only be read live.
  const handleShowBoundary = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? 200;
    zoomToSiteBoundary(map, { top: 60, bottom: measuredHeight + 20, left: 40, right: 40 });
  }, [mapRef]);

  const dailyTotal = results.reduce((sum, r) => sum + r.finalScore, 0);

  // What clicking the Terrain/Basemap square actually does, for its
  // aria-label/title -- mirrors ClassicMap.jsx's terrainBtnAction.
  const terrainBtnAction = satellite
    ? 'Turn off satellite view'
    : terrain ? 'Switch to basemap' : 'Switch to terrain map';

  return (
    <div className={visible ? 'eg-daily-map is-active' : 'eg-daily-map'}>
      {/* Top-right stack: round timer, then the Terrain/Satellite squares
          directly below it, stretch-aligned to the same width/right edge
          (Daily forces state borders on at all times via useMapState, so
          there's no Borders toggle/panel to anchor here). */}
      <div className="dm-top-right-stack">
        <div className="dm-timer-card">
          {(roundState === 'READING' || roundState === 'PLACING') && (
            <button
              type="button"
              className="dm-pause-btn"
              onClick={handlePauseToggle}
              aria-label={paused ? 'Resume timer' : 'Pause timer'}
            >
              {/* Both icons stay mounted -- DailyMap.css cross-fades between
                  them via the `is-visible` class (see IconPause/IconPlay's
                  comment above). */}
              <IconPause size={20} visible={!paused} />
              <IconPlay size={20} visible={paused} />
            </button>
          )}
          {/* Gated to READING/PLACING and !paused -- timer.pause() on
              REVEALING freezes timeRemaining at whatever it was, so without
              this gate a low-time confirm would leave the digits pulsing
              red through the whole reveal for no reason. */}
          <span
            className={`dm-timer-time${
              (roundState === 'READING' || roundState === 'PLACING') && !paused && timeRemaining > 0 && timeRemaining < 10
                ? ' dm-timer-urgent'
                : ''
            }`}
            style={{ color: timerColor(timeRemaining) }}
          >
            {formatTime(timeRemaining)}
          </span>
          <div className="dm-timer-dots" aria-hidden="true">
            {DAILY.CATEGORIES.map((cat, i) => {
              const dotState = i < results.length ? 'done' : 'upcoming';
              const color = CATEGORY_META[cat].color;
              const dotStyle = dotState === 'done' ? { background: color } : { borderColor: color };
              return <span key={cat} className={`dm-timer-dot dm-timer-dot--${dotState}`} style={dotStyle} />;
            })}
          </div>
        </div>
        <div className="dm-mode-row">
          {/* Terrain/Basemap is one control, not two -- icon and caption show
              the CURRENT mode ("Terrain" + mountain while terrain is on,
              "Basemap" + flat map otherwise), mirroring ClassicMap.jsx's
              version of this same pattern (see its comment for the full
              rationale). .is-active is unconditional here (unlike the
              satellite square, which has a true off state) -- this button
              always shows one of its two modes, never "neither". While
              satellite is on, this button is dimmed via .is-inert but stays
              clickable -- clicking it turns satellite off and reveals
              whatever terrain/basemap choice was already set, rather than
              also flipping it on the same click. No panel wrapper (unlike
              Classic's Terrain/Satellite, which never had one either) --
              each square carries its own background, and Daily has no
              Borders toggle to anchor a panel around. */}
          <div className="dm-mode-item">
            <button
              type="button"
              className={`dm-mode-btn is-active${satellite ? ' is-inert' : ''}`}
              disabled={!mapReady}
              onClick={() => (satellite ? setSatellite(false) : setTerrain(!terrain))}
              aria-label={terrainBtnAction}
              aria-pressed={terrain}
              title={terrainBtnAction}
            >
              {terrain ? <IconMountain /> : <IconMapFlat />}
            </button>
            <span className="dm-mode-label" aria-hidden="true">{terrain ? 'Terrain' : 'Basemap'}</span>
          </div>
          <div className="dm-mode-item">
            <button
              type="button"
              className={`dm-mode-btn${satellite ? ' is-active' : ''}`}
              disabled={!mapReady || satelliteUnavailable}
              onClick={() => setSatellite(!satellite)}
              aria-label={satellite ? 'Turn off satellite view' : 'Turn on satellite view'}
              aria-pressed={satellite}
              title={satellite ? 'Turn off satellite view' : 'Turn on satellite view'}
            >
              <IconSatellite />
            </button>
            <span className="dm-mode-label" aria-hidden="true">Satellite</span>
          </div>
        </div>
        {satelliteUnavailable && (
          <span className="dm-sat-warning" title="Satellite imagery unavailable right now">
            Satellite unavailable
          </span>
        )}
      </div>

      {paused && <div className="dm-paused-overlay">Paused</div>}


      <MapContainer
        mapRef={mapRef}
        onMapClick={handleMapClick}
        guess={guess}
        guessMarkerVisible={roundState !== 'REVEALING'}
      />
      <MapLoadingOverlay active={!mapReady} slow={mapLoadSlow} />
      <RecenterButton
        mapRef={mapRef}
        disabled={paused}
        style={
          roundState === 'REVEALING' && cardHeight
            ? { bottom: `calc(var(--eg-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 12px + ${cardHeight}px + 12px)` }
            : undefined
        }
      />

      {!site ? (
        <div className="dm-loading-pill">Loading today's challenge…</div>
      ) : roundState === 'NOT_STARTED' ? (
        // Round 1's Start gate -- timer hasn't started yet (useDailyRound
        // only calls timer.start() on entering READING, which handleStart
        // triggers) and the guess panel hasn't appeared yet either. Rounds
        // 2-5 never hit this branch.
        //
        // Also gated on mapReady (not just roundState): `site` resolving
        // (protected-areas.json fetch) races independently of the map's
        // own style/tile/sprite/glyph load, and in practice the sites JSON
        // usually wins that race -- so without this, the button could
        // appear and be tappable while the map underneath still has no
        // borders/hillshade and the Terrain/Satellite toggles disabled,
        // and tapping it would start the real 120s countdown against that
        // incomplete map. Disabled (but same label) until mapReady --
        // MapLoadingOverlay above already owns the "still loading"
        // messaging, so the button doesn't duplicate it; the onClick
        // re-check is belt-and-suspenders for the gap between mapReady
        // flipping true and the disabled attribute re-rendering.
        <div className="dm-start-pill">
          <button
            type="button"
            className="dm-start-btn"
            disabled={!mapReady}
            onClick={() => { if (mapReady) handleStart(); }}
          >
            <span className="dm-start-icon"><IconFire size={34} /></span>
            <span>Start Daily Challenge</span>
          </button>
        </div>
      ) : (
        <BottomCard
          ref={cardRef}
          mode="daily"
          site={site}
          roundState={roundState}
          markerPlaced={markerPlaced}
          hintLevel={hintLevel}
          collapsed={collapsed}
          onToggleCollapsed={setCollapsed}
          onHint={handleHint}
          onConfirm={handleConfirm}
          result={result}
          dailyTotal={dailyTotal}
          onNextSite={handleNext}
          onShowBoundary={handleShowBoundary}
          nextLabel={isLastRound ? 'Results' : 'Next Site'}
          cardHeight={cardHeight}
        />
      )}
    </div>
  );
});
