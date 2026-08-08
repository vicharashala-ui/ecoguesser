// src/components/InfoModal.jsx
// Static pages: How to Play / About / Privacy Policy, reached from
// SideDrawer's footer links via App.jsx's onNavigate handler.
//
// Rendered as a conditionally-rendered full-screen overlay rather than a
// URL-addressable route -- there's no router library installed, and every
// other secondary screen (Leaderboard, DailySummary) follows the same
// pattern. If shareable/bookmarkable URLs are wanted later, react-router's
// HashRouter would drop in around this without touching the content below.
//
// Privacy Policy content describes this app's actual data handling (the
// fetch destinations named below are the only ones anywhere in src/ or
// public/map-style.json) rather than boilerplate legal text. It's a
// starting draft, flagged as such in-page; swap in real legal review
// before treating it as a binding policy.

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
        EcoGuesser<sup className="eg-tm">™</sup> drops you somewhere in India's protected-area network --
        national parks, wildlife sanctuaries, tiger reserves, biosphere
        reserves, and Ramsar wetland sites -- and shows you a description of
        the place. Your job is to place a pin on the map where you think it
        is.
      </p>

      <h3>Modes</h3>
      <p>
        <strong>Classic</strong> is an untimed, infinite run through
        whichever categories and states you've selected in the side drawer
        (Category and Region &amp; State filters). Play as many rounds as
        you like, back to back.
      </p>
      <p>
        <strong>Daily Challenge</strong> picks five fixed sites for the day
        -- unaffected by your filters -- one from each category (national
        park, wildlife sanctuary, tiger reserve, biosphere reserve, Ramsar
        site) -- the same five for everyone, one attempt each. Each site
        gives you 120 seconds to place your pin, and your combined score
        across all five goes on that day's leaderboard.
      </p>
      <p>
        <strong>Blitz</strong> shows you a protected area and asks which
        state it's in -- pulling from the same Category and Region &amp;
        State filters as Classic. Tap a state, then confirm -- get it right and the
        state turns green, get it wrong and you'll see your guess in red
        next to the correct answer in green. No pins, no distance, no
        timer -- just geography, at your own pace. Correct answers build a
        streak, shown alongside your best streak for the session; every 10th
        streak milestone banks a restore that automatically saves your
        streak the next time you're wrong (or skip), instead of resetting it
        to zero.
      </p>

      <h3>Placing Your Guess</h3>
      <p>
        In Classic and Daily, zoom and pan the map to narrow things down,
        then tap to drop your pin -- tap elsewhere to move it as many times
        as you like before you're ready. Hit <strong>Confirm</strong> to
        lock it in and reveal the answer.
      </p>
      <p>
        Not feeling a site? Classic and Blitz both have a{' '}
        <strong>Skip</strong> button that swaps in a new one at no cost.
        Daily doesn't -- that day's five sites are fixed for everyone.
      </p>

      <h3>Map View</h3>
      <p>
        Classic and Daily both offer <strong>Terrain</strong> and{' '}
        <strong>Satellite</strong> views alongside the default map, switchable
        anytime from the buttons in the top-right. Classic also has a{' '}
        <strong>Borders</strong> toggle (top-left) to show or hide state
        outlines.
      </p>

      <h3>Scoring</h3>
      <p>
        In Classic and Daily, score starts at 5,000 and decays with distance
        from the real location -- the closer your pin, the higher the score.
        Classic also shows a running average-distance dial next to the map
        controls, so you can track your accuracy trend across a session.
        Blitz doesn't use points; it tracks a correct-answer streak instead.
      </p>

      <h3>Hints</h3>
      <p>
        Classic and Daily each give you two hints per round (Blitz has
        none). The first reveals the site's state; the second highlights
        that state on the map. In Classic, hints are free. In Daily
        Challenge, each hint used costs 500 points off that round's score,
        so using both costs 1,000.
      </p>

      <h3>Achievements</h3>
      <p>
        Playing any mode unlocks badges for milestones like rounds played,
        guess accuracy, streaks, and perfect scores. Check your unlocked
        badges, and your full play history, from the <strong>Stats</strong>{' '}
        tab.
      </p>
    </>
  );
}

function AboutContent() {
  return (
    <>
      <p>
        EcoGuesser<sup className="eg-tm">™</sup> is a geography-and-ecology guessing game built around
        India's protected areas. The site list is curated from publicly
        available records covering national parks, wildlife sanctuaries,
        tiger reserves, biosphere reserves, and Ramsar wetland sites.
      </p>

      <h3>Vicharashala</h3>
      <p>
        Vicharashala (विचारशाला) is an educational technology company with a
        single driving belief: learning should never feel like a chore. The
        name -- a Sanskrit-rooted word meaning "a place for thought" --
        reflects our vision of creating spaces where curiosity thrives.
      </p>
      <p>
        We build games and interactive experiences that make serious
        subjects -- law, civics, history, language -- genuinely enjoyable to
        explore. Our philosophy is that the best learning happens when
        you're having too much fun to notice you're learning.
      </p>

      <p>
        The map is built on{' '}
        <a href="https://www.maplibre.org/" target="_blank" rel="noreferrer">
          MapLibre GL JS
        </a>
        , with base map tiles from{' '}
        <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
          OpenFreeMap
        </a>
        , satellite imagery from{' '}
        <a href="https://www.esri.com/en-us/arcgis/products/arcgis-world-imagery" target="_blank" rel="noreferrer">
          Esri World Imagery
        </a>
        , and terrain elevation data from the public{' '}
        <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">
          AWS Terrain Tiles
        </a>{' '}
        dataset, used for the hillshade look in Classic and Daily.
      </p>
      <p>
        Found a site that's mislabeled, misplaced, or missing? Open the menu
        (hamburger icon, top-left) and use the feedback form there to let us
        know.
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
        Your player name, a randomly generated
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
          feedback form (in the side drawer, opened from the hamburger
          icon) is sent to a Google Form. Google's own privacy policy
          governs how that submission is handled on their end.
        </li>
        <li>
          <strong>Map tiles.</strong> Loading the map requests tiles, fonts,
          and imagery from OpenFreeMap, Esri (ArcGIS World Imagery, via
          this app's own proxy), and AWS's public Terrain Tiles dataset
          (elevation data used for the hillshade look in Classic and
          Daily). Like any web request, those providers' servers may log
          standard request metadata (e.g. IP address) per their own
          policies -- this app doesn't control or see that logging.
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
