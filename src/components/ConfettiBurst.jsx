// src/components/ConfettiBurst.jsx
//
// Full-viewport, single-run confetti burst fired when a round lands a
// perfect SCORING.MAX_SCORE (guess inside the site's boundary). Mounted by
// BottomCard.jsx alongside the existing score-badge sparkle, gated on the
// same `isPerfect` flag.
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
// Two 20-piece cannons fire from the bottom-left and bottom-right corners
// and converge on screen center, each piece scattering slightly around the
// convergence point so it reads as a burst rather than two straight lines.
// Piece geometry (start offset, scatter, rotation, color, timing) is
// randomized once per mount via useMemo(..., []) -- re-renders during the
// burst (e.g. toggling the result card's collapsed state) must not reshuffle
// mid-flight values. The parent keys this component on `site.id` (same
// convention as BottomCard.jsx's `.bc-celebrate`) so every new round gets a
// fresh mount and therefore a fresh, single play-through of the animation.

import { useMemo } from 'react';
import './ConfettiBurst.css';

const COLORS = ['#f59e0b', '#16a34a', '#2563eb', '#db2777', '#7c3aed', '#eab308'];
const PIECES_PER_SIDE = 20;

function makePieces(side) {
  return Array.from({ length: PIECES_PER_SIDE }).map((_, i) => {
    // Small spread along the bottom edge near the corner, so each cannon
    // reads as a cluster of launch points rather than one single pixel.
    const startSpread = Math.round(Math.random() * 36);
    // Scatter around the screen-center convergence point.
    const dx = Math.round((Math.random() - 0.5) * 140);
    const dy = Math.round((Math.random() - 0.5) * 140);
    const rotate = Math.round((Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540));
    const delay = Math.round(Math.random() * 60); // near-simultaneous launch
    const duration = 620 + Math.round(Math.random() * 180); // short + strong
    const size = 6 + Math.round(Math.random() * 6);
    const color = COLORS[(i + (side === 'r' ? 3 : 0)) % COLORS.length];
    const square = Math.random() > 0.5;
    return {
      id: `${side}${i}`,
      startSpread,
      dx,
      dy,
      rotate,
      delay,
      duration,
      size,
      color,
      radius: square ? '2px' : '50%',
    };
  });
}

function Piece({ side, p }) {
  const edgeProp = side === 'l' ? 'left' : 'right';
  return (
    <span
      className={`eg-confetti-piece eg-confetti-piece-${side}`}
      style={{
        [edgeProp]: `${p.startSpread}px`,
        bottom: `${p.startSpread}px`,
        '--dx': `${p.dx}px`,
        '--dy': `${p.dy}px`,
        '--rot': `${p.rotate}deg`,
        width: `${p.size}px`,
        height: `${p.size}px`,
        background: p.color,
        borderRadius: p.radius,
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
