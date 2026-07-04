import { handleTileProxy } from '../_shared/tileProxy.js';

export async function onRequestGet(context) {
  return handleTileProxy(context.request, context.params.path, context.waitUntil.bind(context));
}
