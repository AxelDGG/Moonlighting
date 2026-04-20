import fp from 'fastify-plugin';
import cors from '@fastify/cors';

const { FRONTEND_URL, VERCEL_URL, FRONTEND_DEV_PORT } = process.env;
const DEFAULT_FRONTEND_PORT = FRONTEND_DEV_PORT || '5173';

export default fp(async (fastify) => {
  const frontendUrl = FRONTEND_URL || `http://localhost:${DEFAULT_FRONTEND_PORT}`;
  const vercelUrl   = VERCEL_URL ? `https://${VERCEL_URL}` : null;
  const allowed     = new Set([frontendUrl, vercelUrl].filter(Boolean));

  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowed.has(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  });
});
