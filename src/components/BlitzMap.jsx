// src/components/BlitzMap.jsx
// Wires MapContainer + BlitzCard + useBlitzRound into the playable Blitz
// screen. Mirrors ClassicMap.jsx's role, stripped of pin-drop/distance
// specifics: no SatelliteOverlay, no layer-toggle panel (borders are forced
// on inside useMapState for mode==='blitz'), no difficulty. Category +
// Region/State filters are shared with Classic via the same `filters` prop.
//
// cardRef/cardHeight/transitionend mirror ClassicMap.jsx's pattern for
// measuring BlitzCard's real height (it isn't constant-height -- a site's
// correctStates can wrap onto an extra line), so RecenterButton and the
// boundary zoom don't end up under the expanded card.

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
import { recordBlitzResult, recordSiteEncounter } from '../game/stats.js';
import { LAYER_IDS, MAP_CONFIG, BARE_VISUAL } from '../config.js';
import { TERRAIN_PLACE_LABEL_IDS } from '../hooks/useMapState.js';
import './BlitzMap.css';

// Same flame glyph as BottomNav.jsx's Daily-tab icon -- duplicated rather
// than imported, per this codebase's no-shared-icon-module convention (each
// component file owns its own small inline SVGs).
function IconFlame({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21c-3.5 0-6-2.2-6-5.6 0-2 1-3.6 1-3.6s.4 1.4 1.4 2c-.3-2.6.6-5.4 3-7.3.4 1.8 1.3 2.8 2.3 3.7 1.7 1.5 2.3 3.1 2.3 5.2 0 3.4-2.5 5.6-4 5.6Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
    </svg>
  );
}

// Derives Blitz's flat look from the same map-style.json Classic/Daily
// use, applied to the fetched style JSON before MapContainer.jsx
// constructs the map from it -- see MapContainer's styleTransform doc
// comment for why this has to happen pre-construction rather than via
// setPaintProperty in onLoad (the paint overrides could technically happen
// post-load too, but doing them here avoids a one-frame flash of the
// earthy Classic/Daily palette before switching to bare).
// Used to be a second, hand-maintained static file (map-style-ofm.json) --
// see config.js's MAP_STYLE comment for why that was retired.
function blitzStyleTransform(styleJson) {
  const style = JSON.parse(JSON.stringify(styleJson)); // plain data, safe to round-trip

  // openmaptiles.maxzoom is now set directly in map-style.json (shared by
  // all three modes -- Classic/Daily's camera reaches z12 with no detail
  // gain past the same z10 cap Blitz already relied on), so no per-mode
  // override is needed here anymore.

  // Dropped entirely, not just hidden -- MapLibre fetches a geojson
  // source's full data as soon as it's registered regardless of layer
  // visibility, so removing physical-features here is what actually saves
  // that request for a mode that never renders it. terrain-dem's tiles are
  // already skipped by hypsometric-tint/base-hillshade's visibility:none
  // default in map-style.json, but there's no reason to carry the unused
  // source either.
  const dropLayerIds = new Set(['hypsometric-tint', 'base-hillshade', 'physical_feature_label']);
  style.layers = style.layers.filter((l) => !dropLayerIds.has(l.id));
  delete style.sources['terrain-dem'];
  delete style.sources['physical-features'];

  // Same flat palette Classic/Daily's Terrain toggle switches to when off
  // -- see BARE_VISUAL in config.js for why these values live there and
  // aren't duplicated here.
  const paintOverrides = {
    background: { 'background-color': BARE_VISUAL.BACKGROUND },
    water: { 'fill-color': BARE_VISUAL.WATER_COLOR, 'fill-opacity': BARE_VISUAL.WATER_OPACITY },
    boundary_2: {
      'line-color': BARE_VISUAL.BOUNDARY_COLOR,
      'line-opacity': BARE_VISUAL.BOUNDARY_OPACITY_EXPR,
      'line-width': BARE_VISUAL.BOUNDARY_WIDTH_EXPR,
    },
    boundary_disputed: { 'line-color': BARE_VISUAL.BOUNDARY_COLOR, 'line-width': BARE_VISUAL.BOUNDARY_WIDTH_EXPR },
    waterway_river: { 'line-color': BARE_VISUAL.RIVER_COLOR },
    waterway_other: { 'line-color': BARE_VISUAL.RIVER_COLOR },
  };
  for (const id of TERRAIN_PLACE_LABEL_IDS) paintOverrides[id] = { ...BARE_VISUAL.PLACE_LABEL_PAINT };

  for (const layer of style.layers) {
    if (paintOverrides[layer.id]) layer.paint = { ...layer.paint, ...paintOverrides[layer.id] };
    if (layer.id === 'water') layer.filter = BARE_VISUAL.WATER_FILTER;
  }

  return style;
}

// fitPadding for zoomToBoundary() once "Show Boundary" is pressed; `bottom`
// is computed per round from cardRef's measured height, same constants
// ClassicMap.jsx uses for REVEAL_FIT_SIDES/REVEAL_CARD_GAP.
const REVEAL_FIT_SIDES = { top: 60, left: 40, right: 40 };
const REVEAL_CARD_GAP = 20; // gap above the card's top edge

/**
 * @param {{current: import('maplibre-gl').Map|null}} mapRef
 * @param {React.CSSProperties} style
 * @param {import('../config').Site[]} sites - full unfiltered list from App.jsx
 * @param {{categories: string[], states: string[]}} [filters] - same lifted
 *   filter state as ClassicMap.jsx (Category + Region/State), shared with Blitz.
 */
export default function BlitzMap({ mapRef, style, sites, filters = DEFAULT_FILTERS }) {
  const sitePool = useMemo(
    () => sites.filter((s) => siteMatchesFilter(s, filters)),
    [sites, filters]
  );

  const {
    roundState, site, selectedState, result, streak, bestStreak,
    handleStateClick, handleConfirm, handleNextSite, handleSkip,
  } = useBlitzRound(sitePool);

  const { mapReady, politicalNames, setPoliticalNames } = useMapState(mapRef, 'blitz');
  // political is forced true inside useMapState's onLoad for mode==='blitz'
  // -- this component never calls setPolitical itself. politicalNames (the
  // "State Names" toggle below) stays player-controlled.

  const cardRef = useRef(null); // measures BlitzCard's height, same role as ClassicMap.jsx's cardRef
  // Tracked during REVEALING so RecenterButton can sit above the expanded
  // card instead of being hidden by it.
  const [cardHeight, setCardHeight] = useState(null);

  // Drives the streak card's feedback animation: 'up' on a correct guess
  // (streak increases), 'break' when a guess resets a live streak back to
  // 0. Compared against the previous streak value via a ref rather than
  // derived from `result.isCorrect` directly, since that would also fire
  // on a wrong guess made with no streak yet to break (0 -> 0, nothing
  // worth animating). Read by the streak-value <span> below, which is
  // additionally keyed on `streak` so each change gets a fresh element and
  // therefore always replays its animation, even if the same class name
  // repeats on two consecutive changes.
  const [streakAnim, setStreakAnim] = useState(null); // 'up' | 'break' | null
  const prevStreakRef = useRef(streak);
  useEffect(() => {
    const prev = prevStreakRef.current;
    if (streak > prev) setStreakAnim('up');
    else if (streak === 0 && prev > 0) setStreakAnim('break');
    prevStreakRef.current = streak;
  }, [streak]);

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
  //
  // Previously this called showHintRegion/hideHintRegion imperatively from
  // handleHint + a bare setTimeout, with no re-sync on site/roundState
  // change. That's an independent side-channel from React's render cycle --
  // if a round advanced (Skip, a fast Confirm) while a hint was showing,
  // there was a brief window where the PREVIOUS round's amber region was
  // still the last thing painted on the map until something (a state
  // change, or the timer) got around to correcting it, which read as the
  // last hint flickering in before the current one. hintToken + the effect
  // below instead mirrors stateHighlight.js's showHint2/hideHint2 wiring in
  // ClassicMap.jsx: show/hide is fully derived from [site, roundState,
  // hintToken] every render, so a site or roundState change is always
  // reflected immediately rather than waiting on a stale timer callback.
  //
  // That effect alone still isn't quite enough, though: useEffect runs
  // AFTER the browser paints, while MapLibre draws to its own canvas on a
  // separate render loop from React. So there's still one real frame,
  // between a round-ending tap (Skip/Confirm/Next Site) and this effect
  // actually firing, where React has already committed the new roundState
  // but hideHintRegion hasn't run yet -- and that one frame is enough for
  // the OLD round's amber hint to visibly flash before it's cleared. The
  // three wrappers below (used in place of the raw handlers, JSX further
  // down) clear the hint synchronously, in the exact same click handler
  // that starts the transition, so there's no gap left for a stale frame
  // to slip through. The declarative effect stays as the source of truth
  // for the 3s auto-hide and any other site/roundState resync.
  const [hintToken, setHintToken] = useState(0); // 0 = hidden; >0 = shown, bumped on each tap
  function handleHint() {
    setHintToken((t) => t + 1);
  }
  function clearHintNow() {
    hideHintRegion(mapRef.current);
    setHintToken(0);
  }
  function handleConfirmClearingHint() {
    clearHintNow();
    handleConfirm();
  }
  function handleNextSiteClearingHint() {
    clearHintNow();
    handleNextSite();
  }
  function handleSkipClearingHint() {
    clearHintNow();
    handleSkip();
  }

  // Declarative show/hide -- the only place that calls showHintRegion/
  // hideHintRegion. Always re-evaluates against the CURRENT site, so a
  // round change (site/roundState both flip together) can never leave a
  // previous round's region on screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const shouldShow = hintToken > 0 && site && (roundState === 'READING' || roundState === 'SELECTING');
    if (shouldShow) showHintRegion(map, getRegionHintStates(site.state));
    else hideHintRegion(map);
  }, [mapRef, mapReady, site, roundState, hintToken]);

  // Auto-hide after 3s of the most recent tap -- just resets hintToken;
  // the effect above turns that into the actual hideHintRegion call.
  useEffect(() => {
    if (hintToken === 0) return;
    const t = setTimeout(() => setHintToken(0), 3000);
    return () => clearTimeout(t);
  }, [hintToken]);

  // Reset on every new round so a leftover hintToken from the last site
  // can't immediately re-show once the next site's effect above re-runs.
  useEffect(() => {
    if (roundState === 'LOADING') setHintToken(0);
  }, [roundState]);

  // SELECTING preview. Deliberately does nothing while REVEALING -- the
  // effect below owns the blue->green/red handoff so the two never race.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || roundState === 'REVEALING') return;
    if (roundState === 'SELECTING' && selectedState) showSelection(map, selectedState);
    else clearAll(map);
  }, [mapRef, mapReady, roundState, selectedState]);

  // REVEALING -> green/red (showReveal opens with its own clearAll), plus a
  // fast reset to the default India-wide framing (500ms, distinct from the
  // slower 1200ms "Show Boundary" zoom, which is meant to linger).
  // LOADING -> clear everything before the next site's blue preview starts.
  // (Hint region hide/show is fully owned by the declarative effect above --
  // this effect no longer touches it.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (roundState === 'REVEALING' && result) {
      showReveal(map, result.correctStates, result.guessedState, result.isCorrect, result.site);
      map.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: MAP_CONFIG.FIT_PADDING, duration: 500 });
    } else if (roundState === 'LOADING') {
      clearAll(map);
    }
  }, [mapRef, mapReady, roundState, result]);

  // Records the round once REVEALING starts; same identity-guard shape as
  // ClassicMap.jsx's recordClassicResult effect (prevents Strict Mode's
  // dev-only double-invoke from recording the same round twice).
  const recordedResultRef = useRef(null);
  useEffect(() => {
    if (roundState !== 'REVEALING' || !result) return;
    if (recordedResultRef.current === result) return;
    recordedResultRef.current = result;
    recordBlitzResult(result, streak);
    recordSiteEncounter(result.site.id);
  }, [roundState, result, streak]);

  // State names are fully player-controlled via the toggle below; this only
  // resets them to hidden on each new round (LOADING) so nothing carries
  // over from the last one. Also clears any "Show Boundary" polygon from
  // the previous site (hint reset is now the dedicated effect above).
  useEffect(() => {
    if (roundState === 'LOADING') {
      setPoliticalNames(false);
      clearBoundary(mapRef.current);
    }
  }, [mapRef, roundState, setPoliticalNames]);

  // Measures BlitzCard's height the instant roundState flips to REVEALING,
  // before BottomCard.css's 0.3s max-height transition finishes -- so this
  // initially reads a height close to the pill's 64px. Corrected by the
  // transitionend effect below once the animation completes (same
  // race/fix as ClassicMap.jsx's cardRef).
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
      <div className="bz-top-right-stack">
        {/* Session streak -- tracked by useBlitzRound.js the whole time but
            previously never surfaced in the UI. Always mounted (not gated
            on streak > 0) so its position never jumps mid-session; the
            flame icon itself communicates "no streak yet" via its own
            gray-vs-lit color transition. */}
        <div className="bz-streak-card" aria-live="polite">
          <div className="bz-streak-main">
            <span className={`bz-streak-flame${streak > 0 ? ' bz-flame-active' : ''}`}>
              <IconFlame />
            </span>
            <span
              key={streak}
              className={`bz-streak-value${streakAnim === 'up' ? ' bz-streak-pop' : streakAnim === 'break' ? ' bz-streak-break' : ''}`}
            >
              {streak}
            </span>
          </div>
          {bestStreak > 0 && <span className="bz-streak-best">Best {bestStreak}</span>}
        </div>
        <div className="bz-layer-panel">
          <label className="eg-toggle">
            <input
              type="checkbox"
              className="eg-toggle-input"
              checked={politicalNames}
              disabled={!mapReady}
              onChange={() => setPoliticalNames(!politicalNames)}
            />
            <span className="eg-toggle-track"><span className="eg-toggle-thumb" /></span>
            State Names
          </label>
        </div>
      </div>

      {sitePool.length === 0 && (
        <div className="bz-empty-pool">No sites match these filters.</div>
      )}

      <MapContainer mapRef={mapRef} onMapClick={handleMapClick} guess={null} styleTransform={blitzStyleTransform} />
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
          onConfirm={handleConfirmClearingHint}
          onNextSite={handleNextSiteClearingHint}
          onSkip={handleSkipClearingHint}
          onHint={handleHint}
          onShowBoundary={handleShowBoundary}
        />
      )}
    </div>
  );
}
