// src/components/ConfettiBurst.jsx
//
// Full-viewport, single-run STAR burst fired when a round lands a perfect
// SCORING.MAX_SCORE (guess inside the site's boundary). Mounted by
// BottomCard.jsx alongside the existing score-badge sparkle, gated on the
// same `isPerfect` flag. (Component/file name kept as ConfettiBurst --
// BottomCard.jsx imports it by that name -- even though the pieces are now
// stars, not confetti squares/circles.)
//
// position: absolute, not fixed -- see .bottom-card's comment at the top of
// BottomCard.css for why `position: fixed` is banned in this app (mobile
// Chrome/Safari + a live WebGL canvas resolve fixed positioning against the
// visual viewport, not the layout viewport, and can desync on canvas
// repaints -- that's what made the guess panel/nav/recenter button vanish
// under Satellite). This overlay instead relies on the same
// already-viewport-spanning `position: absolute; inset: 0` wrapper that
// ClassicMap.jsx/DailyMap.jsx already render into (see App.jsx's `style`
// prop passed to both), so it resolves to the identical full-screen box
// without touching `fixed`.
//
// v2 (star burst): the original two-cannon confetti converged on a tight
// cluster at screen center (~140px scatter), which read as barely visible
// against the map. This version fires each piece to its own randomized
// point spread across most of the screen's width/height -- so the burst
// visibly fills the screen rather than clumping in the middle -- and uses
// bigger, glowing star shapes with a quick pop-overshoot instead of a
// slow float, so it reads as one short, punchy hit rather than a lingering
// effect. Piece geometry (start offset, target point, rotation, color,
// timing) is randomized once per mount via useMemo(..., []) -- re-renders
// during the burst (e.g. toggling the result card's collapsed state) must
// not reshuffle mid-flight values. The parent keys this component on
// `site.id` (same convention as BottomCard.jsx's `.bc-celebrate`) so every
// new round gets a fresh mount and therefore a fresh, single play-through.

import { useMemo } from 'react';
import './ConfettiBurst.css';

// Bright/saturated "firework" tones -- distinct from the app's muted UI
// palette so the burst pops against the map regardless of basemap colors.
const COLORS = ['#fbbf24', '#f59e0b', '#ffffff', '#38bdf8', '#f472b6', '#a78bfa'];
const PIECES_PER_SIDE = 22; // 44 total -- noticeable burst, not a screen-filling storm

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function makePieces(side) {
  return Array.from({ length: PIECES_PER_SIDE }).map((_, i) => {
    // Small spread along the bottom edge near the corner, so each cannon
    // reads as a cluster of launch points rather than one single pixel.
    const startSpread = Math.round(rand(0, 40));
    // Target point: spread widely across the screen (in vw/vh, so it scales
    // with viewport) rather than converging on one tight cluster -- this is
    // what actually makes the burst read as filling the screen. `side`
    // only sets which horizontal direction the cannon throws toward.
    const txVW = Math.round(rand(28, 92)) * (side === 'l' ? 1 : -1);
    const tyVH = Math.round(rand(38, 84)); // upward travel, applied as negative in CSS
    // Small px jitter on top of the vw/vh target so pieces sharing a
    // similar txVW/tyVH don't land in an exact line.
    const jitterX = Math.round(rand(-24, 24));
    const jitterY = Math.round(rand(-24, 24));
    const rotate = Math.round((Math.random() > 0.5 ? 1 : -1) * rand(200, 760));
    const delay = Math.round(rand(0, 40)); // near-simultaneous launch -- reads as one hit
    const duration = Math.round(rand(520, 720)); // short + powerful, not a slow float
    const size = Math.round(rand(10, 18));
    const color = COLORS[(i + (side === 'r' ? 3 : 0)) % COLORS.length];
    return {
      id: `${side}${i}`,
      startSpread,
      txVW,
      tyVH,
      jitterX,
      jitterY,
      rotate,
      delay,
      duration,
      size,
      color,
    };
  });
}

function Piece({ side, p }) {
  const edgeProp = side === 'l' ? 'left' : 'right';
  return (
    <span
      className="eg-star-piece"
      style={{
        [edgeProp]: `${p.startSpread}px`,
        bottom: `${p.startSpread}px`,
        '--tx': `calc(${p.txVW}vw + ${p.jitterX}px)`,
        '--ty': `calc(-${p.tyVH}vh + ${p.jitterY}px)`,
        '--rot': `${p.rotate}deg`,
        width: `${p.size}px`,
        height: `${p.size}px`,
        background: p.color,
        filter: `drop-shadow(0 0 3px ${p.color})`,
        animationDelay: `${p.delay}ms`,
        animationDuration: `${p.duration}ms`,
      }}
    />
  );
}

export default function ConfettiBurst() {
  const left = useMemo(() => makePieces('l'), []);
  const right = useMemo(() => makePieces('r'), []);

  return (
    <div className="eg-confetti" aria-hidden="true">
      {left.map((p) => <Piece key={p.id} side="l" p={p} />)}
      {right.map((p) => <Piece key={p.id} side="r" p={p} />)}
    </div>
  );
}
