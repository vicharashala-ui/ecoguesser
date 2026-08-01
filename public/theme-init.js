// Sets [data-theme] before index.css's first paint, so dark-mode players
// never see a light flash while React/main.jsx are still loading.
// External (not inlined) because the deployed CSP is `script-src 'self'`
// with no 'unsafe-inline'/nonce/hash -- an inline <script> here is silently
// blocked in production, which desyncs the real DOM attribute from
// theme.js's getTheme() (still correct, since it runs inside the bundled,
// same-origin JS) until the player clicks the toggle twice.
// Key literal ('ecoguesser_theme') must stay in sync with LS_KEYS.THEME in
// src/config.js -- this runs before that module exists.
(function () {
  var stored = localStorage.getItem('ecoguesser_theme');
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();

// Marks standalone/installed-PWA launches before index.css's first paint, so
// the app-shell height rule below can skip 100dvh for them. 100dvh exists to
// fix Safari's retracting-address-bar case, but has a separate, well-known
// WebKit bug in standalone mode: it can report a stale/wrong value on cold
// start and won't self-correct until a rotation event fires -- closing and
// reopening the PWA is what was "fixing" the missing BottomNav, since that's
// a fresh cold start each time. Standalone has no address bar to retract in
// the first place, so plain 100vh is already correct there. Same detection
// (matchMedia display-mode + iOS's own navigator.standalone flag) as
// InstallPrompt.jsx uses to hide the install nag once already installed.
(function () {
  var standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (standalone) document.documentElement.setAttribute('data-standalone', '');
})();
