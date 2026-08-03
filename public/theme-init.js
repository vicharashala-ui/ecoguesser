// Render-blocking by design (sets [data-theme]/[data-standalone] before
// index.css's first paint) -- every byte here delays paint, so this stays
// minified. CSP (script-src 'self', no unsafe-inline) is why it's external
// instead of inlined in index.html. Theme key must match LS_KEYS.THEME in
// src/config.js, which doesn't exist yet at this point in the load.
(function(){var t=localStorage.getItem('ecoguesser_theme'),d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',d?'dark':'light');if(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)document.documentElement.setAttribute('data-standalone','');})();
