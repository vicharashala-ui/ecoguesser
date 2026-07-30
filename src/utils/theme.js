// src/utils/theme.js
// Light/dark theme preference. Mirrors sound.js/haptics.js: plain get/set
// functions read/written by SideDrawer's settings panel, rather than a
// React context -- the only other consumer is index.html's inline
// anti-flash script (see there for why that copy can't just import this).
//
// Resolution order: an explicit user choice (localStorage) wins; absent
// one, prefers-color-scheme decides. watchSystemTheme() keeps the second
// case live (OS theme flips mid-session) for as long as the first case
// stays unset.

import { LS_KEYS } from '../config.js';

const media = window.matchMedia('(prefers-color-scheme: dark)');

function systemTheme() {
  return media.matches ? 'dark' : 'light';
}

export function getTheme() {
  return localStorage.getItem(LS_KEYS.THEME) || systemTheme();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function setTheme(theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(LS_KEYS.THEME, theme);
  } catch {
    // no-op -- private-browsing/quota storage errors still leave the
    // attribute applied for the rest of this session
  }
}

// Registered once at boot (main.jsx), not per-SideDrawer-mount: the drawer
// is lazy-loaded and often never opened, but the OS can flip its theme at
// any time regardless. Once the player makes an explicit choice, setTheme's
// localStorage write makes getTheme() ignore the system value going
// forward, so this listener's applyTheme calls become harmless no-ops.
export function watchSystemTheme() {
  const handler = (e) => {
    if (localStorage.getItem(LS_KEYS.THEME)) return;
    applyTheme(e.matches ? 'dark' : 'light');
  };
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}
