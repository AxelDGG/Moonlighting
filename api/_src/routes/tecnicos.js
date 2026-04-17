const tecnicoBodySchema = {
  type: 'object',
  properties: {
    nombre:                { type: 'string', minLength: 1 },
    telefono:              { type: ['string', 'null'], maxLength: 20 },
    activo:                { type: 'boolean' },
    tipo_colaborador:      { type: ['string', 'null'], enum: ['interno', 'externo', 'especialista', null] },
    porcentaje_instalacion: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    porcentaje_mantenimiento: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    notas:                 { type: ['string', 'null'] },
    vehiculo:              { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export default async function tecnicosRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  // GET / - Listar técnicos activos
  fastify.get('/', async (req, reply) => {
    let query = fastify.supabase
      .from('tecnicos')
      .select('*')
      .order('nombre');

    // Opción de incluir inactivos
    if (req.query.incluir_inactivos !== 'true') {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;
    if (error) return reply.code(500).send({ error: 'Error al cargar técnicos' });
    return data;
  });

  // GET /:id - Obtener técnico con historial de servicios
  fastify.get('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('tecnicos')
      .select(`
        *,
        servicios_tecnico: servicios(id, fecha_servicio, estado, pedido_id)
      `)
      .eq('id', req.params.id)
      .single();
    if (error) return reply.code(500).send({ error: 'Error al cargar técnico' });
    return data;
  });

  // POST / - Crear técnico
  fastify.post('/', {
    schema: {
      body: {
        ...tecnicoBodySchema,
        required: ['nombre'],
      },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('tecnicos')
      .insert(req.body)
      .select()
      .single();
    if (error) return reply.code(500).send({ error: 'Error al crear técnico', details: error.message });
    return reply.code(201).send(data);
  });

  // PUT /:id - Actualizar técnico
  fastify.put('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: tecnicoBodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('tecnicos')
      .update(req.body)
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar técnico' });
    return reply.code(204).send();
  });

  // DELETE /:id - Desactivar técnico (no borrar)
  fastify.delete('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('tecnicos')
      .update({ activo: false })
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al desactivar técnico' });
    return reply.code(204).send();
  });

  // GET /disponibles/:fecha - Obtener técnicos sin servicios en una fecha
  fastify.get('/disponibles/:fecha', {
    schema: {
      params: { type: 'object', properties: { fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }, required: ['fecha'] },
    },
  }, async (req, reply) => {
    // Obtener todos los técnicos activos
    const { data: todosTecnicos } = await fastify.supabase
      .from('tecnicos')
      .select('id, nombre, telefono')
      .eq('activo', true);

    // Obtener técnicos con servicios esa fecha
    const { data: ocupados } = await fastify.supabase
      .from('servicios')
      .select('tecnico_id')
      .eq('fecha_servicio', req.params.fecha)
      .in('estado', ['programado', 'en_ruta', 'en_proceso']);

    const ocupadosIds = new Set(ocupados.map(s => s.tecnico_id).filter(Boolean));
    const disponibles = todosTecnicos.filter(t => !ocupadosIds.has(t.id));

    return disponibles;
  });

  // GET /carga/:fecha - Obtener carga de trabajo de técnicos para una fecha
  fastify.get('/carga/:fecha', {
    schema: {
      params: { type: 'object', properties: { fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }, required: ['fecha'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('servicios')
      .select(`
        tecnico_id,
        tecnicos (nombre),
        id
      `)
      .eq('fecha_servicio', req.params.fecha)
      .in('estado', ['programado', 'en_ruta', 'en_proceso']);

    if (error) return reply.code(500).send({ error: 'Error al cargar información' });

    // Agrupar por técnico
    const carga = {};
    data.forEach(s => {
      const tecnicoId = s.tecnico_id;
      if (!carga[tecnicoId]) {
        carga[tecnicoId] = {
          tecnico_id: tecnicoId,
          nombre: s.tecnicos?.nombre,
          cantidad_servicios: 0,
        };
      }
      carga[tecnicoId].cantidad_servicios++;
    });

    return Object.values(carga);
  });
}
