import { handleLeaderboard } from '../_shared/handlers.js';

export async function onRequestGet(context) {
  return handleLeaderboard(context.request, context.env);
}
