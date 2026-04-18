import { createApp } from './_src/app.js';

// Module-level singleton — reused across warm Vercel invocations
let app   = null;
let initError = null;

async function getApp() {
  if (initError) throw initError;
  if (!app) {
    try {
      app = await createApp();
      await app.ready();
    } catch (err) {
      initError = err;
      console.error('[moonlighting] App init failed:', err.message);
      throw err;
    }
  }
  return app;
}

export default async function handler(req, res) {
  try {
    const fastify = await getApp();
    fastify.server.emit('request', req, res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}
