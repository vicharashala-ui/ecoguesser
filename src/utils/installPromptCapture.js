// src/utils/installPromptCapture.js
//
// Captures `beforeinstallprompt`/`appinstalled` at the earliest possible
// moment (imported eagerly from main.jsx, before React even mounts) so the
// one-shot event is never missed while InstallPrompt.jsx's banner UI --
// lazy-loaded from App.jsx -- is still being fetched. The event can't be
// re-requested if a listener attaches too late, so this half of the concern
// can't be deferred; only the render half (JSX + CSS, no browser API of its
// own) is safe to code-split.

let deferredPrompt = null;
let installed = false;
let onChange = null; // single subscriber -- exactly one InstallPrompt ever mounts

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  onChange?.();
});

window.addEventListener('appinstalled', () => {
  installed = true;
  deferredPrompt = null;
  onChange?.();
});

export function getDeferredPrompt() {
  return deferredPrompt;
}

export function clearDeferredPrompt() {
  deferredPrompt = null;
}

export function wasJustInstalled() {
  return installed;
}

// Lets InstallPrompt.jsx react to an event that fires after it mounts.
// Returns an unsubscribe function.
export function onInstallPromptChange(fn) {
  onChange = fn;
  return () => {
    if (onChange === fn) onChange = null;
  };
}
