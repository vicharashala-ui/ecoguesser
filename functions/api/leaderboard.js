import { handleLeaderboard } from '../_shared/handlers.js';

export async function onRequestGet(context) {
  // context.waitUntil lets handleLeaderboard's edge-cache write happen
  // after the response is returned instead of blocking it -- same pattern
  // functions/tiles/[[path]].js already uses for the tile proxy.
  return handleLeaderboard(context.request, context.env, context.waitUntil.bind(context));
}
