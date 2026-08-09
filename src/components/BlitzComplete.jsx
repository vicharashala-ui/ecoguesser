// src/components/BlitzComplete.jsx
// Blitz's full-pool completion state -- every site in the current filtered
// pool has been correctly identified at least once this streak (see
// useBlitzRound.js's correctIds/wrongIds no-repeat tracking). Rendered by
// BlitzMap.jsx in place of BlitzCard when roundState === 'COMPLETE'.

function IconTrophy({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M12 12v3M9 20h6M10 20v-2.4c0-.6.3-1 1-1h2c.7 0 1 .4 1 1V20"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * @param {number} total - size of the current filtered pool (matches
 *   correctIds.size at completion -- filters can shrink this well below
 *   the full 838-site dataset)
 * @param {number} bestStreak
 * @param {() => void} onPlayAgain
 */
function BlitzComplete({ total, bestStreak, onPlayAgain }) {
  return (
    <div className="bz-complete" role="status" aria-live="polite">
      <span className="bz-complete-icon"><IconTrophy /></span>
      <h2 className="bz-complete-title">Every Site, Found</h2>
      <p className="bz-complete-sub">
        You've correctly placed all {total} protected areas in this run — best streak {bestStreak}.
      </p>
      <button type="button" className="bz-complete-btn" onClick={onPlayAgain}>
        Play Again
      </button>
    </div>
  );
}

export default BlitzComplete;
