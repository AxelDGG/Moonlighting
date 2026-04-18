const bodySchema = {
  type: 'object',
  properties: {
    tecnico_id:    { type: ['integer', 'null'] },
    nombre:        { type: ['string', 'null'] },
    start_address: { type: ['string', 'null'] },
    start_lat:     { type: ['number', 'null'] },
    start_lng:     { type: ['number', 'null'] },
    end_address:   { type: ['string', 'null'] },
    end_lat:       { type: ['number', 'null'] },
    end_lng:       { type: ['number', 'null'] },
  },
  additionalProperties: false,
};

export default async function routeConfigsRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);
  const mutate = fastify.requireRole(['admin', 'gestor']);

  // GET / - Listar configs (opcionalmente filtrar por técnico)
  fastify.get('/', async (req, reply) => {
    let query = fastify.supabase
      .from('route_configs')
      .select('*, tecnicos(id, nombre)')
      .order('updated_at', { ascending: false });
    if (req.query.tecnico_id) {
      query = query.eq('tecnico_id', parseInt(req.query.tecnico_id));
    }
    const { data, error } = await query;
    if (error) return reply.code(500).send({ error: 'Error al cargar configuraciones de ruta' });
    return data;
  });

  // POST / - Crear config
  fastify.post('/', { preHandler: mutate, schema: { body: bodySchema } }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('route_configs')
      .insert(req.body)
      .select('*, tecnicos(id, nombre)')
      .single();
    if (error) {
      req.log.error({ err: error }, 'route_configs insert failed');
      return reply.code(500).send({ error: 'Error al crear configuración' });
    }
    return reply.code(201).send(data);
  });

  // PUT /:id - Actualizar config
  fastify.put('/:id', {
    preHandler: mutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: bodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('route_configs')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar configuración' });
    return reply.code(204).send();
  });

  // DELETE /:id - Eliminar config
  fastify.delete('/:id', {
    preHandler: mutate,
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('route_configs').delete().eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al eliminar configuración' });
    return reply.code(204).send();
  });
}
