// src/game/blitzHighlight.js
//
// Blitz's map feedback -- deliberately does NOT follow
// stateHighlight.js's addLayer-once/setFilter idiom. That pattern fits
// Hint 2 well because only one highlight set is ever active at a time.
// Blitz needs up to two simultaneous sets (green correct + a red
// wrong state) that change on every tap and every round, so this uses
// MapLibre's setFeatureState instead: one fill layer + one outline layer,
// added once by useMapState.js (mode==='blitz'), each state polygon
// carrying a `blitzStatus` ('selected'|'correct'|'wrong'|null) as
// per-feature state. Changing a highlight is a setFeatureState call --
// no addLayer/removeLayer/setFilter here at all.
//
// Relies on the 'india-states' source's `promoteId: 'st_nm'` (added by
// useMapState.js) so each state's own name works directly as its
// feature-state id.

const STATE_SOURCE_ID = 'india-states';

let paintedStates = []; // st_nm values currently carrying a non-null status

function paint(map, stateName, status) {
  map.setFeatureState({ source: STATE_SOURCE_ID, id: stateName }, { blitzStatus: status });
  paintedStates.push(stateName);
}

/** SELECTING preview -- one state, blue. Called on every state tap. */
export function showSelection(map, stateName) {
  clearAll(map); // only one state is ever selected at a time
  if (stateName) paint(map, stateName, 'selected');
}

/**
 * REVEALING. Always paints every state in `correctStates` green.
 * Additionally paints `guessedState` red, but ONLY if isCorrect is false --
 * when correct, the guessed state is already one of correctStates.
 */
export function showReveal(map, correctStates, guessedState, isCorrect) {
  clearAll(map);
  correctStates.forEach((s) => paint(map, s, 'correct'));
  if (!isCorrect && guessedState) paint(map, guessedState, 'wrong');
}

/** Called at LOADING start (next site) and before every showSelection/showReveal. */
export function clearAll(map) {
  if (!map || !map.getSource(STATE_SOURCE_ID)) return;
  for (const s of paintedStates) {
    map.setFeatureState({ source: STATE_SOURCE_ID, id: s }, { blitzStatus: null });
  }
  paintedStates = [];
}
