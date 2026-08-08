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

import { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import MapContainer from './MapContainer.jsx';
import BlitzCard from './BlitzCard.jsx';
import RecenterButton from './RecenterButton.jsx';
import MilestoneToast from './MilestoneToast.jsx';
import AchievementToast from './AchievementToast.jsx';
import ConfettiBurst from './ConfettiBurst.jsx';
import MapLoadingOverlay from './MapLoadingOverlay.jsx';
import { useBlitzRound } from '../hooks/useBlitzRound.js';
import { useMapState } from '../hooks/useMapState.js';
import {
  showSelection, showReveal, clearAll, zoomToBoundary, clearBoundary,
  showHintRegion, hideHintRegion,
} from '../game/blitzHighlight.js';
import { siteMatchesFilter, DEFAULT_FILTERS, getRegionHintStates } from '../utils/filters.js';
import { RESULT_FIT_EASING } from '../game/resultLayer.js';
import { recordBlitzResult, recordSiteEncounter } from '../game/stats.js';
import { useAchievementUnlocks } from '../hooks/useAchievementUnlocks.js';
import { hapticPerfect } from '../utils/haptics.js';
import { soundCelebrate } from '../utils/sound.js';
import { LAYER_IDS, MAP_CONFIG, BARE_VISUAL } from '../config.js';
import { TERRAIN_PLACE_LABEL_IDS } from '../hooks/useMapState.js';
import './BlitzMap.css';

// Radius of the streak medallion's progress ring (bz-streak-ring-track/
// -progress below) -- a module-level constant, not recomputed per render,
// since it's fixed by the SVG markup's own r="30".
const STREAK_RING_R = 30;
const STREAK_RING_CIRCUMFERENCE = 2 * Math.PI * STREAK_RING_R;

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

// Streak-restore badge icon -- a heart (an extra life for the streak).
// Filled, not stroke-outline like IconFlame above: a heart drawn as a
// thin outline reads as flimsy/lopsided at badge size, where a solid
// silhouette reads immediately and cleanly. Path is two mirrored cubic
// beziers off a shared center cusp -- the standard symmetric heart
// construction (same curve as Material Design's "favorite" glyph) --
// rather than a hand-tuned one-off, so the two lobes are actually equal.
function IconHeartRestore({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
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
  // No clone here: MapContainer.jsx's mount effect already hands this
  // function a structuredClone'd copy exclusive to this mount (see that
  // file's comment) -- a second full JSON.stringify/parse pass over the
  // same ~20KB style document was pure duplicate work on every Blitz mount.
  const style = styleJson;

  // openmaptiles.maxzoom is now set directly in map-style.json (shared by
  // all three modes -- Classic/Daily's camera reaches z12 with no detail
  // gain past the same z9 cap Blitz already relied on), so no per-mode
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
    water_ocean: { 'fill-color': BARE_VISUAL.OCEAN_COLOR, 'fill-opacity': BARE_VISUAL.WATER_OPACITY },
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
 * @param {boolean} visible - controls display:block/none + fade-in for tab switching (see BlitzMap.css)
 * @param {import('../config').Site[]} sites - full unfiltered list from App.jsx
 * @param {{categories: string[], states: string[]}} [filters] - same lifted
 *   filter state as ClassicMap.jsx (Category + Region/State), shared with Blitz.
 */
function BlitzMap({ mapRef, visible, sites, filters = DEFAULT_FILTERS }) {
  const sitePool = useMemo(
    () => sites.filter((s) => siteMatchesFilter(s, filters)),
    [sites, filters]
  );

  const {
    roundState, site, selectedState, result, streak, bestStreak, streakRestores,
    handleStateClick, handleConfirm, handleNextSite, handleSkip,
  } = useBlitzRound(sitePool);

  const { mapReady, mapLoadSlow, politicalNames, setPoliticalNames } = useMapState(mapRef, 'blitz');
  const { current: newAchievement, recordAndDetect, dismissCurrent: dismissAchievement } = useAchievementUnlocks();

  // Fraction of the current run-of-5 completed, for the streak medallion's
  // progress ring: 1/5 after 1 correct, full (1) exactly on a multiple of
  // 5, then back to 1/5 on the next correct guess after that. Plain
  // ((streak-1) % 5 + 1) rather than (streak % 5) so a just-reached
  // multiple of 5 reads as "full" instead of snapping back to empty the
  // instant it's hit.
  const streakProgress = streak === 0 ? 0 : (((streak - 1) % 5) + 1) / 5;
  // political is forced true inside useMapState's onLoad for mode==='blitz'
  // -- this component never calls setPolitical itself. politicalNames (the
  // "States" toggle below) stays player-controlled.

  // Ring's own displayed dash-offset, decoupled from streakProgress so a
  // lap rollover (progress 1 -> 1/5, the moment a new lap starts right
  // after completing one) can be handled specially: letting the normal
  // 0.4s transition run straight from "full" to "1/5" animates the ring
  // visibly unwinding backward, which reads as losing progress instead of
  // starting a new lap. Instead, on that specific transition the ring is
  // snapped empty with no transition, then (one frame later, transition
  // re-enabled) animated forward to the real target -- same "fill up"
  // motion as every other correct guess.
  const [ringOffset, setRingOffset] = useState(
    STREAK_RING_CIRCUMFERENCE * (1 - streakProgress)
  );
  const [ringTransitionEnabled, setRingTransitionEnabled] = useState(true);
  const prevRingProgressRef = useRef(streakProgress);
  useEffect(() => {
    const prevProgress = prevRingProgressRef.current;
    prevRingProgressRef.current = streakProgress;
    const targetOffset = STREAK_RING_CIRCUMFERENCE * (1 - streakProgress);

    if (prevProgress === 1 && streakProgress > 0 && streakProgress < 1) {
      setRingTransitionEnabled(false);
      setRingOffset(STREAK_RING_CIRCUMFERENCE); // snap to empty
      // Double rAF: the first guarantees the "empty, no transition" state
      // has actually painted before the second re-enables the transition
      // and sets the real target -- a single rAF can still land before
      // that paint on some browsers and skip straight to the animated
      // value, silently undoing the snap.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setRingTransitionEnabled(true);
          setRingOffset(targetOffset);
        });
      });
    } else {
      setRingOffset(targetOffset);
    }
  }, [streakProgress]);


  const cardRef = useRef(null); // measures BlitzCard's height, same role as ClassicMap.jsx's cardRef
  // Tracked during REVEALING so RecenterButton can sit above the expanded
  // card instead of being hidden by it.
  const [cardHeight, setCardHeight] = useState(null);
  // Lifted out of BlitzCard (rather than local state) for the same reason
  // as ClassicMap.jsx's collapsed -- BlitzCard.jsx's collapse toggle and
  // this component's cardHeight re-measure need to agree on the same
  // value; kept in sync by the useLayoutEffect below, same pattern (and
  // same reason) as ClassicMap.jsx/DailyMap.jsx.
  const [collapsed, setCollapsed] = useState(false);

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

  // Same pattern, for the restore badge: 'gained' when a 10-streak
  // milestone mints a new restore, 'used' when a wrong guess auto-spends
  // one. Read by .bz-restore-badge below, keyed on `streakRestores` so it
  // always replays even if 'used' (or 'gained') repeats back-to-back.
  const [restoreAnim, setRestoreAnim] = useState(null); // 'gained' | 'used' | null
  const prevRestoresRef = useRef(streakRestores);
  useEffect(() => {
    const prev = prevRestoresRef.current;
    if (streakRestores > prev) setRestoreAnim('gained');
    else if (streakRestores < prev) setRestoreAnim('used');
    prevRestoresRef.current = streakRestores;
  }, [streakRestores]);

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
  // fast reset to the default India-wide framing (580ms, eased with the
  // same curve as Classic/Daily's round reset -- see RESULT_FIT_EASING --
  // distinct from the slower 1200ms "Show Boundary" zoom, which is meant
  // to linger).
  // LOADING -> clear everything before the next site's blue preview starts,
  // AND reset the camera again (same fitBounds as REVEALING's) -- mirrors
  // ClassicMap.jsx's equivalent effect. Without this second reset, "Show
  // Boundary" (zoomToBoundary, in handleShowBoundary above) can move the
  // camera in AFTER REVEALING's own reset already ran, and nothing was
  // ever resetting it again before Next Site -- the camera would stay
  // zoomed into wherever Show Boundary left it for the whole next round.
  // (Hint region hide/show is fully owned by the declarative effect above --
  // this effect no longer touches it.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (roundState === 'REVEALING' && result) {
      setCollapsed(false); // a collapse from the last round shouldn't carry into this one
      showReveal(map, result.correctStates, result.guessedState, result.isCorrect, result.site);
      map.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: MAP_CONFIG.FIT_PADDING, duration: 580, easing: RESULT_FIT_EASING });
    } else if (roundState === 'LOADING') {
      clearAll(map);
      map.fitBounds(MAP_CONFIG.INDIA_BOUNDS, { padding: MAP_CONFIG.FIT_PADDING, duration: 580, easing: RESULT_FIT_EASING });
    }
  }, [mapRef, mapReady, roundState, result]);

  // Records the round once REVEALING starts; same identity-guard shape as
  // ClassicMap.jsx's recordClassicResult effect (prevents Strict Mode's
  // dev-only double-invoke from recording the same round twice).
  const recordedResultRef = useRef(null);
  const [milestone, setMilestone] = useState(null);
  const [streakMilestone, setStreakMilestone] = useState(null);
  const streakMilestoneTokenRef = useRef(0);
  // Set only for tier-3 (50-streak) milestones -- confetti runs on its own
  // longer timer (see the effect below), independent of the glow/label's
  // own tier-scaled lifetime, so a full ~2.6s burst always plays out.
  const [milestoneConfetti, setMilestoneConfetti] = useState(null);
  useEffect(() => {
    if (roundState !== 'REVEALING' || !result) return;
    if (recordedResultRef.current === result) return;
    recordedResultRef.current = result;
    const seenCount = recordAndDetect(() => {
      recordBlitzResult(result, streak);
      return recordSiteEncounter(result.site.id);
    });
    if (seenCount !== null && seenCount % 10 === 0) setMilestone(seenCount);

    // Every 5th correct guess in a row -- bigger sound/haptic tier (the
    // same ones Classic/Daily's perfect-guess and rank-1 moments use, not
    // a new pair invented for this) plus an edge-glow flash (JSX/CSS
    // below), escalating at 25 and 50 into a richer color/size and (at 50)
    // a confetti burst -- see bz-milestone-tier1/2/3 in BlitzMap.css. A
    // plain object (not the bare streak number) is what goes into state:
    // setStreakMilestone(streak) would silently no-op the *second* time
    // the streak reaches 5 in one session, since React bails out of a
    // state update when the new value === the old one -- an object
    // literal is always a new reference, so it re-fires and remounts the
    // glow (keyed on .token) every time, not just the first.
    if (result.isCorrect && streak > 0 && streak % 5 === 0) {
      const tier = streak % 50 === 0 ? 3 : streak % 25 === 0 ? 2 : 1;
      hapticPerfect();
      soundCelebrate();
      const token = ++streakMilestoneTokenRef.current;
      setStreakMilestone({ streak, tier, token });
      if (tier === 3) setMilestoneConfetti(token);
    }
  }, [roundState, result, streak, recordAndDetect]);

  useEffect(() => {
    if (milestoneConfetti === null) return;
    // ~2.6s -- long enough for every ConfettiBurst.jsx piece's animation
    // (staggered fall + fade) to finish before unmounting it.
    const t = setTimeout(() => setMilestoneConfetti(null), 2700);
    return () => clearTimeout(t);
  }, [milestoneConfetti]);

  // Auto-clear the streak-milestone glow (JSX further down) after its
  // animation finishes. A timer, not onAnimationEnd -- animationend never
  // fires under prefers-reduced-motion: reduce (the animation itself is
  // disabled there), and the label needs opacity: 1 in that case (see
  // BlitzMap.css) to stay readable at all, so relying on the animation to
  // signal "done" would leave it stuck on screen permanently for
  // reduced-motion users.
  useEffect(() => {
    if (!streakMilestone) return;
    // Matches each tier's animation-duration in BlitzMap.css (with the
    // same ~100ms buffer tier 1's 900ms/1000ms pair already had) so the
    // label never gets unmounted mid-animation.
    const duration = streakMilestone.tier === 3 ? 1800 : streakMilestone.tier === 2 ? 1300 : 1000;
    const t = setTimeout(() => setStreakMilestone(null), duration);
    return () => clearTimeout(t);
  }, [streakMilestone]);

  // Every-5th-streak flourish for the ring itself, synced to the edge-glow
  // flash's own 25%-keyframe peak (see bz-milestone-edge-glow in
  // BlitzMap.css) -- same duration and easing per tier so the medallion's
  // pulse and the screen-edge glow peak at the same instant instead of the
  // ring being a bystander to its own milestone. null when idle, 1/2/3
  // while a pulse is playing.
  const [medallionPulseTier, setMedallionPulseTier] = useState(null);
  useEffect(() => {
    if (!streakMilestone) return;
    setMedallionPulseTier(streakMilestone.tier);
    // Matches each tier's animation-duration in BlitzMap.css exactly (no
    // buffer needed -- unlike the glow/label, nothing here needs to stay
    // mounted a beat past its animation to avoid a visible unmount snap).
    const duration = streakMilestone.tier === 3 ? 1500 : streakMilestone.tier === 2 ? 1100 : 900;
    const t = setTimeout(() => setMedallionPulseTier(null), duration);
    return () => clearTimeout(t);
  }, [streakMilestone]);

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

  // Keeps cardHeight (and so RecenterButton's `bottom`) in sync with
  // BlitzCard's target height -- same fix as ClassicMap.jsx/DailyMap.jsx's
  // cardHeight effect. Uses scrollHeight, not getBoundingClientRect(), so
  // this reads the content's natural (target) height even while the
  // max-height transition is still clipping the box, and runs in
  // useLayoutEffect so the new height commits in the same paint as the
  // roundState/collapsed class change -- both this card's max-height and
  // RecenterButton's bottom transition then start on the same frame.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || roundState !== 'REVEALING') return;
    setCardHeight(card.scrollHeight);
  }, [roundState, result, collapsed]);

  return (
    <div className={visible ? 'eg-blitz-map is-active' : 'eg-blitz-map'}>
      <div className="bz-top-right-stack">
        {/* Session streak -- tracked by useBlitzRound.js the whole time but
            previously never surfaced in the UI. Always mounted (not gated
            on streak > 0) so its position never jumps mid-session; the
            flame icon itself communicates "no streak yet" via its own
            gray-vs-lit color transition. */}
        <div
          className={`bz-streak-card${streak > 0 ? ' bz-streak-lit' : ''}${medallionPulseTier ? ` bz-medallion-pulse bz-medallion-pulse-tier${medallionPulseTier}` : ''}`}
          aria-live="polite"
        >
          <svg className="bz-streak-ring" width="78" height="78" viewBox="0 0 78 78" aria-hidden="true">
            <circle cx="39" cy="39" r="36" className="bz-streak-ring-outer" />
            <circle cx="39" cy="39" r={STREAK_RING_R} className="bz-streak-ring-track" />
            {/* Fills in over each run of 5 correct guesses, full right at
                the milestone itself (in step with the edge-glow flash),
                then resets for the next 5 -- see streakProgress's
                comment above for the exact math. stroke-dashoffset is a
                paint-only property (no reflow), same performance
                footprint as the color transitions already on the ring
                above it. Uses the JS-managed ringOffset (not
                streakProgress directly) so the lap-rollover snap-back
                above can drive it through an untransitioned frame;
                bz-ring-no-transition is that snap's frame, bz-ring-break
                flashes the stroke red in step with the streak number's
                own break shake. */}
            <circle
              cx="39" cy="39" r={STREAK_RING_R}
              className={`bz-streak-ring-progress${ringTransitionEnabled ? '' : ' bz-ring-no-transition'}${streakAnim === 'break' ? ' bz-ring-break' : ''}`}
              style={{
                strokeDasharray: STREAK_RING_CIRCUMFERENCE,
                strokeDashoffset: ringOffset,
              }}
            />
          </svg>
          <div className="bz-streak-face">
            <span className={`bz-streak-flame${streak > 0 ? ' bz-flame-active' : ''}`}>
              <IconFlame size={16} />
            </span>
            <span
              key={streak}
              className={`bz-streak-value${streakAnim === 'up' ? ' bz-streak-pop' : streakAnim === 'break' ? ' bz-streak-break' : ''}`}
            >
              {streak}
            </span>
            {bestStreak > 0 && <span className="bz-streak-best">Best {bestStreak}</span>}
          </div>
          {/* Streak-restore badge -- a standard notification-style badge
              overlapping the medallion's top-right corner, so the whole
              cluster's footprint is just the medallion's own 78px (plus a
              few px of badge overhang) instead of an artificially widened
              row reserved to keep the two apart. That footprint is what
              .bz-layer-panel below gets centered against. Always mounted,
              same reasoning as the medallion itself: a fixed spot that
              just toggles lit/gray beats one that pops in and shifts
              things around. Greyed out (no count badge) at 0; count badge
              only renders once earned. */}
          <div
            key={streakRestores}
            className={`bz-restore-badge${streakRestores > 0 ? ' bz-restore-active' : ''}${restoreAnim === 'gained' ? ' bz-restore-gained' : restoreAnim === 'used' ? ' bz-restore-used' : ''}`}
            role="status"
            aria-label={streakRestores > 0
              ? `${streakRestores} streak restore${streakRestores === 1 ? '' : 's'} available`
              : 'No streak restores available yet'}
            title={streakRestores > 0 ? `${streakRestores} streak restore${streakRestores === 1 ? '' : 's'}` : 'Streak restore -- earn one every 10-streak'}
          >
            <IconHeartRestore size={20} />
            {streakRestores > 0 && <span className="bz-restore-count">{streakRestores}</span>}
          </div>
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
            <span className={!mapReady ? 'eg-toggle-disabled' : undefined}>States</span>
          </label>
        </div>
      </div>

      {sitePool.length === 0 && (
        <div className="bz-empty-pool">No sites match these filters.</div>
      )}

      <MapContainer mapRef={mapRef} onMapClick={handleMapClick} guess={null} styleTransform={blitzStyleTransform} />
      <MapLoadingOverlay active={!mapReady} slow={mapLoadSlow} />
      <RecenterButton
        mapRef={mapRef}
        style={
          roundState === 'REVEALING' && cardHeight
            ? { bottom: `calc(var(--eg-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 12px + ${cardHeight}px + 12px)` }
            : undefined
        }
      />

      {milestone !== null && (
        <MilestoneToast key={milestone} count={milestone} onDone={() => setMilestone(null)} />
      )}

      {/* Every-5th-correct-in-a-row flourish -- edge-glow flash + a short
          label, both purely decorative (aria-hidden, pointer-events:none)
          since the streak medallion already carries the real number
          persistently. Cleared by the timeout effect above, not an
          animation-end handler (see that effect's comment for why). */}
      {streakMilestone && (
        <div
          key={streakMilestone.token}
          className={`bz-milestone-glow bz-milestone-tier${streakMilestone.tier}`}
          aria-hidden="true"
        >
          <span className="bz-milestone-label">{streakMilestone.streak} in a row!</span>
        </div>
      )}
      {milestoneConfetti !== null && <ConfettiBurst key={`streak-confetti-${milestoneConfetti}`} />}

      {newAchievement && (
        <AchievementToast key={newAchievement.id} achievement={newAchievement} onDone={dismissAchievement} />
      )}

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
          collapsed={collapsed}
          onToggleCollapsed={setCollapsed}
          cardHeight={cardHeight}
        />
      )}
    </div>
  );
}

export default memo(BlitzMap);
