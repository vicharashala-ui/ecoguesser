// src/components/Header.jsx
// App header: hamburger (opens SideDrawer) + centered title. No mode
// label/running score on the right -- current round's running Daily total
// already lives in BottomCard, so a second display here would be either
// redundant or a confusing second number.
//
// Title block (name + tagline) is centered independent of the hamburger --
// absolutely positioned at left:50% rather than living in the flex row next
// to the button, so it stays centered on the viewport regardless of the
// button's width/padding. Not an <h1>: this header is mounted for every tab
// (App.jsx renders it unconditionally), and Leaderboard.jsx/StatsView.jsx
// each already have their own page-level <h1> -- a second one here would
// duplicate the page's primary heading, which hurts rather than helps
// document structure/SEO. The brand name stays real, crawlable/selectable
// text either way (not an image).

import { TIGER_MARK_VIEWBOX, TIGER_MARK_ASPECT, TIGER_MARK_PATH } from './tigerMarkPath';
import './Header.css';

const LOGO_SIZE = 24;

export default function Header({ onMenuClick }) {
  return (
    <header className="eg-header">
      <button type="button" className="eg-menu-btn" onClick={onMenuClick} aria-label="Menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <div className="eg-header-title-block">
        <div className="eg-header-title-row">
          <svg
            width={LOGO_SIZE}
            height={Math.round(LOGO_SIZE * TIGER_MARK_ASPECT)}
            viewBox={TIGER_MARK_VIEWBOX}
            aria-hidden="true"
          >
            <path fill="#fff" fillRule="evenodd" d={TIGER_MARK_PATH} />
          </svg>
          <span className="eg-header-title">EcoGuesser<sup className="eg-tm">™</sup></span>
        </div>
        <p className="eg-header-tagline">Explore &bull; Learn &bull; Protect</p>
      </div>
    </header>
  );
}
