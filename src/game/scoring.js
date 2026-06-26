import { SCORING } from '../config.js';

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two lat/lng points, in km. */
export function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Math.round(5000 * e^(-distKm/50))
 * NULL GUARD REQUIRED: distKm === null would otherwise compute
 * `null / 50` -> 0 -> e^0 -> 1 -> returns the MAX score instead of 0.
 */
export function calcScore(distKm) {
  if (distKm === null || distKm === undefined) return 0;
  return Math.round(SCORING.MAX_SCORE * Math.exp(-distKm / SCORING.DECAY_KM));
}

/** Great-circle midpoint between two lat/lng points (for centering the result view). */
export function midpoint(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const lambda1 = toRad(lng1);
  const dLambda = toRad(lng2 - lng1);

  const bx = Math.cos(phi2) * Math.cos(dLambda);
  const by = Math.cos(phi2) * Math.sin(dLambda);

  const phi3 = Math.atan2(
    Math.sin(phi1) + Math.sin(phi2),
    Math.sqrt((Math.cos(phi1) + bx) ** 2 + by ** 2)
  );
  const lambda3 = lambda1 + Math.atan2(by, Math.cos(phi1) + bx);

  return { lat: toDeg(phi3), lng: toDeg(lambda3) };
}

/**
 * Math.max(0, rawScore - hintsUsed * SCORING.HINT_PENALTY)
 * Classic callers always pass hintsUsed = 0 (hints are free outside Daily).
 */
export function applyHintPenalty(rawScore, hintsUsed) {
  return Math.max(0, rawScore - hintsUsed * SCORING.HINT_PENALTY);
}
