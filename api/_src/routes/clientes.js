const bodySchemaNew = {
  type: 'object',
  properties: {
    nombre:       { type: 'string', minLength: 1, maxLength: 200 },
    telefono:     { type: ['string', 'null'], maxLength: 20 },
    telefono_alt: { type: ['string', 'null'], maxLength: 20 },
    email:        { type: ['string', 'null'] },
    notas_cliente:{ type: ['string', 'null'] },
  },
};

const direccionSchema = {
  type: 'object',
  properties: {
    alias:             { type: ['string', 'null'] },
    contacto_recibe:   { type: ['string', 'null'] },
    telefono_contacto: { type: ['string', 'null'] },
    calle:             { type: ['string', 'null'] },
    numero_ext:        { type: ['string', 'null'] },
    numero_int:        { type: ['string', 'null'] },
    colonia:           { type: ['string', 'null'] },
    municipio:         { type: 'string', maxLength: 100 },
    estado_mx:         { type: ['string', 'null'] },
    codigo_postal:     { type: ['string', 'null'] },
    referencias:       { type: ['string', 'null'] },
    google_maps_url:   { type: ['string', 'null'] },
    lat:               { type: ['number', 'null'] },
    lng:               { type: ['number', 'null'] },
    es_principal:      { type: 'boolean' },
  },
  additionalProperties: false,
};

export default async function clientesRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  // GET / - Listar clientes (activos por defecto; ?include_inactive=true para ver todos)
  fastify.get('/', async (req, reply) => {
    let query = fastify.supabase
      .from('clientes')
      .select(`*, cliente_direcciones(id, alias, calle, numero_ext, colonia, municipio, google_maps_url, lat, lng, es_principal)`)
      .order('id');
    if (req.query.include_inactive !== 'true') {
      query = query.eq('activo', true);
    }
    const { data, error } = await query;
    if (error) return reply.code(500).send({ error: 'Error al cargar clientes' });
    return data;
  });

  // GET /:id - Obtener cliente con direcciones
  fastify.get('/:id', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('clientes').select(`*, cliente_direcciones(*)`)
      .eq('id', req.params.id).single();
    if (error) return reply.code(500).send({ error: 'Error al cargar cliente' });
    return data;
  });

  // POST / - Crear cliente (acepta formato legacy plano O nuevo anidado)
  fastify.post('/', async (req, reply) => {
    const body = req.body || {};

    // Formato legacy: { nombre, numero, direccion, municipio, lat, lng, metodo_pago, ... }
    if (!body.cliente) {
      const clienteRow = {
        nombre:       body.nombre,
        telefono:     body.telefono || body.numero || null,
        numero:       body.numero   || body.telefono || null,
        direccion:    body.direccion || null,
        municipio:    body.municipio || 'Desconocido',
        lat:          body.lat  || null,
        lng:          body.lng  || null,
        metodo_pago:  body.metodo_pago || 'Efectivo',
        num_pedido:   body.num_pedido  || null,
        google_maps_url: body.google_maps_url || null,
        codigo_postal:   body.codigo_postal   || null,
        zona:            body.zona            || null,
      };
      const { data, error } = await fastify.supabase
        .from('clientes').insert(clienteRow).select().single();
      if (error) return reply.code(500).send({ error: 'Error al crear cliente', details: error.message });
      return reply.code(201).send(data);
    }

    // Formato nuevo: { cliente: {...}, direccion: {...} }
    const { cliente, direccion } = body;
    const { data: clienteData, error: clienteError } = await fastify.supabase
      .from('clientes').insert(cliente).select().single();
    if (clienteError) return reply.code(500).send({ error: 'Error al crear cliente' });

    if (direccion) {
      const { data: dirData, error: dirError } = await fastify.supabase
        .from('cliente_direcciones')
        .insert({ ...direccion, cliente_id: clienteData.id, es_principal: true })
        .select().single();
      if (dirError) {
        await fastify.supabase.from('clientes').delete().eq('id', clienteData.id);
        return reply.code(500).send({ error: 'Error al crear dirección' });
      }
      return reply.code(201).send({ ...clienteData, cliente_direcciones: [dirData] });
    }
    return reply.code(201).send(clienteData);
  });

  // PUT /:id - Actualizar cliente (acepta legacy + nuevo)
  fastify.put('/:id', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  }, async (req, reply) => {
    const body = req.body || {};
    // Mapear campos legacy si vienen
    const row = {
      nombre:      body.nombre      || undefined,
      telefono:    body.telefono    || body.numero    || undefined,
      numero:      body.numero      || body.telefono  || undefined,
      direccion:   body.direccion   !== undefined ? body.direccion   : undefined,
      municipio:   body.municipio   !== undefined ? body.municipio   : undefined,
      lat:         body.lat         !== undefined ? body.lat         : undefined,
      lng:         body.lng         !== undefined ? body.lng         : undefined,
      metodo_pago: body.metodo_pago !== undefined ? body.metodo_pago : undefined,
      num_pedido:  body.num_pedido  !== undefined ? body.num_pedido  : undefined,
      telefono_alt:body.telefono_alt !== undefined ? body.telefono_alt : undefined,
      email:       body.email       !== undefined ? body.email       : undefined,
      notas_cliente: body.notas_cliente !== undefined ? body.notas_cliente : undefined,
      google_maps_url: body.google_maps_url !== undefined ? body.google_maps_url : undefined,
      codigo_postal:   body.codigo_postal   !== undefined ? body.codigo_postal   : undefined,
      zona:            body.zona            !== undefined ? body.zona            : undefined,
      activo:          body.activo          !== undefined ? body.activo          : undefined,
    };
    // Remove undefined keys
    Object.keys(row).forEach(k => row[k] === undefined && delete row[k]);
    const { error } = await fastify.supabase
      .from('clientes').update(row).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar cliente' });
    return reply.code(204).send();
  });

  // DELETE /:id - Soft delete (activo = false)
  fastify.delete('/:id', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  }, async (req, reply) => {
    const clienteId = req.params.id;
    const { error } = await fastify.supabase.from('clientes').update({ activo: false }).eq('id', clienteId);
    if (error) return reply.code(500).send({ error: 'Error al eliminar cliente' });
    return reply.code(204).send();
  });

  // POST /:id/direcciones - Agregar dirección
  fastify.post('/:id/direcciones', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: direccionSchema,
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('cliente_direcciones').insert({ ...req.body, cliente_id: req.params.id }).select().single();
    if (error) return reply.code(500).send({ error: 'Error al crear dirección' });
    return reply.code(201).send(data);
  });

  // GET /:id/direcciones - Listar direcciones
  fastify.get('/:id/direcciones', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('cliente_direcciones').select('*').eq('cliente_id', req.params.id)
      .order('es_principal', { ascending: false }).order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar direcciones' });
    return data;
  });
}
