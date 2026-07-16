// src/utils/sound.js
// Best-effort audio feedback for round outcomes (Classic/Daily/Blitz
// Confirm), synthesized with the Web Audio API rather than bundled audio
// files -- no new dependency, no network request, and the AudioContext is
// only constructed on first use (a Confirm tap), so there's zero cost at
// first render and it lines up with browsers' user-gesture autoplay
// policies for free. Mirrors haptics.js: three named, declarative
// functions instead of a generic play(pattern) export, and a silent
// no-op on any failure (unsupported browser, suspended context, etc.)
// rather than ever breaking a round.
//   soundConfirm(): every non-perfect Confirm -- a short neutral blip.
//   soundPerfect(): a boundary-hit guess (Classic/Daily only) -- a bright
//     three-note rise, fired alongside the same isPerfect condition
//     hapticPerfect() already gates on.
//   soundWrong(): Blitz incorrect state / Daily timeout -- a short low tone.
//
// Mute preference lives here (not threaded through the round hooks as a
// prop) since every call site already just fires a bare soundX() -- the
// hooks don't need to know sound is even togglable. isSoundEnabled/
// setSoundEnabled are exported for any future settings UI; sound defaults
// on and currently has no in-app toggle.

import { LS_KEYS } from '../config.js';

let muted = localStorage.getItem(LS_KEYS.SOUND) === 'off';

export function isSoundEnabled() {
  return !muted;
}

export function setSoundEnabled(enabled) {
  muted = !enabled;
  try {
    localStorage.setItem(LS_KEYS.SOUND, enabled ? 'on' : 'off');
  } catch {
    // no-op -- private-browsing/quota storage errors still leave `muted`
    // updated in-memory for the rest of this session
  }
}

let ctx = null;

function getContext() {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  return ctx;
}

// One oscillator + a gain envelope (fade in/out so starts/stops don't
// click), scheduled against the context's own clock rather than
// setTimeout so multi-note sequences (soundPerfect) stay sample-accurate.
function tone(freq, startOffset, duration, gainPeak = 0.12) {
  const audioCtx = getContext();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;

  const start = audioCtx.currentTime + startOffset;
  const end = start + duration;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainPeak, start + 0.012);
  gain.gain.linearRampToValueAtTime(0, end);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  osc.start(start);
  osc.stop(end);
}

function play(fn) {
  if (muted) return;
  try {
    fn();
  } catch {
    // no-op -- never let a sound call break a round
  }
}

export function soundConfirm() {
  play(() => tone(660, 0, 0.08));
}

export function soundPerfect() {
  play(() => {
    tone(660, 0, 0.09);
    tone(880, 0.08, 0.09);
    tone(1175, 0.16, 0.14);
  });
}

export function soundWrong() {
  play(() => tone(180, 0, 0.16, 0.1));
}

// Rank #1 on the daily leaderboard -- a once-a-day, bigger deal than a
// single perfect guess, so it gets its own fuller fanfare (C5-E5-G5-C6)
// rather than reusing soundPerfect's three-note rise. Fired alongside
// Leaderboard.jsx's ConfettiBurst, gated by the same sessionStorage guard.
export function soundCelebrate() {
  play(() => {
    tone(523.25, 0, 0.1);
    tone(659.25, 0.09, 0.1);
    tone(783.99, 0.18, 0.1);
    tone(1046.5, 0.27, 0.22, 0.14);
  });
}
