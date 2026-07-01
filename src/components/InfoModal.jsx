// src/components/InfoModal.jsx
//
// Decision #16's static pages: How to Play / About / Privacy Policy,
// reached from SideDrawer's footer links via App.jsx's onNavigate handler.
//
// Implementation note: the spec's decision log describes these as "routes"
// (/about + /privacy-policy), but this project has no router library
// installed (package.json has no react-router-dom or similar), and every
// other secondary screen in the codebase -- Leaderboard, DailySummary --
// is a conditionally-rendered full-screen overlay, not a URL-addressable
// route. Followed that existing precedent rather than adding a new
// dependency and a second navigation paradigm for three screens of static
// text. If real routing (shareable/bookmarkable URLs) is wanted later,
// react-router's HashRouter would drop in around this without needing to
// touch the content below.
//
// Privacy Policy content is a plain, factual description of this app's own
// actual data handling, grounded in what's really in the codebase (the
// three fetch destinations below are the only three that exist anywhere in
// src/ or public/map-style.json -- verified while writing this) -- not
// boilerplate legal text. It's a starting draft, flagged as such in-page;
// swap in real legal review before treating it as a binding policy.

import { useEffect, useId } from 'react';
import { APP_URL } from '../config.js';
import './InfoModal.css';

const TITLES = {
  howtoplay: 'How to Play',
  about: 'About',
  privacy: 'Privacy Policy',
};

function HowToPlayContent() {
  return (
    <>
      <p>
        EcoGuesser drops you somewhere in India's protected-area network --
        national parks, wildlife sanctuaries, tiger reserves, biosphere
        reserves, and Ramsar wetland sites -- and shows you a description of
        the place. Your job is to place a pin on the map where you think it
        is.
      </p>

      <h3>Modes</h3>
      <p>
        <strong>Classic</strong> is an untimed, infinite run through
        whichever categories and states you've selected in the side drawer.
        Play as many rounds as you like, back to back.
      </p>
      <p>
        <strong>Daily Challenge</strong> is five fixed sites, the same ones
        for everyone that day, one attempt each. It's timed, and your
        combined score goes on that day's leaderboard.
      </p>

      <h3>Scoring</h3>
      <p>
        Score starts at 5,000 and decays with distance from the real
        location -- the closer your pin, the higher the score. Using a hint
        costs 500 points off that round's score.
      </p>

      <h3>Hints</h3>
      <p>
        Two hints are available per round: the first narrows down the
        category, the second highlights the state the site is in on the
        map.
      </p>

      <h3>Difficulty (Classic only)</h3>
      <p>
        <strong>Easy</strong> shows state borders and state name labels.{' '}
        <strong>Normal</strong> shows borders without labels.{' '}
        <strong>Hard</strong> hides both, so you're working from geography
        alone.
      </p>
    </>
  );
}

function AboutContent() {
  return (
    <>
      <p>
        EcoGuesser is a geography-and-ecology guessing game built around
        India's protected areas. The site list is curated from publicly
        available records covering national parks, wildlife sanctuaries,
        tiger reserves, biosphere reserves, and Ramsar wetland sites.
      </p>
      <p>
        The map is built on{' '}
        <a href="https://www.maplibre.org/" target="_blank" rel="noreferrer">
          MapLibre GL JS
        </a>
        , with base map tiles from{' '}
        <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
          OpenFreeMap
        </a>{' '}
        and satellite imagery from{' '}
        <a href="https://s2maps.eu/" target="_blank" rel="noreferrer">
          EOX's Sentinel-2 cloudless project
        </a>
        , both built on open data.
      </p>
      <p>
        Found a site that's mislabeled, misplaced, or missing? Use the
        feedback button (bottom-right) to let us know.
      </p>
      <p className="im-muted">{APP_URL}</p>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <p className="im-draft-note">
        This is a plain-language description of what this app actually
        does with your data -- not reviewed legal boilerplate. Treat it as a
        draft.
      </p>

      <h3>What's stored on your device</h3>
      <p>
        Your player name, difficulty preference, a randomly generated
        identifier used to attribute leaderboard entries, and your Daily
        Challenge / Classic mode stats history are all stored in your
        browser's local storage. None of this requires an account, and none
        of it leaves your device unless described below.
      </p>

      <h3>What's sent elsewhere, and why</h3>
      <ul>
        <li>
          <strong>Daily Challenge leaderboard.</strong> Submitting a Daily
          score sends your player name, your identifier, the date, and your
          score/distance to this app's own backend, so it can show that
          day's top 10.
        </li>
        <li>
          <strong>Feedback messages.</strong> Text you submit through the
          feedback button is sent to a Google Form. Google's own privacy
          policy governs how that submission is handled on their end.
        </li>
        <li>
          <strong>Map tiles.</strong> Loading the map requests tiles, fonts,
          and imagery from OpenFreeMap and EOX. Like any web request, those
          providers' servers may log standard request metadata (e.g. IP
          address) per their own policies -- this app doesn't control or see
          that logging.
        </li>
      </ul>

      <h3>What this app doesn't do</h3>
      <p>
        No ads, no third-party analytics or tracking scripts, and no
        selling or sharing of data beyond the three purposes above.
      </p>

      <h3>Clearing your data</h3>
      <p>
        Clearing this site's data in your browser settings removes
        everything listed above from your device. It won't remove a
        leaderboard entry already submitted for a past day.
      </p>
    </>
  );
}

const CONTENT = {
  howtoplay: HowToPlayContent,
  about: AboutContent,
  privacy: PrivacyContent,
};

/** @param {{variant: 'howtoplay'|'about'|'privacy', onClose: () => void}} props */
export default function InfoModal({ variant, onClose }) {
  const titleId = useId();
  const Content = CONTENT[variant];

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!Content) return null;

  return (
    <div className="im-backdrop" role="presentation" onClick={onClose}>
      <div
        className="im-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="im-header">
          <h2 id={titleId}>{TITLES[variant]}</h2>
          <button type="button" className="im-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="im-body">
          <Content />
        </div>
      </div>
    </div>
  );
}
