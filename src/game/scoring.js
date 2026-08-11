// src/game/scoring.js
// Distance/score math shared by all three modes: haversine + boundary
// distance for scoring a guess, plus the point-in-polygon test used to
// detect a perfect (inside-boundary) guess.

import { SCORING } from '../config.js';

const EARTH_RADIUS_KM = 6371;

// Rough km per degree of latitude, used only by the small-scale flat-plane
// approximation in closestPointOnSegment/distanceToBoundary below -- not a
// substitute for haversine's proper great-circle math above.
const KM_PER_DEG = 111.32;

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

// Even-odd ray-casting test against a single ring. `ring`: [[lng,lat], ...].
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

// `rings`: [outerRing, ...holeRings]. A point counts only if it's inside the
// outer ring and outside every hole.
function pointInPolygon(lng, lat, rings) {
  if (!pointInRing(lng, lat, rings[0])) return false;
  return rings.slice(1).every((hole) => !pointInRing(lng, lat, hole));
}

// Shared walker for Polygon/MultiPolygon/Feature/FeatureCollection payloads.
// Invokes callback(rings) once per polygon, where `rings` is that polygon's
// own [outerRing, ...holeRings] array -- exactly the shape pointInPolygon
// expects. isPointInBoundary and distanceToBoundary both call this instead
// of each re-walking features/geometry types themselves.
function forEachRing(geojson, callback) {
  if (!geojson) return;
  const features =
    geojson.type === 'FeatureCollection' ? geojson.features
    : geojson.type === 'Feature' ? [geojson]
    : [{ geometry: geojson }];

  features.forEach((f) => {
    const geom = f?.geometry;
    if (geom?.type === 'Polygon') callback(geom.coordinates);
    else if (geom?.type === 'MultiPolygon') geom.coordinates.forEach((rings) => callback(rings));
  });
}

/**
 * Tests whether (lat, lng) falls inside a site's boundary GeoJSON. Handles
 * Polygon and MultiPolygon (disjoint sites -- islands, marine parks split
 * across coastline, etc.), each with any number of holes, across every
 * feature in a FeatureCollection.
 */
export function isPointInBoundary(lat, lng, geojson) {
  if (!geojson) return false;
  let inside = false;
  forEachRing(geojson, (rings) => {
    if (pointInPolygon(lng, lat, rings)) inside = true;
  });
  return inside;
}

// Closest point on segment [lat1,lng1]-[lat2,lng2] to (lat,lng). Projected
// onto a local flat plane (lng scaled by cosLat so a degree of longitude and
// a degree of latitude cover comparable ground distance near this point) --
// sites are small enough that this approximation holds, no geodesic library
// needed. `t` (the segment's own interpolation parameter) is the same in
// the flat projection as in raw lat/lng, since the projection just scales
// each axis independently, so the nearest lat/lng is interpolated directly
// rather than re-projected back out.
function closestPointOnSegment(lat, lng, lat1, lng1, lat2, lng2, cosLat) {
  const ax = lng1 * cosLat, ay = lat1;
  const bx = lng2 * cosLat, by = lat2;
  const px = lng * cosLat, py = lat;

  const dx = bx - ax, dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));

  const nearestLng = lng1 + t * (lng2 - lng1);
  const nearestLat = lat1 + t * (lat2 - lat1);

  const nx = ax + t * dx, ny = ay + t * dy;
  const distanceKm = Math.sqrt((px - nx) ** 2 + (py - ny) ** 2) * KM_PER_DEG;

  return { distanceKm, nearestLng, nearestLat };
}

/**
 * Distance from (lat, lng) to a site's boundary GeoJSON, in km, plus the
 * nearest point on that boundary -- used so a near-miss just outside a
 * large site's edge isn't scored as if it missed by the full centroid
 * distance. Returns { distanceKm: 0, nearestLng: lng, nearestLat: lat } when
 * the point is already inside. Returns null when geojson is missing (caller
 * falls back to centroid haversine, same fallback pattern fetchBoundary
 * already uses for the 2 hasBoundary:false sites).
 */
export function distanceToBoundary(lat, lng, geojson) {
  if (!geojson) return null;
  if (isPointInBoundary(lat, lng, geojson)) {
    return { distanceKm: 0, nearestLng: lng, nearestLat: lat };
  }

  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best = null;

  forEachRing(geojson, (rings) => {
    rings.forEach((ring) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lng1, lat1] = ring[i];
        const [lng2, lat2] = ring[i + 1];
        const candidate = closestPointOnSegment(lat, lng, lat1, lng1, lat2, lng2, cosLat);
        if (!best || candidate.distanceKm < best.distanceKm) best = candidate;
      }
    });
  });

  return best;
}

/**
 * Math.max(0, rawScore - hintsUsed * SCORING.HINT_PENALTY)
 * Classic callers always pass hintsUsed = 0 (hints are free outside Daily).
 */
export function applyHintPenalty(rawScore, hintsUsed) {
  return Math.max(0, rawScore - hintsUsed * SCORING.HINT_PENALTY);
}
