// src/game/api.js
//
// Thin fetch wrappers for the leaderboard/score endpoints. Neither throws
// on a non-2xx status -- postScore() returns { status, data } so
// DailySummary can branch on 200/409/other itself. getLeaderboard() DOES
// throw on a non-ok response or network failure, since every one of its
// callers (DailySummary's fallback path, Leaderboard's own fetch) already
// wraps it in try/catch and wants a single failure signal, not a second
// status code to re-check.
//
// submitFeedback() -- POST to a Google Form endpoint with mode:'no-cors',
// silently swallow the error if the request itself fails (Google Forms
// never responds to no-cors reads either way; there's no response body to
// check even on success), and let the caller (SideDrawer.jsx's inline
// feedback box) show its "Thanks!" confirmation unconditionally.

export async function postScore({ uuid, playerName, date, totalPts, totalDist }) {
  const res = await fetch('/api/score', {
    method: 'POST',
    // X-Requested-With forces the browser into a CORS preflight for any
    // cross-origin caller. This app never sends Access-Control-Allow-Origin
    // for any other origin, so that preflight always fails -- a plain HTML
    // <form> (which can't set custom headers at all) or a fetch() from some
    // other site can no longer reach this endpoint using a visitor's own
    // browser/IP. Checked server-side in handleScore.
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ecoguesser' },
    body: JSON.stringify({
      uuid,
      player_name: playerName,
      date,
      total_pts: totalPts,
      total_dist: totalDist,
    }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

export async function getLeaderboard(date) {
  const res = await fetch(`/api/leaderboard?date=${date}`);
  if (!res.ok) throw new Error(`leaderboard fetch failed: ${res.status}`);
  return res.json(); // { top10: [{ player_name, total_pts, total_dist }] }
}

/**
 * FEEDBACK_FORM_URL/FEEDBACK_ENTRY_ID come from
 * VITE_FEEDBACK_FORM_URL/VITE_FEEDBACK_ENTRY_ID (see config.js) -- set these
 * in `.env.local` (a real Google Form's "formResponse" URL + its message
 * field's `entry.XXXXXXXXX` id) for feedback to actually reach the
 * developer. If they're unset, the fetch below fails immediately, which is
 * caught and ignored -- matching the spec's own "show success
 * unconditionally" behavior, so the UI works either way.
 */
export async function submitFeedback(formUrl, entryId, text) {
  const body = new URLSearchParams({ [entryId]: text });
  try {
    await fetch(formUrl, { method: 'POST', mode: 'no-cors', body });
  } catch {
    // no-cors gives no readable response either way -- nothing to branch on.
  }
}
