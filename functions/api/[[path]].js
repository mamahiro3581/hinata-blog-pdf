import worker from '../../cloudflare/worker.js';

export function onRequest(context) {
  return worker.fetch(context.request, context.env, context);
}
