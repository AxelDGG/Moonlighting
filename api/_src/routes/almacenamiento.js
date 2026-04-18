const bodySchema = {
  type: 'object',
  properties: {
    modelo:    { type: 'string', minLength: 1 },
    categoria: { type: 'string' },
    lugar:     { type: 'string' },
    cantidad:  { type: 'integer', minimum: 0 },
    precio:    { type: 'number', minimum: 0 },
    notas:     { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export default async function almacenamientoRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);
  const mutate = fastify.requireRole(['admin', 'gestor']);

  fastify.get('/', async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('almacenamiento').select('*').order('modelo').order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar almacenamiento' });
    return data;
  });

  fastify.post('/', {
    preHandler: mutate,
    schema: { body: { ...bodySchema, required: ['modelo', 'categoria', 'lugar', 'cantidad', 'precio'] } },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('almacenamiento').insert(req.body).select().single();
    if (error) return reply.code(500).send({ error: 'Error al crear entrada de almacenamiento' });
    return reply.code(201).send(data);
  });

  fastify.put('/:id', {
    preHandler: mutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: bodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('almacenamiento').update(req.body).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar entrada de almacenamiento' });
    return reply.code(204).send();
  });

  fastify.delete('/:id', {
    preHandler: fastify.requireRole(['admin']),
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('almacenamiento').delete().eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al eliminar entrada de almacenamiento' });
    return reply.code(204).send();
  });
}
