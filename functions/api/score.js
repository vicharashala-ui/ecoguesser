import { handleScore } from '../_shared/handlers.js';

export async function onRequestPost(context) {
  return handleScore(context.request, context.env);
}
