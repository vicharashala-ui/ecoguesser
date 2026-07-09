// src/components/InstallPrompt.jsx
//
// A once-a-day "Add to Home Screen" nudge. Mounted once at the App root
// (like Header), independent of activeTab, so it can surface regardless of
// which mode the player is in.
//
// Two paths, since only one of them has any real browser API behind it:
//   - Android/desktop Chrome/Edge: the browser fires `beforeinstallprompt`
//     if the PWA-install criteria are met (manifest + SW registered, not
//     already installed, etc). We preventDefault() it and hold onto the
//     event so OUR banner's "Add" button can trigger the real native
//     install sheet via promptEvent.prompt() -- otherwise Chrome would show
//     its own little infobar on top of/instead of this one.
//   - iOS Safari (and iPadOS, and other iOS browsers riding WebKit's share
//     sheet): there's no install API at all. "Add to Home Screen" only
//     exists behind the manual Share-sheet action, so that variant just
//     shows instructions instead of a button that would do nothing.
//
// Timing: waits MIN_DELAY_MS after mount before showing at all, so it never
// competes with the map's first paint or Daily's opening round -- then only
// once per calendar day (LS_KEYS.INSTALL_PROMPT_SHOWN, IST date string,
// same pattern as Leaderboard.jsx's RECAP_SHOWN). Skipped entirely once the
// app is already running standalone (installed) -- no point nagging someone
// who already added it.

import { useEffect, useRef, useState } from 'react';
import { LS_KEYS } from '../config.js';
import { getTodayString } from '../game/daily.js';
import { TIGER_MARK_VIEWBOX, TIGER_MARK_ASPECT, TIGER_MARK_PATH } from './tigerMarkPath.js';
import './InstallPrompt.css';

const MIN_DELAY_MS = 10000;
const ICON_SIZE = 26;

function isStandaloneDisplay() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari's own flag -- matchMedia above doesn't cover it
  );
}

// iPadOS 13+ reports its UA as a plain Mac -- maxTouchPoints is what
// actually distinguishes it from a real desktop Safari.
function isIOSDevice() {
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState(null); // 'native' | 'ios'
  const deferredPromptRef = useRef(null);
  // Guards against the timer callback and the beforeinstallprompt handler
  // both trying to open the toast in the same session.
  const shownRef = useRef(false);

  useEffect(() => {
    if (isStandaloneDisplay()) return undefined;

    function tryShow() {
      if (shownRef.current) return;
      if (isStandaloneDisplay()) return;
      const today = getTodayString();
      if (localStorage.getItem(LS_KEYS.INSTALL_PROMPT_SHOWN) === today) return;
      // No real install path available -- Android/desktop with no
      // beforeinstallprompt fired yet, and not iOS either -- nothing to show.
      if (!deferredPromptRef.current && !isIOSDevice()) return;
      shownRef.current = true;
      localStorage.setItem(LS_KEYS.INSTALL_PROMPT_SHOWN, today);
      setMode(deferredPromptRef.current ? 'native' : 'ios');
      setVisible(true);
    }

    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      deferredPromptRef.current = e;
      tryShow();
    }
    function onAppInstalled() {
      setVisible(false);
      deferredPromptRef.current = null;
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    const timer = setTimeout(tryShow, MIN_DELAY_MS);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  function handleAdd() {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) {
      setVisible(false);
      return;
    }
    promptEvent.prompt();
    // userChoice resolves either way (accepted or dismissed) -- either
    // result means this specific native prompt is now spent and can't be
    // reused, so close the toast regardless of which way the user went.
    promptEvent.userChoice.finally(() => {
      deferredPromptRef.current = null;
      setVisible(false);
    });
  }

  function handleDismiss() {
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="eg-install-toast" role="dialog" aria-label="Add to Home Screen">
      <svg
        className="eg-install-icon"
        width={ICON_SIZE}
        height={Math.round(ICON_SIZE * TIGER_MARK_ASPECT)}
        viewBox={TIGER_MARK_VIEWBOX}
        aria-hidden="true"
      >
        <path fill="#fff" fillRule="evenodd" d={TIGER_MARK_PATH} />
      </svg>
      <div className="eg-install-text">
        <p className="eg-install-title">Add to Home Screen</p>
        <p className="eg-install-sub">
          {mode === 'ios'
            ? 'Tap Share, then "Add to Home Screen" for one-tap access.'
            : 'Install EcoGuesser for quick, full-screen access.'}
        </p>
      </div>
      <div className="eg-install-actions">
        {mode === 'native' && (
          <button type="button" className="eg-install-add" onClick={handleAdd}>
            Add
          </button>
        )}
        <button type="button" className="eg-install-dismiss" onClick={handleDismiss} aria-label="Dismiss">
          &times;
        </button>
      </div>
    </div>
  );
}
