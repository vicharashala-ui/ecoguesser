// src/game/api.js
//
// Thin fetch wrappers for the two Section 12 endpoints. Neither throws on a
// non-2xx status -- postScore() returns { status, data } so DailySummary can
// branch on 200/409/other itself, exactly like Section 4 specs it. getLeaderboard()
// DOES throw on a non-ok response or network failure, since every one of its
// callers (DailySummary's fallback path, Leaderboard's own fetch) already
// wraps it in try/catch and wants a single failure signal, not a second
// status code to re-check.

export async function postScore({ uuid, playerName, date, totalPts, totalDist }) {
  const res = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
