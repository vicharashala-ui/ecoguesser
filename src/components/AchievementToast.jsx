// src/components/AchievementToast.jsx
// Celebratory toast fired the moment an achievement (see achievements.js)
// flips from locked to unlocked mid-session -- previously achievements were
// only discoverable by visiting the Stats tab's Awards sub-tab. Mounted
// locally by Daily/Classic/Blitz's top-level components via
// useAchievementUnlocks.js, one at a time off that hook's queue.
// Self-dismissing, same convention as MilestoneToast.jsx -- DISPLAY_MS
// mirrors the CSS animation's duration. Caller keys this on
// achievement.id so back-to-back unlocks each get a fresh mount/timer,
// same as MilestoneToast's `count` key.

import { useEffect } from 'react';
import AchievementIcon from './AchievementIcon.jsx';
import './AchievementToast.css';

const DISPLAY_MS = 4200; // must match .eg-achievement-toast's animation-duration in the CSS

export default function AchievementToast({ achievement, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="eg-achievement-toast" role="status" aria-live="polite">
      <span className="eg-achievement-icon"><AchievementIcon name={achievement.icon} size={22} /></span>
      <span className="eg-achievement-text">
        <span className="eg-achievement-kicker">Achievement Unlocked</span>
        <span className="eg-achievement-title">{achievement.title}</span>
      </span>
    </div>
  );
}
