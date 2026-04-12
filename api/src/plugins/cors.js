import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { config } from '../config.js';

const ALLOWED_ORIGINS = new Set(
  [config.frontendUrl, process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null]
    .filter(Boolean)
);

export default fp(async (fastify) => {
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, curl)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  });
});
