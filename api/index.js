import { createApp } from './src/app.js';

// Module-level singleton — reused across warm Vercel invocations
let app = null;

async function getApp() {
  if (!app) {
    app = await createApp();
    await app.ready();
  }
  return app;
}

export default async function handler(req, res) {
  const fastify = await getApp();
  fastify.server.emit('request', req, res);
}
