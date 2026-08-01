import { handleDailyManifest } from '../_shared/handlers.js';

export async function onRequestGet(context) {
  return handleDailyManifest(context.request, context.env, context.waitUntil.bind(context));
}
