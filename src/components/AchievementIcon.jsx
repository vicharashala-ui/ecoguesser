// src/components/AchievementIcon.jsx
// Shape names rendered per achievement.icon (see achievements.js). Kept
// separate from the achievement data itself so achievements.js stays
// render-agnostic / unit-testable without a DOM. Stroke-based, viewBox
// 0 0 24 24 -- same inline-SVG convention as BottomNav.jsx/BottomCard.jsx
// (currentColor so locked/unlocked coloring is driven entirely by the CSS
// class on the wrapping element, not a prop here).
//
// Extracted into its own file (rather than this codebase's usual
// no-shared-icon-module convention, where each component owns its own tiny
// inline SVGs) because this is a ~10-case icon registry keyed by name, used
// by two call sites now (StatsView.jsx's Awards tab, AchievementToast.jsx's
// live unlock toast) -- duplicating the whole switch into a second file
// would be the actual bloat here, not sharing it.

export default function AchievementIcon({ name, size = 24 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  switch (name) {
    case 'flag':
      return (
        <svg {...common}>
          <path d="M5 21V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5 4h13l-3 4 3 4H5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'flame':
      return (
        <svg {...common}>
          <path
            d="M12 21c-3.5 0-6-2.2-6-5.6 0-2 1-3.6 1-3.6s.4 1.4 1.4 2c-.3-2.6.6-5.4 3-7.3.4 1.8 1.3 2.8 2.3 3.7 1.7 1.5 2.3 3.1 2.3 5.2 0 3.4-2.5 5.6-4 5.6Z"
            stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
          />
        </svg>
      );
    case 'trophy':
      return (
        <svg {...common}>
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 13v3.5M9 20h6M9.5 20c0-1.8 1-2.3 2.5-2.3s2.5.5 2.5 2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <path
            d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3Z"
            stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
          />
        </svg>
      );
    case 'crown':
      return (
        <svg {...common}>
          <path d="M4 18h16l-1.3-8-4 3.2L12 8l-2.7 5.2-4-3.2L4 18Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M5 20.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'leaf':
      return (
        <svg {...common}>
          <path d="M5 19c8 1 13-4 14-14-9 0-14 5-14 14Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M6 18C10 13 13 10 17 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'target':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="m14.8 9.2-1.6 4.4-4.4 1.6 1.6-4.4 4.4-1.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...common}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}
