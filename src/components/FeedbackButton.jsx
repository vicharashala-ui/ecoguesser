// src/components/FeedbackButton.jsx
//
// Section 9c: "Button: bottom-right corner, always visible, above map and
// nav." Rendered once at the App.jsx level (like Header/BottomNav), not
// inside ClassicMap.jsx/DailyMap.jsx, so it stays visible on the Stats tab
// too, not just the two map screens.
//
// Positioned at the same vertical band as RecenterButton's default (non-
// REVEALING-overridden) offset -- stacked just above the 64px pill-height
// bottom UI (BottomCard's pill / DailyMap's start-pill / loading-pill),
// mirrored to the right side. Deliberately does NOT track the expanded
// BottomCard's real height the way RecenterButton.jsx does during
// REVEALING (that would mean threading cardHeight state up from
// ClassicMap/DailyMap into this global component) -- feedback is a
// low-frequency action, so being briefly covered by the expanded card
// during a round's reveal is an acceptable trade-off, not an oversight.

import './FeedbackButton.css';

function IconChat({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5h16v11H9.5L5 20.5v-4H4z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function FeedbackButton({ onClick }) {
  return (
    <button
      type="button"
      className="eg-feedback-btn"
      onClick={onClick}
      aria-label="Send feedback"
      title="Send feedback"
    >
      <IconChat />
    </button>
  );
}
