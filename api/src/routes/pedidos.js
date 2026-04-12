const bodySchema = {
  type: 'object',
  properties: {
    cliente_id:    { type: ['integer', 'null'] },
    tipo_servicio: { type: 'string', enum: ['Abanico', 'Persiana', 'Levantamiento', 'Limpieza', 'Mantenimiento'] },
    fecha:         { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    cantidad:      { type: 'integer', minimum: 1 },
    total:         { type: 'number', minimum: 0 },
    detalles:      { type: 'object' },
  },
  additionalProperties: false,
};

export default async function pedidosRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  fastify.get('/', async (req, reply) => {
    const { data, error } = await fastify.supabase.from('pedidos').select('*').order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar pedidos' });
    return data;
  });

  fastify.post('/', {
    schema: { body: { ...bodySchema, required: ['tipo_servicio', 'fecha', 'cantidad', 'total'] } },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase.from('pedidos').insert(req.body).select().single();
    if (error) return reply.code(500).send({ error: 'Error al crear pedido' });
    return reply.code(201).send(data);
  });

  fastify.put('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: bodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase.from('pedidos').update(req.body).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar pedido' });
    return reply.code(204).send();
  });

  fastify.delete('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase.from('pedidos').delete().eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al eliminar pedido' });
    return reply.code(204).send();
  });
}
