// src/components/Header.jsx
//
// Section 8's header, scoped down: `[=] EcoGuesser [Daily Challenge] * 7,450`
// -- only the hamburger (opens SideDrawer) and the title are built here.
// The mode label + running score on the right aren't specified precisely
// enough to build correctly yet (unclear which score it tracks -- current
// round's running Daily total already lives in BottomCard, so this would
// be a second display of the same number, or a different one entirely) --
// deferred rather than guessed at.

import './Header.css';

export default function Header({ onMenuClick }) {
  return (
    <header className="eg-header">
      <button type="button" className="eg-menu-btn" onClick={onMenuClick} aria-label="Menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <span className="eg-header-title">EcoGuesser</span>
    </header>
  );
}
