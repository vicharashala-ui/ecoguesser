// src/components/ClassicDistanceGauge.jsx
// Passive HUD widget in ClassicMap's top-right stack -- shows the player's
// EMA of recent distance (see computeEmaAvgDist in game/stats.js) as a
// needle on a 6-segment dial. Purely informational: no click handler, no tooltip.
import { useState, useEffect, useRef } from 'react';
import './ClassicDistanceGauge.css';

// Gauge scale caps at 500km -- beyond this the scoring curve
// (5000 * e^(-dist/130), see game/scoring.js) is already near zero, so
// further distance carries no extra meaning for the dial. Averages above
// this pin the needle at the red end rather than overshooting the arc.
const MAX_KM = 500;

// Six segment colors, HSL-interpolated between --eg-brand (#227743) and
// --eg-danger (#dc2626) so the scale reuses the app's existing palette
// instead of introducing new ones. Interpolating through hue (not RGB)
// gives a natural green -> olive -> yellow -> amber -> rust -> red
// progression -- the 4th stop lands on true yellow.
const SEGMENT_COLORS = ['#227743', '#2d8a24', '#6a9e25', '#b3ac25', '#c87325', '#dc2626'];

// Precomputed arc path for each of the 6 segments (27.5 degrees each, 3
// degree gaps between) on the fixed r=55 semicircle centered at (80,88).
const SEGMENT_PATHS = [
  'M25,88 A55,55 0 0 1 31.21,62.6',
  'M32.61,60.09 A55,55 0 0 1 50.85,41.36',
  'M53.34,39.9 A55,55 0 0 1 78.56,33.02',
  'M81.44,33.02 A55,55 0 0 1 106.66,39.9',
  'M109.15,41.36 A55,55 0 0 1 127.39,60.09',
  'M128.79,62.6 A55,55 0 0 1 135,88',
];

// Needle at its resting orientation: pointing due left, i.e. the 0km end of
// the scale. Rotated via CSS transform around the pivot (80,88) rather than
// recomputed per value -- see rotationDeg below.
const NEEDLE_RESTING_SHAPE = '80,84.8 38,87.4 38,88.6 80,91.2';

// Every round update overshoots by at least this many degrees past the
// target before settling -- keeps the needle visibly reactive even when the
// rolling average shifts by a fraction of a degree round to round.
const MIN_SWING_DEG = 16;
const SWING_MS = 280;
const SETTLE_MS = 240;
const NUMBER_ROLL_MS = 500;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Needle rests pointing left (180 degrees, the 0km mark) at fraction 0;
// rotating it clockwise by 180 * fraction sweeps it to point right (the
// 500km+ mark) at fraction 1.
function rotationFor(avgDist) {
  if (avgDist === null) return 0;
  return 180 * Math.min(avgDist / MAX_KM, 1);
}

export default function ClassicDistanceGauge({ avgDist, visible }) {
  const [rotationDeg, setRotationDegState] = useState(() => rotationFor(avgDist));
  // Explicit transition per phase (overshoot swing / settle / instant reset)
  // instead of the CSS class's fixed transition -- undefined falls back to
  // that class default, used only for the tab-open sweep below.
  const [needleTransition, setNeedleTransition] = useState(undefined);
  const [displayedValue, setDisplayedValue] = useState(avgDist ?? 0);

  const rotationRef = useRef(rotationFor(avgDist));
  const avgDistRef = useRef(avgDist);
  const prevAvgDistRef = useRef(avgDist);
  avgDistRef.current = avgDist;

  // Keeps rotationRef in sync with every rotation change so the swing effect
  // below can read "where the needle currently is" without depending on
  // rotationDeg itself (which would re-trigger the effect on every frame).
  const setRotationDeg = (deg) => {
    rotationRef.current = deg;
    setRotationDegState(deg);
  };

  // Guess-to-guess movement: always overshoot past the new target by at
  // least MIN_SWING_DEG, then settle back -- decouples "the needle visibly
  // moved" from how small the actual rolling-average change was.
  useEffect(() => {
    if (avgDist === null) return;
    const target = rotationFor(avgDist);
    const current = rotationRef.current;
    const delta = target - current;
    if (Math.abs(delta) < 0.05) return; // unchanged (e.g. this effect firing on mount)

    if (prefersReducedMotion()) {
      setNeedleTransition('none');
      setRotationDeg(target);
      return;
    }

    const direction = delta > 0 ? 1 : -1;
    const swingMag = Math.max(Math.abs(delta), MIN_SWING_DEG);
    const peak = Math.min(Math.max(current + direction * swingMag, -6), 186);

    setNeedleTransition(`transform ${SWING_MS}ms cubic-bezier(0.22,0.61,0.36,1)`);
    setRotationDeg(peak);

    const settleTimer = setTimeout(() => {
      setNeedleTransition(`transform ${SETTLE_MS}ms cubic-bezier(0.45,0,0.55,1)`);
      setRotationDeg(target);
    }, SWING_MS);

    return () => clearTimeout(settleTimer);
  }, [avgDist]);

  // Tab-open sweep: every time the Classic tab becomes visible (including
  // first load), snap the needle back to rest and sweep it up to the
  // current value. Deliberately keyed only on `visible`, not avgDist, so a
  // guess made while already visible triggers the overshoot glide above
  // instead of a full reset-and-resweep.
  useEffect(() => {
    if (!visible || avgDistRef.current === null) return;
    const target = rotationFor(avgDistRef.current);

    if (prefersReducedMotion()) {
      setNeedleTransition('none');
      setRotationDeg(target);
      return;
    }

    setNeedleTransition('none');
    setRotationDeg(0);
    const raf = requestAnimationFrame(() => {
      setNeedleTransition(undefined); // falls back to the CSS class's spring easing
      setRotationDeg(target);
    });
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  // Odometer-style readout: counts from the old value to the new one instead
  // of jumping straight there. Independent of the needle's own motion, so a
  // rolling-average shift too small to see on the dial is still legible as
  // an exact number change.
  useEffect(() => {
    if (avgDist === null) return;
    const from = prevAvgDistRef.current ?? avgDist;
    const to = avgDist;
    prevAvgDistRef.current = avgDist;
    if (from === to) return;

    if (prefersReducedMotion()) {
      setDisplayedValue(to);
      return;
    }

    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min((now - start) / NUMBER_ROLL_MS, 1);
      setDisplayedValue(Math.round(from + (to - from) * easeOutCubic(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [avgDist]);

  if (avgDist === null) return null;

  return (
    <div className="cm-gauge-panel">
      <svg className="cm-gauge-svg" viewBox="0 0 160 100" width="88" height="55" aria-hidden="true">
        {SEGMENT_PATHS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={SEGMENT_COLORS[i]} strokeWidth="9" strokeLinecap="round" />
        ))}
        <g
          className="cm-gauge-needle"
          style={{
            transform: `rotate(${rotationDeg}deg)`,
            transformOrigin: '80px 88px',
            transformBox: 'view-box',
            transition: needleTransition,
          }}
        >
          <polygon points={NEEDLE_RESTING_SHAPE} fill="#111827" />
        </g>
        <circle cx="80" cy="88" r="6.5" fill="#fff" stroke="#111827" strokeWidth="2" />
        <circle cx="80" cy="88" r="3" fill="#111827" />
        <circle cx="78.7" cy="86.7" r="0.9" fill="#fff" opacity="0.8" />
      </svg>
      <div className="cm-gauge-readout">
        <span className="cm-gauge-value">{displayedValue}</span>
        <span className="cm-gauge-unit">km</span>
        <div className="cm-gauge-label">recent avg</div>
      </div>
    </div>
  );
}
