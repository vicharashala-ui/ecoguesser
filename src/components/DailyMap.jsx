// src/components/DailyMap.jsx
//
// Daily Challenge's playable round screen -- the Daily-mode counterpart to
// ClassicMap.jsx. Wires MapContainer + BottomCard + useDailyRound + useMapState
// together the same way ClassicMap.jsx does: two useEffects drive the map side
// of the round state machine, since useDailyRound (like useClassicRound)
// deliberately owns no map state and no API calls.
//
// Scope boundary: this component owns the round itself (rounds 1-5, timer,
// hints, skip) but NOT navigation away from it. Section 4's screen state
// machine routes round 5's "Next" to DAILY_SUMMARY rather than back through
// LOADING -- that's a parent/screen-router concern, so this component just
// calls `onComplete(results)` once the 5th round is confirmed and lets the
// caller decide what happens next (DAILY_SUMMARY -> POST /api/score, etc.).
//
// Revised after seeing the real BottomCard.jsx/.css (previous draft guessed
// wrong on a few points):
//   - BottomCard is a DEFAULT export, not named.
//   - The cumulative-score prop is `dailyTotal`, not `runningTotal` --
//     "cumulative score AFTER this round." useDailyRound's `results` already
//     includes the just-finalized round by the time roundState flips to
//     REVEALING (finalizeRound pushes to `results` before setting
//     REVEALING), so summing it here is correct, just renamed.
//   - There's no `nextLabel` prop -- "Next Site" is hardcoded in
//     BottomCard.jsx regardless of mode. Round 5 will say "Next Site" too
//     unless you add a label prop to BottomCard.jsx itself; left alone here
//     since that's editing a file you didn't ask me to touch.
//   - BottomCard reads `site.category` with no null-guard, so it cannot be
//     rendered before `site` resolves. useDailyRound's `site` is null until
//     `getDailySites` returns (on mount, before the LOADING->READING
//     handoff) -- added an explicit loading branch below to cover that gap,
//     which the previous draft would have crashed on.
//
// Confirmed against the real source (previous draft only inferred these):
//   - MapContainer.jsx is a DEFAULT export, not named -- import fixed below.
//   - MapContainer's `onMapClick`/`guess` props and useMapState's
//     `useMapState(mapRef, mode)` signature were both correct as guessed.
//   - Section 3 Tile Efficiency's interaction lock during REVEALING uses
//     useMapState's existing `lockInteraction`/`unlockInteraction` --
//     ClassicMap.jsx doesn't consume these yet, so this is the first
//     caller, not a duplication of an existing Classic-side lock.
//
// Design note (unchanged, not a guess): Decision #2's v8.16 Borders-auto-toggle
// on REVEALING is Classic-only per spec -- deliberately not replicated below.

import { useRef, useEffect, useCallback } from 'react';
import MapContainer from './MapContainer.jsx';
import BottomCard from './BottomCard.jsx';
import RecenterButton from './RecenterButton.jsx';
import { useDailyRound } from '../hooks/useDailyRound.js';
import { useMapState } from '../hooks/useMapState.js';
import { showResult, clearResult } from '../game/resultLayer.js';
import { showHint2, hideHint2 } from '../game/stateHighlight.js';
import './DailyMap.css';

function formatTime(totalSeconds) {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Decision #6: white -> amber <30s -> red <10s.
function timerColor(remaining) {
  if (remaining < 10) return '#dc2626';
  if (remaining < 30) return '#f59e0b';
  return '#ffffff';
}

export function DailyMap({ mapRef, style, sites, onComplete }) {
  const cardRef = useRef(null);

  const {
    mapReady,
    satellite,
    political,
    satelliteUnavailable,
    setSatellite,
    setPolitical,
    lockInteraction,
    unlockInteraction,
  } = useMapState(mapRef, 'daily');

  const {
    roundState,
    roundIndex,
    totalRounds,
    isLastRound,
    site,
    guess,
    markerPlaced,
    hintLevel,
    result,
    results,
    timeRemaining,
    handleMapClick,
    handleHint,
    handleConfirm,
    handleSkip,
    handleNextSite,
  } = useDailyRound(sites);

  // Effect 1 (mirrors ClassicMap.jsx): resultLayer.js off [mapReady, roundState, result].
  // fitPadding is measured from the real card height, same fix as Section 10's
  // v8.16 note -- a static guess breaks once Daily's extra summary lines
  // (hint penalty / round score / running total) change the card's height.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (roundState === 'REVEALING' && result) {
      const fitPadding = {
        top: 60,
        bottom: (cardRef.current?.getBoundingClientRect().height ?? 200) + 20,
        left: 40,
        right: 40,
      };
      showResult(map, guess, site, { distanceKmOverride: result.distanceKm, fitPadding });
    } else if (roundState === 'LOADING') {
      clearResult(map);
    }
  }, [mapReady, roundState, result, guess, site, mapRef]);

  // Effect 2 (mirrors ClassicMap.jsx): Hint-2 highlight off
  // [mapReady, hintLevel, site, roundState]. Gated on roundState, not just
  // hintLevel -- hintLevel is still 2 throughout REVEALING (Section 11), so
  // without this gate the highlight would sit on top of resultLayer.js's own
  // boundary reveal instead of handing off to it the moment Confirm fires.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !site) return;

    const shouldShow = hintLevel >= 2 && (roundState === 'READING' || roundState === 'PLACING');
    if (shouldShow) showHint2(map, site);
    else hideHint2(map);
  }, [mapReady, hintLevel, site, roundState, mapRef]);

  // Section 3 Tile Efficiency: lock map panning during the post-guess
  // animation (pan-only -- zoom stays usable, see useMapState.js's
  // lockInteraction). Uses useMapState's lockInteraction/unlockInteraction
  // rather than duplicating the logic here.
  useEffect(() => {
    if (roundState === 'REVEALING') lockInteraction();
    else unlockInteraction();
  }, [roundState, lockInteraction, unlockInteraction]);

  // Round 5's "Next" hands off to the parent instead of looping back to
  // LOADING (Section 4). useDailyRound's own handleNextSite already no-ops
  // past the last round, so this branch is what actually triggers the
  // DAILY_SUMMARY transition, not just a redundant guard.
  const handleNext = useCallback(() => {
    if (isLastRound) {
      onComplete?.(results);
    } else {
      handleNextSite();
    }
  }, [isLastRound, results, handleNextSite, onComplete]);

  const skipDisabled = roundState !== 'READING' && roundState !== 'PLACING';
  const dailyTotal = results.reduce((sum, r) => sum + r.finalScore, 0);

  return (
    <div style={style} className="eg-daily-map">
      {/* Section 8 Daily sub-header: [timer] 1:43   Round 2/5   [Skip] */}
      <div className="eg-daily-subheader">
        <span className="eg-timer" style={{ color: timerColor(timeRemaining) }}>
          {formatTime(timeRemaining)}
        </span>
        <span className="eg-round-counter">
          Round {roundIndex + 1}/{totalRounds}
        </span>
        <button className="btn-skip" onClick={handleSkip} disabled={skipDisabled}>
          Skip
        </button>
      </div>

      {/* Section 8 Daily layer panel: OFM (always on) + Satellite + Political.
          No Names row -- politicalNames is always false in Daily, never
          surfaced as a toggle. Mirrors ClassicMap.css's .cm-layer-panel
          placeholder styling/structure (that panel is itself explicitly a
          carried-over placeholder, not Section 8's final icon-button UI --
          same status here). */}
      <div className="dm-layer-panel">
        <label>
          <input
            type="checkbox"
            checked={satellite}
            disabled={satelliteUnavailable}
            onChange={() => setSatellite(!satellite)}
          />
          Satellite
        </label>
        {satelliteUnavailable && (
          <span className="dm-sat-warning" title="Satellite imagery unavailable right now">
            Satellite unavailable
          </span>
        )}
        <label>
          <input type="checkbox" checked={political} onChange={() => setPolitical(!political)} />
          Political
        </label>
      </div>

      <MapContainer mapRef={mapRef} onMapClick={handleMapClick} guess={guess} />
      {roundState !== 'REVEALING' && <RecenterButton mapRef={mapRef} />}

      {site ? (
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
          nextLabel={isLastRound ? 'Results' : 'Next Site'}
        />
      ) : (
        <div className="dm-loading-pill">Loading today's challenge…</div>
      )}
    </div>
  );
}
