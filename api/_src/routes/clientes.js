const bodySchema = {
  type: 'object',
  properties: {
    nombre:      { type: 'string', minLength: 1, maxLength: 200 },
    telefono:    { type: 'string', minLength: 1, maxLength: 20 },
    telefono_alt: { type: ['string', 'null'], maxLength: 20 },
    email:       { type: ['string', 'null'] },
    notas_cliente: { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

const direccionSchema = {
  type: 'object',
  properties: {
    alias:              { type: ['string', 'null'] },
    contacto_recibe:    { type: ['string', 'null'] },
    telefono_contacto:  { type: ['string', 'null'] },
    calle:              { type: ['string', 'null'] },
    numero_ext:         { type: ['string', 'null'] },
    numero_int:         { type: ['string', 'null'] },
    colonia:            { type: ['string', 'null'] },
    municipio:          { type: 'string', maxLength: 100 },
    estado_mx:          { type: ['string', 'null'] },
    codigo_postal:      { type: ['string', 'null'] },
    referencias:        { type: ['string', 'null'] },
    google_maps_url:    { type: ['string', 'null'] },
    lat:                { type: ['number', 'null'] },
    lng:                { type: ['number', 'null'] },
    es_principal:       { type: 'boolean' },
  },
  additionalProperties: false,
};

export default async function clientesRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  // GET / - Listar clientes con sus direcciones principales
  fastify.get('/', async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('clientes')
      .select(`
        *,
        cliente_direcciones (
          id, alias, calle, numero_ext, colonia, municipio,
          google_maps_url, lat, lng, es_principal
        )
      `)
      .order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar clientes' });
    return data;
  });

  // GET /:id - Obtener cliente con todas sus direcciones
  fastify.get('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('clientes')
      .select(`
        *,
        cliente_direcciones (*)
      `)
      .eq('id', req.params.id)
      .single();
    if (error) return reply.code(500).send({ error: 'Error al cargar cliente' });
    return data;
  });

  // POST / - Crear cliente con dirección inicial
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        properties: {
          cliente: bodySchema,
          direccion: direccionSchema,
        },
        required: ['cliente', 'direccion'],
      },
    },
  }, async (req, reply) => {
    const { cliente, direccion } = req.body;

    // Crear cliente
    const { data: clienteData, error: clienteError } = await fastify.supabase
      .from('clientes')
      .insert(cliente)
      .select()
      .single();

    if (clienteError) return reply.code(500).send({ error: 'Error al crear cliente' });

    // Crear dirección inicial
    const { data: direccionData, error: direccionError } = await fastify.supabase
      .from('cliente_direcciones')
      .insert({ ...direccion, cliente_id: clienteData.id, es_principal: true })
      .select()
      .single();

    if (direccionError) {
      // Si falla la dirección, intentar eliminar el cliente
      await fastify.supabase.from('clientes').delete().eq('id', clienteData.id);
      return reply.code(500).send({ error: 'Error al crear dirección' });
    }

    return reply.code(201).send({ ...clienteData, cliente_direcciones: [direccionData] });
  });

  // PUT /:id - Actualizar cliente
  fastify.put('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: bodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('clientes')
      .update(req.body)
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar cliente' });
    return reply.code(204).send();
  });

  // DELETE /:id - Eliminar cliente (blanda si tiene pedidos)
  fastify.delete('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    // Verificar si tiene pedidos
    const { data: pedidos } = await fastify.supabase
      .from('pedidos')
      .select('id')
      .eq('cliente_id', req.params.id)
      .limit(1);

    if (pedidos && pedidos.length > 0) {
      return reply.code(400).send({ error: 'No se puede eliminar cliente con pedidos' });
    }

    const { error } = await fastify.supabase
      .from('clientes')
      .delete()
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al eliminar cliente' });
    return reply.code(204).send();
  });

  // POST /:id/direcciones - Agregar dirección a cliente
  fastify.post('/:id/direcciones', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: direccionSchema,
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('cliente_direcciones')
      .insert({ ...req.body, cliente_id: req.params.id })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: 'Error al crear dirección' });
    return reply.code(201).send(data);
  });

  // GET /:id/direcciones - Obtener direcciones de cliente
  fastify.get('/:id/direcciones', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('cliente_direcciones')
      .select('*')
      .eq('cliente_id', req.params.id)
      .order('es_principal', { ascending: false })
      .order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar direcciones' });
    return data;
  });
}
