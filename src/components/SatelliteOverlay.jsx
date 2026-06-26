import { useEffect, useRef } from 'react';
import { SATELLITE_VISUAL } from '../config.js';

// Renders the vignette + atmospheric glow as a transparent <canvas> stacked on top
// of the map container. NOT a MapLibre layer -- MapLibre has no radial-gradient/
// vignette paint primitive, so this draws directly with the 2D canvas API.
// Anchored to the viewport (redraws on resize), not the map content -- it should
// NOT redraw on pan/zoom/rotate, per the spec's "simulates atmospheric scatter at
// the viewport rim" framing.
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

      // Vignette: transparent center -> black at edges
      const v = SATELLITE_VISUAL.VIGNETTE;
      const vignette = ctx.createRadialGradient(
        cx, cy, minWH * v.innerStopRatio,
        cx, cy, maxWH * v.outerStopRatio
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
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
