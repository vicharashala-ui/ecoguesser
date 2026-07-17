import { handleDemTileProxy } from '../../_shared/tileProxy.js';

export async function onRequestGet(context) {
  return handleDemTileProxy(context.request, context.params.path, context.waitUntil.bind(context));
}
