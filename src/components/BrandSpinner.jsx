import { TIGER_MARK_VIEWBOX, TIGER_MARK_ASPECT, TIGER_MARK_PATH } from './tigerMarkPath.js';

// Loading indicator built from the app's own tiger mark (design-audit-
// fixes.md #6) instead of a plain CSS ring -- the same asset/sizing
// convention MapContainer.jsx uses for the map's site marker (width prop +
// TIGER_MARK_ASPECT for height, rather than a hardcoded viewBox stretch).
// Pulses via .eg-brand-spinner (index.css) -- opacity+transform only, and
// honors prefers-reduced-motion the same way the rest of the app does.
export default function BrandSpinner({ size = 32 }) {
  const height = Math.round(size * TIGER_MARK_ASPECT);
  return (
    <svg
      className="eg-brand-spinner"
      viewBox={TIGER_MARK_VIEWBOX}
      width={size}
      height={height}
      role="status"
      aria-label="Loading"
      style={{ color: 'var(--eg-brand, #227743)' }}
    >
      <path d={TIGER_MARK_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
