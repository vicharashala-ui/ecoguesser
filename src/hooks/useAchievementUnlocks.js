// src/hooks/useAchievementUnlocks.js
// Detects achievements unlocking live, mid-session, in whichever mode just
// finished a round -- previously the only way to discover a badge was to
// visit the Stats tab's Awards sub-tab (StatsView.jsx). Achievements stay a
// pure read layer (see achievements.js's header comment) -- this hook adds
// no new persistence, it just snapshots computeAchievements() on either
// side of the caller's own recordXResult() write and diffs the two.
//
// Shared by BlitzMap.jsx, ClassicMap.jsx, and App.jsx (Daily) rather than
// each reimplementing the same before/write/after/diff/queue shape three
// times.

import { useCallback, useState } from 'react';
import { computeAchievements, findNewlyUnlocked } from '../game/achievements.js';

/**
 * @returns {{
 *   current: (ReturnType<typeof computeAchievements>[number]) | null,
 *   recordAndDetect: (writeFn: () => any) => any,
 *   dismissCurrent: () => void,
 * }}
 */
export function useAchievementUnlocks() {
  // Achievements waiting to be shown, one toast at a time -- almost always
  // 0 or 1 entries; a queue only so the rare case of two unlocking on the
  // very same round (e.g. a rounds-played milestone and a streak milestone
  // together) still shows both instead of silently dropping one.
  const [queue, setQueue] = useState([]);

  const recordAndDetect = useCallback((writeFn) => {
    // computeAchievements() with no `sites` arg -- the Collection family
    // (see achievements.js) always reads as 0 progress here, so a
    // Collection milestone won't fire a live toast through this path. It
    // still shows and updates correctly in the Awards tab, which already
    // has `sites` loaded; threading it through here too would mean also
    // updating every recordAndDetect call site (BlitzMap/ClassicMap/App.jsx)
    // just for a toast on a family that's easy enough to notice next visit.
    const before = computeAchievements();
    const result = writeFn();
    const after = computeAchievements();
    const newly = findNewlyUnlocked(before, after);
    if (newly.length > 0) setQueue((q) => [...q, ...newly]);
    return result;
  }, []);

  const dismissCurrent = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  return { current: queue[0] ?? null, recordAndDetect, dismissCurrent };
}
