// Endpoints de configuración runtime:
//   GET  /api/config/runtime    → bundle JSON para el frontend (pricing,
//                                 duraciones, geo, zonas). Requiere auth.
//   POST /api/config/pricing    → actualizar un pricing_config (admin only).

import { getRuntimeConfig, invalidateRuntimeConfig } from '../loaders/config-cache.js';
import { ROLES } from '../constants/roles.js';

const pricingBodySchema = {
  type: 'object',
  required: ['clave', 'valor'],
  properties: {
    clave: { type: 'string', minLength: 1, maxLength: 100 },
    valor: { type: 'number', minimum: 0 },
  },
  additionalProperties: false,
};

export default async function configRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  fastify.get('/runtime', async (req, reply) => {
    try {
      const cfg = await getRuntimeConfig(fastify.supabase);
      return cfg;
    } catch (err) {
      req.log.error({ err }, 'runtime-config load failed');
      return reply.code(500).send({ error: 'No se pudo cargar la configuración' });
    }
  });

  fastify.post('/pricing', {
    preHandler: fastify.requireRole([ROLES.ADMIN]),
    schema: { body: pricingBodySchema },
  }, async (req, reply) => {
    const { clave, valor } = req.body;
    const { error } = await fastify.supabase
      .from('pricing_config')
      .upsert({ clave, valor, updated_at: new Date().toISOString() }, { onConflict: 'clave' });
    if (error) {
      req.log.error({ err: error }, 'pricing update failed');
      return reply.code(500).send({ error: 'Error al actualizar pricing' });
    }
    invalidateRuntimeConfig();
    return reply.code(204).send();
  });
}
