// src/utils/haptics.js
// Best-effort haptic feedback for round outcomes (Classic/Daily/Blitz
// Confirm). navigator.vibrate is Android Chrome/Firefox only -- no iOS
// Safari support, and unavailable on desktop -- so this silently no-ops
// everywhere else rather than throwing or being called conditionally at
// every call site.
//
// Named patterns, not a generic vibrate(pattern) export: keeps the
// call sites (useClassicRound/useDailyRound/useBlitzRound) declarative
// about *what happened*, not which raw millisecond pattern that maps to,
// so the feel can be retuned here without touching three files.
//   confirm(): every non-perfect Confirm -- a light single tap.
//   perfect(): a boundary-hit guess (Classic/Daily only) -- a distinct
//     multi-pulse pattern, reserved for the same isPerfect condition
//     BottomCard.jsx's own celebration already gates on.
//   wrong(): incorrect guess (Blitz) or Daily timeout -- a longer single buzz.
//
// Mute preference mirrors sound.js: stored here, read by the settings
// toggle in SideDrawer, checked before every vibrate() call.

import { LS_KEYS } from '../config.js';

let muted = localStorage.getItem(LS_KEYS.HAPTICS) === 'off';

export function isHapticsEnabled() {
  return !muted;
}

export function setHapticsEnabled(enabled) {
  muted = !enabled;
  try {
    localStorage.setItem(LS_KEYS.HAPTICS, enabled ? 'on' : 'off');
  } catch {
    // no-op -- private-browsing/quota storage errors still leave `muted`
    // updated in-memory for the rest of this session
  }
}

function vibrate(pattern) {
  if (muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // no-op -- never let a haptics call break a round
  }
}

export function hapticConfirm() {
  vibrate(15);
}

export function hapticPerfect() {
  vibrate([10, 40, 10, 40, 25]);
}

export function hapticWrong() {
  vibrate(30);
}
