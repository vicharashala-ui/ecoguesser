// src/game/playerName.js
//
// Deterministic fallback display name for players who skip the name
// prompt (NamePromptModal's Skip button). Previously this was the literal
// string 'Player' for everyone, so the leaderboard could show several
// indistinguishable "Player" rows. Deriving a suffix from the player's
// UUID keeps skip-submissions anonymous (no typed name, nothing written
// to LS_KEYS.NAME) while still being unique-enough for display and stable
// across days, since it's recomputed from the same UUID every time.

export function getSkipPlayerName(uuid) {
  const tail = (uuid ?? '').replace(/-/g, '').slice(-4).toUpperCase();
  // Guard against a missing/malformed uuid (shouldn't happen -- main.jsx
  // seeds LS_KEYS.UUID unconditionally on first load) -- fall back to the
  // old bare literal rather than emitting "Player-" with a short tail.
  return tail.length === 4 ? `Player-${tail}` : 'Player';
}
