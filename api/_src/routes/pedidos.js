const pedidoBodySchema = {
  type: 'object',
  properties: {
    cliente_id:            { type: ['integer', 'null'] },
    direccion_servicio_id: { type: ['integer', 'null'] },
    fecha_pedido:          { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    fecha_servicio:        { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    fecha:                 { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    estado_id:             { type: ['integer', 'null'] },
    metodo_pago_id:        { type: ['integer', 'null'] },
    descuento:             { type: 'number', minimum: 0 },
    cargo_extra:           { type: 'number', minimum: 0 },
    anticipo:              { type: 'number', minimum: 0 },
    requiere_factura:      { type: 'boolean' },
    notas_comerciales:     { type: ['string', 'null'] },
    notas_operativas:      { type: ['string', 'null'] },
    // Legacy fields
    tipo_servicio:         { type: ['string', 'null'] },
    cantidad:              { type: ['integer', 'null'] },
    total:                 { type: ['number', 'null'] },
    detalles:              { type: ['object', 'null'] },
  },
  additionalProperties: false,
};

const detalleBodySchema = {
  type: 'object',
  properties: {
    item_catalogo_id:     { type: ['integer', 'null'] },
    tipo_linea:           { type: 'string', enum: ['item', 'ajuste', 'descuento', 'cargo'] },
    descripcion:          { type: 'string' },
    cantidad:             { type: 'number', minimum: 0 },
    unidad_medida:        { type: 'string' },
    precio_unitario:      { type: 'number', minimum: 0 },
    costo_unitario:       { type: 'number', minimum: 0 },
    modelo_abanico:       { type: ['string', 'null'] },
    desinstalar_cantidad: { type: ['integer', 'null'] },
    perforacion_cantidad: { type: ['integer', 'null'] },
    ancho_m:              { type: ['number', 'null'] },
    alto_m:               { type: ['number', 'null'] },
    tela_color:           { type: ['string', 'null'] },
    sistema_instalacion:  { type: ['string', 'null'] },
    habitacion:           { type: ['string', 'null'] },
    requiere_inventario:  { type: 'boolean' },
    requiere_servicio:    { type: 'boolean' },
    notas:                { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export default async function pedidosRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);
  const mutate = fastify.requireRole(['admin', 'gestor']);

  // GET / - Listar pedidos
  fastify.get('/', async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('v_pedidos_resumen')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: 'Error al cargar pedidos' });
    return data;
  });

  // GET /:id - Obtener pedido con detalle
  fastify.get('/:id', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('pedidos')
      .select(`*, clientes(nombre, telefono), cliente_direcciones(alias, calle, numero_ext, colonia, municipio), estados_pedido(nombre), metodos_pago(nombre), pedido_detalle(*, items_catalogo(nombre, sku, precio_base)), pagos(*, metodos_pago(nombre)), servicios(*, tecnicos(nombre))`)
      .eq('id', req.params.id).single();
    if (error) return reply.code(500).send({ error: 'Error al cargar pedido' });
    return data;
  });

  // POST / - Crear pedido (acepta legacy + nuevo)
  fastify.post('/', {
    preHandler: mutate,
    schema: { body: pedidoBodySchema },
  }, async (req, reply) => {
    const body = { ...req.body };

    // Normalizar fecha: acepta 'fecha' (legacy) o 'fecha_pedido' (nuevo)
    if (!body.fecha_pedido && body.fecha) body.fecha_pedido = body.fecha;
    if (!body.fecha && body.fecha_pedido) body.fecha = body.fecha_pedido;

    // Si no hay estado_id, usar el primero disponible (pendiente)
    if (!body.estado_id) {
      const { data: estados } = await fastify.supabase
        .from('estados_pedido').select('id').order('id').limit(1);
      if (estados && estados.length) body.estado_id = estados[0].id;
    }

    const { data, error } = await fastify.supabase
      .from('pedidos').insert(body).select().single();
    if (error) {
      req.log.error({ err: error }, 'pedidos insert failed');
      return reply.code(500).send({ error: 'Error al crear pedido' });
    }
    return reply.code(201).send(data);
  });

  // PUT /:id - Actualizar pedido
  fastify.put('/:id', {
    preHandler: mutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: pedidoBodySchema,
    },
  }, async (req, reply) => {
    const body = { ...req.body };
    if (!body.fecha_pedido && body.fecha) body.fecha_pedido = body.fecha;
    if (!body.fecha && body.fecha_pedido) body.fecha = body.fecha_pedido;
    const { error } = await fastify.supabase
      .from('pedidos').update(body).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar pedido' });
    return reply.code(204).send();
  });

  // DELETE /:id - Soft delete (estado cancelado)
  fastify.delete('/:id', {
    preHandler: mutate,
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  }, async (req, reply) => {
    const { data: estadoCancelado } = await fastify.supabase
      .from('estados_pedido').select('id').eq('nombre', 'cancelado').single();
    if (!estadoCancelado) return reply.code(500).send({ error: 'No se encontró estado cancelado' });
    const { error } = await fastify.supabase
      .from('pedidos').update({ estado_id: estadoCancelado.id }).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al cancelar pedido' });
    return reply.code(204).send();
  });

  // POST /:id/detalle - Agregar línea
  fastify.post('/:id/detalle', {
    preHandler: mutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: detalleBodySchema,
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('pedido_detalle').insert({ ...req.body, pedido_id: req.params.id }).select().single();
    if (error) return reply.code(500).send({ error: 'Error al crear línea de detalle' });
    return reply.code(201).send(data);
  });

  // GET /detalle/all - Obtener TODAS las líneas (para cargar estado inicial)
  fastify.get('/detalle/all', async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('pedido_detalle')
      .select('*')
      .order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar detalle' });
    return data;
  });

  // GET /:id/detalle - Obtener detalle
  fastify.get('/:id/detalle', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('pedido_detalle')
      .select(`*, items_catalogo(id, sku, nombre, categoria_id, unidad_medida, precio_base)`)
      .eq('pedido_id', req.params.id).order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar detalle' });
    return data;
  });

  // PUT /detalle/:id - Actualizar línea
  fastify.put('/detalle/:id', {
    preHandler: mutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: detalleBodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('pedido_detalle').update(req.body).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar línea' });
    return reply.code(204).send();
  });

  // POST /:id/detalle/bulk - Reemplazar TODAS las líneas del pedido atómicamente
  fastify.post('/:id/detalle/bulk', {
    preHandler: mutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          lineas: { type: 'array', items: detalleBodySchema },
        },
        required: ['lineas'],
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const pedidoId = req.params.id;
    const lineas = (req.body.lineas || []).map(l => ({ ...l, pedido_id: pedidoId }));

    const { error: delErr } = await fastify.supabase
      .from('pedido_detalle').delete().eq('pedido_id', pedidoId);
    if (delErr) {
      req.log.error({ err: delErr }, 'bulk detalle delete failed');
      return reply.code(500).send({ error: 'Error al reemplazar detalle' });
    }
    if (!lineas.length) return reply.code(200).send([]);

    const { data, error } = await fastify.supabase
      .from('pedido_detalle').insert(lineas).select();
    if (error) {
      req.log.error({ err: error }, 'bulk detalle insert failed');
      return reply.code(500).send({ error: 'Error al insertar detalle' });
    }
    return reply.code(200).send(data);
  });

  // DELETE /detalle/:id - Eliminar línea
  fastify.delete('/detalle/:id', {
    preHandler: mutate,
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('pedido_detalle').delete().eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al eliminar línea' });
    return reply.code(204).send();
  });
}
