import { ROLES } from '../constants/roles.js';

export default async function vehiculosRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);
  const mutate = fastify.requireRole([ROLES.ADMIN]);

  fastify.get('/', async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('vehiculos').select('*').eq('activo', true).order('nombre');
    if (error) return reply.code(500).send({ error: 'Error al cargar vehículos' });
    return data;
  });

  fastify.post('/', {
    preHandler: mutate,
    schema: {
      body: {
        type: 'object',
        required: ['nombre'],
        properties: {
          nombre: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('vehiculos').insert({ nombre: req.body.nombre }).select().single();
    if (error) return reply.code(500).send({ error: 'Error al crear vehículo' });
    return reply.code(201).send(data);
  });

  fastify.delete('/:id', {
    preHandler: mutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('vehiculos').update({ activo: false }).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al eliminar vehículo' });
    return reply.code(204).send();
  });
}
