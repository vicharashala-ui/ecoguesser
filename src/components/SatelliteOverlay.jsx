import { useEffect, useRef } from 'react';
import { SATELLITE_VISUAL } from '../config.js';

// Renders the vignette + atmospheric glow as a transparent <canvas> stacked on top
// of the map container. NOT a MapLibre layer -- MapLibre has no radial-gradient/
// vignette paint primitive, so this draws directly with the 2D canvas API.
// Anchored to the viewport (redraws on resize), not the map content -- it should
// NOT redraw on pan/zoom/rotate, per the spec's "simulates atmospheric scatter at
// the viewport rim" framing.
//
// No isolation/transform here (deliberately -- see below). This is the one
// piece of Classic's satellite view that Daily's doesn't have: ClassicMap.jsx
// renders it, DailyMap.jsx never imports SatelliteOverlay at all. It used to
// carry `isolation: isolate; transform: translateZ(0)`, added on the theory
// that giving it "the same own-GPU-layer treatment" as BottomCard/RecenterButton/
// BottomNav would help. That was backwards: this canvas is exactly the one
// extra always-on-top-of-MapLibre's-WebGL-canvas layer Classic's satellite view
// has that Daily's doesn't, and forcing it onto its own compositor layer (on
// top of an already-known-flaky stack -- see BottomNav.css's writeup, which
// documents that same isolation+translateZ(0) recipe *failing* to fix the
// identical disappearing-fixed-element symptom there) is what was pushing
// Classic's layer count over whatever the real trigger is. This canvas has no
// positioned descendants and is pointer-events:none, so it never needed its
// own stacking boundary -- z-index:5 alone already keeps it under every piece
// of floating UI. Removing the forced layer is the fix, not another one.
// @param active: boolean -- pass the `satellite` value from useMapState()
export default function SatelliteOverlay({ active }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function draw() {
      const { width, height } = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2, cy = height / 2;
      const minWH = Math.min(width, height);
      const maxWH = Math.max(width, height);

      // Vignette: transparent center -> mid-darkness -> black at edges.
      // Three gradient stops for a steeper edge falloff than a flat 0->1.
      // r0/r1 use different dimension bases (min vs max of width/height) --
      // the mid stop's position is derived from where midStopRatio would
      // fall using r1's basis, then expressed as a fraction of the r0..r1
      // span since canvas gradients position stops 0-1 along that span,
      // not in raw pixels.
      const v = SATELLITE_VISUAL.VIGNETTE;
      const r0 = minWH * v.innerStopRatio;
      const r1 = maxWH * v.outerStopRatio;
      const vignette = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      const midPos = Math.min(1, Math.max(0, (maxWH * v.midStopRatio - r0) / (r1 - r0)));
      vignette.addColorStop(midPos, `rgba(0,0,0,${v.midOpacity})`);
      vignette.addColorStop(1, `rgba(0,0,0,${v.maxOpacity})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // Atmospheric glow: transparent center -> blue at edges
      const g = SATELLITE_VISUAL.GLOW;
      const glow = ctx.createRadialGradient(
        cx, cy, minWH * g.innerStopRatio,
        cx, cy, maxWH * g.outerStopRatio
      );
      glow.addColorStop(0, `rgba(${g.color},0)`);
      glow.addColorStop(1, `rgba(${g.color},${g.maxOpacity})`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none', // let map drag/zoom/click pass through untouched
        zIndex: 5,
      }}
    />
  );
}
