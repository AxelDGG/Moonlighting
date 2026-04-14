const pedidoBodySchema = {
  type: 'object',
  properties: {
    cliente_id:           { type: 'integer' },
    direccion_servicio_id: { type: ['integer', 'null'] },
    fecha_pedido:         { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    fecha_servicio:       { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    estado_id:            { type: 'integer' },
    metodo_pago_id:       { type: ['integer', 'null'] },
    descuento:            { type: 'number', minimum: 0 },
    cargo_extra:          { type: 'number', minimum: 0 },
    anticipo:             { type: 'number', minimum: 0 },
    requiere_factura:     { type: 'boolean' },
    notas_comerciales:    { type: ['string', 'null'] },
    notas_operativas:     { type: ['string', 'null'] },
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
    // Abanicos
    modelo_abanico:       { type: ['string', 'null'] },
    desinstalar_cantidad: { type: ['integer', 'null'] },
    perforacion_cantidad: { type: ['integer', 'null'] },
    // Persianas
    ancho_m:              { type: ['number', 'null'] },
    alto_m:               { type: ['number', 'null'] },
    tela_color:           { type: ['string', 'null'] },
    sistema_instalacion:  { type: ['string', 'null'] },
    habitacion:           { type: ['string', 'null'] },
    // Operacional
    requiere_inventario:  { type: 'boolean' },
    requiere_servicio:    { type: 'boolean' },
    notas:                { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export default async function pedidosRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  // GET / - Listar pedidos con resumen
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
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('pedidos')
      .select(`
        *,
        clientes (nombre, telefono),
        cliente_direcciones (alias, calle, numero_ext, colonia, municipio),
        estados_pedido (nombre),
        metodos_pago (nombre),
        pedido_detalle (
          *,
          items_catalogo (nombre, sku, precio_base)
        ),
        pagos (
          *,
          metodos_pago (nombre)
        ),
        servicios (
          *,
          tecnicos (nombre)
        )
      `)
      .eq('id', req.params.id)
      .single();
    if (error) return reply.code(500).send({ error: 'Error al cargar pedido' });
    return data;
  });

  // POST / - Crear pedido
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        properties: {
          ...pedidoBodySchema.properties,
        },
        required: ['cliente_id', 'fecha_pedido', 'estado_id'],
      },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('pedidos')
      .insert(req.body)
      .select()
      .single();
    if (error) return reply.code(500).send({ error: 'Error al crear pedido', details: error.message });
    return reply.code(201).send(data);
  });

  // PUT /:id - Actualizar pedido
  fastify.put('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: pedidoBodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('pedidos')
      .update(req.body)
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar pedido' });
    return reply.code(204).send();
  });

  // DELETE /:id - Cambiar estado a cancelado (soft delete)
  fastify.delete('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    // Obtener el ID de estado "cancelado"
    const { data: estadoCancelado } = await fastify.supabase
      .from('estados_pedido')
      .select('id')
      .eq('nombre', 'cancelado')
      .single();

    if (!estadoCancelado) {
      return reply.code(500).send({ error: 'No se encontró estado cancelado' });
    }

    const { error } = await fastify.supabase
      .from('pedidos')
      .update({ estado_id: estadoCancelado.id })
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al cancelar pedido' });
    return reply.code(204).send();
  });

  // POST /:id/detalle - Agregar línea de detalle
  fastify.post('/:id/detalle', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: detalleBodySchema,
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('pedido_detalle')
      .insert({ ...req.body, pedido_id: req.params.id })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: 'Error al crear línea de detalle' });
    return reply.code(201).send(data);
  });

  // GET /:id/detalle - Obtener detalle de pedido
  fastify.get('/:id/detalle', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('pedido_detalle')
      .select(`
        *,
        items_catalogo (id, sku, nombre, categoria_id, unidad_medida, precio_base)
      `)
      .eq('pedido_id', req.params.id)
      .order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar detalle' });
    return data;
  });

  // PUT /detalle/:id - Actualizar línea de detalle
  fastify.put('/detalle/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: detalleBodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('pedido_detalle')
      .update(req.body)
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar línea' });
    return reply.code(204).send();
  });

  // DELETE /detalle/:id - Eliminar línea de detalle
  fastify.delete('/detalle/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('pedido_detalle')
      .delete()
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al eliminar línea' });
    return reply.code(204).send();
  });
}
