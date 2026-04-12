const bodySchema = {
  type: 'object',
  properties: {
    nombre:      { type: 'string', minLength: 1, maxLength: 200 },
    numero:      { type: 'string', minLength: 1, maxLength: 20 },
    direccion:   { type: 'string', minLength: 1, maxLength: 500 },
    municipio:   { type: 'string', maxLength: 100 },
    lat:         { type: ['number', 'null'] },
    lng:         { type: ['number', 'null'] },
    metodo_pago: { type: 'string', enum: ['Efectivo', 'Tarjeta', 'Transferencia', 'Credito'] },
    num_pedido:  { type: ['string', 'null'], maxLength: 50 },
  },
  additionalProperties: false,
};

export default async function clientesRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  fastify.get('/', async (req, reply) => {
    const { data, error } = await fastify.supabase.from('clientes').select('*').order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar clientes' });
    return data;
  });

  fastify.post('/', {
    schema: { body: { ...bodySchema, required: ['nombre', 'numero', 'direccion'] } },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase.from('clientes').insert(req.body).select().single();
    if (error) return reply.code(500).send({ error: 'Error al crear cliente' });
    return reply.code(201).send(data);
  });

  fastify.put('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: bodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase.from('clientes').update(req.body).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar cliente' });
    return reply.code(204).send();
  });

  fastify.delete('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase.from('clientes').delete().eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al eliminar cliente' });
    return reply.code(204).send();
  });
}
