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
