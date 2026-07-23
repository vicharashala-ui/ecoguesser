import { useState, useEffect } from 'react';

// Counts up from 0 to `value` once, on mount -- pair with `key={...}` at the
// call site if a given instance needs to replay for a new value (e.g.
// BottomCard.jsx keys on `site.id` so a new round always remounts, same
// convention ScoreRemark.jsx's own result.site.id keying uses). Same
// easeOutCubic curve as resultLayer.js's animateLine, for the same "quick
// then settling" feel. Skips straight to the final value under
// prefers-reduced-motion, matching the guard BottomCard.css's own keyframes
// already respect.
export default function AnimatedScore({ value, duration = 700 }) {
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) return;
    let raf;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return display.toLocaleString();
}
