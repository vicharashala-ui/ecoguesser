// src/components/BottomNav.jsx
//
// Section 8's bottom tab bar: [fire] Daily | [mountain] Classic | [chart] Stats.
// Active-tab amber (#f59e0b) + scaled icon, per spec.
//
// Stats has no screen yet (STATS_VIEW isn't built), so its tab is disabled --
// same disabled + title="Coming soon" pattern BottomCard.jsx already uses for
// "Play Trivia". Swap `disabled` for a real onClick once Stats exists; the
// markup below won't need to change.
//
// Icons match BottomCard.jsx's inline-SVG convention (currentColor,
// viewBox 0 0 24 24, stroke-based, no fill) rather than a second icon style
// or an npm icon-library dependency.

import './BottomNav.css';

function IconFire({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21c-3.5 0-6-2.2-6-5.6 0-2 1-3.6 1-3.6s.4 1.4 1.4 2c-.3-2.6.6-5.4 3-7.3.4 1.8 1.3 2.8 2.3 3.7 1.7 1.5 2.3 3.1 2.3 5.2 0 3.4-2.5 5.6-4 5.6Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMountain({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 19 9 8l4 6.5L15.5 11 21 19H3Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChart({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="11" width="3.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10.25" y="5" width="3.5" height="14" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="16.5" y="9" width="3.5" height="10" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

const TABS = [
  { id: 'daily', label: 'Daily', Icon: IconFire },
  { id: 'classic', label: 'Classic', Icon: IconMountain },
];

export default function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="eg-bottom-nav" aria-label="Game mode">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            className={`eg-nav-tab${active ? ' eg-nav-tab-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => onTabChange(id)}
          >
            <Icon size={active ? 24 : 22} />
            <span>{label}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="eg-nav-tab"
        disabled
        title="Coming soon"
        aria-label="Stats - coming soon"
      >
        <IconChart size={22} />
        <span>Stats</span>
      </button>
    </nav>
  );
}
