import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export default fp(async (fastify) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const vercelUrl   = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
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
