// src/components/MilestoneToast.jsx
// Celebratory toast fired when the site-collection counter (recordSiteEncounter
// in stats.js -- the "N / 837 explored" completionist tally) crosses a
// multiple of 10. Mounted locally by ClassicMap.jsx/BlitzMap.jsx, the only
// two modes that feed the collection (see LS_KEYS.SITES_SEEN's comment in
// config.js for why Daily is excluded).
//
// Self-dismissing: this celebrates a passive milestone, not a decision, so
// it times itself out via CSS animation rather than waiting on a dismiss
// click like InstallPrompt.jsx's toast does. DISPLAY_MS mirrors the CSS
// animation's duration so onDone fires right as the fade-out finishes.
// Parent keys this component on `count` (same convention as ConfettiBurst)
// so back-to-back milestones each get a fresh mount/timer.

import { useEffect } from 'react';
import './MilestoneToast.css';

const DISPLAY_MS = 2800;

export default function MilestoneToast({ count, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="eg-milestone-toast" role="status" aria-live="polite">
      <span className="eg-milestone-icon" aria-hidden="true">🌿</span>
      <div className="eg-milestone-text">
        <p className="eg-milestone-title">{count} Sites Explored!</p>
        <p className="eg-milestone-sub">Keep discovering India's wild places.</p>
      </div>
    </div>
  );
}
