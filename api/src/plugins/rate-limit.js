import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

export default fp(async (fastify) => {
  await fastify.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.user?.id || req.ip,
    errorResponseBuilder: () => ({ error: 'Demasiadas solicitudes, intenta en un momento' }),
  });
});
