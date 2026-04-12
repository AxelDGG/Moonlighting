const bodySchema = {
  type: 'object',
  properties: {
    pedido_id:           { type: 'integer' },
    tecnico:             { type: ['string', 'null'], maxLength: 100 },
    hora_programada:     { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$', maxLength: 5 },
    hora_llegada:        { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$', maxLength: 5 },
    hora_inicio:         { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$', maxLength: 5 },
    hora_fin:            { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$', maxLength: 5 },
    zona:                { type: ['string', 'null'], maxLength: 100 },
    orden_ruta:          { type: ['integer', 'null'] },
    estado:              { type: 'string', enum: ['programado', 'en_curso', 'completado', 'cancelado', 'atrasado'] },
    retraso_min:         { type: ['integer', 'null'] },
    motivo_retraso:      { type: ['string', 'null'], maxLength: 200 },
    motivo_cancelacion:  { type: ['string', 'null'], maxLength: 200 },
    dia_semana:          { type: ['string', 'null'], maxLength: 20 },
    es_fecha_especial:   { type: 'boolean' },
    nota_fecha_especial: { type: ['string', 'null'], maxLength: 300 },
  },
  additionalProperties: false,
};

export default async function metricasRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  fastify.get('/', async (req, reply) => {
    const { data, error } = await fastify.supabase.from('servicios_metricas').select('*').order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar métricas' });
    return data;
  });

  fastify.post('/', {
    schema: { body: { ...bodySchema, required: ['pedido_id'] } },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase.from('servicios_metricas').insert(req.body).select().single();
    if (error) return reply.code(500).send({ error: 'Error al crear métrica' });
    return reply.code(201).send(data);
  });

  fastify.put('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: bodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase.from('servicios_metricas').update(req.body).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar métrica' });
    return reply.code(204).send();
  });
}
