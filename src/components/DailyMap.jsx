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

import { useRef, useState, useEffect, useCallback } from 'react';
import MapContainer from './MapContainer.jsx';
import BottomCard from './BottomCard.jsx';
import RecenterButton from './RecenterButton.jsx';
import { useDailyRound } from '../hooks/useDailyRound.js';
import { useMapState } from '../hooks/useMapState.js';
import { showResult, clearResult, zoomToSiteBoundary } from '../game/resultLayer.js';
import { showHint2, hideHint2 } from '../game/stateHighlight.js';
import { MAP_CONFIG, DAILY, CATEGORY_META } from '../config.js';
import './DailyMap.css';

// Icons -- same inline-SVG, currentColor convention as BottomCard.jsx's IconSkip etc.
function IconPause({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="5" width="4" height="14" rx="2" fill="currentColor" />
      <rect x="13" y="5" width="4" height="14" rx="2" fill="currentColor" />
    </svg>
  );
}

function IconPlay({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
  return '#111827';
}

export function DailyMap({ mapRef, style, sites, onComplete, active = true }) {
  const cardRef = useRef(null);
  // Tracks BottomCard's real height during REVEALING, so RecenterButton can
  // be positioned above the expanded card instead of being hidden by it.
  const [cardHeight, setCardHeight] = useState(null);

  const {
    mapReady,
    satellite,
    satelliteUnavailable,
    setSatellite,
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
  } = useDailyRound(sites, active);

  // Effect 1 (mirrors ClassicMap.jsx): draws/clears the reveal off
  // [mapReady, roundState, result]. fitPadding is measured from the real
  // card height since Daily's extra summary lines (hint penalty / round
  // score / running total) change the card's height.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (roundState === 'REVEALING' && result) {
      const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? 200;
      setCardHeight(measuredHeight);
      const fitPadding = { top: 60, bottom: measuredHeight + 20, left: 40, right: 40 };
      showResult(map, guess, site, { distanceKmOverride: result.distanceKm, fitPadding });
    } else if (roundState === 'LOADING') {
      clearResult(map);
      // Next Site (and Skip's auto-advance) lands here -- reset to the
      // default India-wide framing, same fitBounds call RecenterButton/
      // MapContainer's initial load both use.
      map.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: MAP_CONFIG.FIT_PADDING });
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

  // Same fix as ClassicMap.jsx: BottomCard.css's max-height transition
  // (0.3s, pill->expanded) hasn't finished by the time Effect 1 measures
  // cardRef's height, so cardHeight can freeze at a too-small, mid-
  // transition reading. Re-measure once the transition completes.
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
  function handleShowBoundary() {
    const map = mapRef.current;
    if (!map) return;
    const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? 200;
    zoomToSiteBoundary(map, { top: 60, bottom: measuredHeight + 20, left: 40, right: 40 });
  }

  const dailyTotal = results.reduce((sum, r) => sum + r.finalScore, 0);

  return (
    <div style={style} className="eg-daily-map">
      {/* Top-right stack: round timer with the layer panel (Satellite only --
          Daily forces state borders on at all times via useMapState) sitting
          directly below it. */}
      <div className="dm-top-right-stack">
        <div className="dm-timer-card">
          {(roundState === 'READING' || roundState === 'PLACING') && (
            <button
              type="button"
              className="dm-pause-btn"
              onClick={handlePauseToggle}
              aria-label={paused ? 'Resume timer' : 'Pause timer'}
            >
              {paused ? <IconPlay size={20} /> : <IconPause size={20} />}
            </button>
          )}
          <span className="dm-timer-time" style={{ color: timerColor(timeRemaining) }}>
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
        <div className="dm-layer-panel">
          <label className="eg-toggle">
            <input
              type="checkbox"
              className="eg-toggle-input"
              checked={satellite}
              disabled={!mapReady || satelliteUnavailable}
              onChange={() => setSatellite(!satellite)}
            />
            <span className="eg-toggle-track"><span className="eg-toggle-thumb" /></span>
            Satellite
          </label>
          {satelliteUnavailable && (
            <span className="dm-sat-warning" title="Satellite imagery unavailable right now">
              Satellite unavailable
            </span>
          )}
        </div>
      </div>

      {paused && <div className="dm-paused-overlay">Paused</div>}

      <MapContainer
        mapRef={mapRef}
        onMapClick={handleMapClick}
        guess={guess}
        guessMarkerVisible={roundState !== 'REVEALING'}
      />
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
        <div className="dm-start-pill">
          <button type="button" className="dm-start-btn" onClick={handleStart}>
            Start Daily Challenge
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
          onHint={handleHint}
          onConfirm={handleConfirm}
          result={result}
          dailyTotal={dailyTotal}
          onNextSite={handleNext}
          onShowBoundary={handleShowBoundary}
          nextLabel={isLastRound ? 'Results' : 'Next Site'}
        />
      )}
    </div>
  );
}
