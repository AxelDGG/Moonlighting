import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { RATE_LIMITS } from '../config/rate-limits.js';

export default fp(async (fastify) => {
  await fastify.register(rateLimit, {
    global: true,
    max: RATE_LIMITS.GLOBAL.max,
    timeWindow: RATE_LIMITS.GLOBAL.timeWindow,
    keyGenerator: (req) => req.user?.id || req.ip,
    errorResponseBuilder: () => ({ error: 'Demasiadas solicitudes, intenta en un momento' }),
  });
});
