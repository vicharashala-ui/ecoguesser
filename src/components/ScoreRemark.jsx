// src/components/ScoreRemark.jsx
// Centered-on-screen distance-feedback remark ("Excellent!", "Way Off", ...),
// replacing the earlier version that was a small badge anchored above the
// score number. Mounted as a sibling of BottomCard in ClassicMap.jsx/
// DailyMap.jsx -- same reasoning as MilestoneToast.jsx: position: absolute
// over the inset:0 map wrapper, never `fixed` (see bottom-card's own CSS
// comment on why `fixed` is banned here). It has to live at that level
// (not inside BottomCard.jsx) to center on the full viewport -- BottomCard's
// own box is bottom-anchored and horizontally inset, so anything centered
// *inside* it centers on the card, not the screen.
//
// Perfect (boundary hit) reuses the same big label plus the pre-existing
// spark burst, now radiating from screen-center instead of the old small
// score badge. ConfettiBurst is a separate, already-screen-scale
// celebration and keeps running independently of this component.
//
// The distance figure below the label is the same number BottomCard.jsx's
// meta row shows persistently (small, muted) -- this is a second,
// transient, much bigger presentation of it for the reveal flash itself;
// it fades with the rest of this component and doesn't replace the
// persistent one.

import { SCORING } from '../config';
import './ScoreRemark.css';

// Same bands/colors as before -- fractions of SCORING.MAX_SCORE, green ->
// red, independent of the per-category accent color so a tier reads
// clearly regardless of which category's color happens to be active.
const SCORE_TIERS = [
  { min: 0.8, label: 'Excellent!', color: 'var(--eg-brand, #227743)' },
  { min: 0.5, label: 'Great', color: '#65a30d' },
  { min: 0.2, label: 'Good', color: '#d97706' },
  { min: 0.05, label: 'Fair', color: '#f97316' },
  { min: 0, label: 'Way Off', color: '#dc2626' },
];

function getScoreTier(finalScore) {
  const ratio = finalScore / SCORING.MAX_SCORE;
  return SCORE_TIERS.find((t) => ratio >= t.min) ?? SCORE_TIERS[SCORE_TIERS.length - 1];
}

/**
 * @param {'READING'|'PLACING'|'REVEALING'} roundState
 * @param {import('../config').RoundResult|null} result
 */
export default function ScoreRemark({ roundState, result }) {
  // Same "has a real guess" gate BottomCard.jsx's distance chip uses -- a
  // timed-out Daily round with no marker placed gets no remark, same as it
  // already gets no distance figure.
  if (roundState !== 'REVEALING' || !result || result.skipped || result.distanceKm == null) {
    return null;
  }

  const isPerfect = result.finalScore === SCORING.MAX_SCORE;
  const tier = isPerfect ? { label: 'Perfect!', color: 'var(--eg-brand, #227743)' } : getScoreTier(result.finalScore);

  return (
    <div className="eg-score-remark" key={result.site.id} aria-hidden="true">
      <span className="eg-score-remark-label" style={{ color: tier.color }}>{tier.label}</span>
      <span className="eg-score-remark-distance">
        {Math.round(result.distanceKm).toLocaleString()} km away
      </span>
      {isPerfect && Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className="eg-score-remark-spark" style={{ '--i': i }} />
      ))}
    </div>
  );
}
