// src/components/MilestoneToast.jsx
// Celebratory toast fired when the site-collection counter (recordSiteEncounter
// in stats.js -- the "N / 837 explored" completionist tally) crosses a
// multiple of 10. Mounted locally by ClassicMap.jsx/BlitzMap.jsx, the only
// two modes that feed the collection (see LS_KEYS.SITES_SEEN's comment in
// config.js for why Daily is excluded).
//
// Restyled to match AchievementToast.jsx's icon+kicker+title structure and
// shine-sweep entrance (was previously a plain text pill in an unrelated
// Tailwind emerald, #34d399 -- see MilestoneToast.css for the brand-derived
// replacement) so the app's two celebratory toasts read as one family
// instead of two different design languages.
//
// Self-dismissing: this celebrates a passive milestone, not a decision, so
// it times itself out via CSS animation rather than waiting on a dismiss
// click like InstallPrompt.jsx's toast does. DISPLAY_MS mirrors the CSS
// animation's duration so onDone fires right as the fade-out finishes.
// Parent keys this component on `count` (same convention as ConfettiBurst)
// so back-to-back milestones each get a fresh mount/timer.

import { useEffect } from 'react';
import './MilestoneToast.css';

const DISPLAY_MS = 3600; // must match .eg-milestone-toast's animation-duration in the CSS

// Tabler-style map-pin glyph -- same stroke convention (24x24, currentColor,
// strokeWidth 1.8) as ClassicMap.jsx's IconMountain/IconMapFlat/IconSatellite
// set, duplicated here rather than shared per this codebase's
// no-shared-icon-module rule.
function IconMapPin({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" />
    </svg>
  );
}

export default function MilestoneToast({ count, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="eg-milestone-toast" role="status" aria-live="polite">
      <span className="eg-milestone-icon"><IconMapPin size={20} /></span>
      <span className="eg-milestone-text">
        <span className="eg-milestone-kicker">Milestone</span>
        <span className="eg-milestone-title">{count} Sites Explored!</span>
      </span>
    </div>
  );
}
