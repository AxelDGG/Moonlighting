const pagoBodySchema = {
  type: 'object',
  properties: {
    pedido_id:      { type: 'integer' },
    fecha_pago:     { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}' }, // ISO 8601
    metodo_pago_id: { type: 'integer' },
    monto:          { type: 'number', minimum: 0 },
    referencia:     { type: ['string', 'null'] },
    comprobante_url: { type: ['string', 'null'] },
    recibido_por:   { type: ['string', 'null'] },
    notas:          { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export default async function pagosRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  // GET /pedido/:pedido_id - Obtener pagos de un pedido
  fastify.get('/pedido/:pedido_id', {
    schema: {
      params: { type: 'object', properties: { pedido_id: { type: 'integer' } }, required: ['pedido_id'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('pagos')
      .select(`
        *,
        metodos_pago (nombre)
      `)
      .eq('pedido_id', req.params.pedido_id)
      .order('fecha_pago', { ascending: false });
    if (error) return reply.code(500).send({ error: 'Error al cargar pagos' });

    // Calcular total pagado
    const totalPagado = data.reduce((sum, pago) => sum + (pago.monto || 0), 0);

    return { pagos: data, total_pagado: totalPagado };
  });

  // GET / - Listar todos los pagos (con filtros opcionales)
  fastify.get('/', async (req, reply) => {
    let query = fastify.supabase
      .from('pagos')
      .select(`
        *,
        pedidos (folio, cliente_id),
        metodos_pago (nombre)
      `)
      .order('fecha_pago', { ascending: false });

    // Aplicar filtros si existen
    if (req.query.metodo_pago_id) {
      query = query.eq('metodo_pago_id', req.query.metodo_pago_id);
    }
    if (req.query.desde) {
      query = query.gte('fecha_pago', req.query.desde);
    }
    if (req.query.hasta) {
      query = query.lte('fecha_pago', req.query.hasta);
    }

    const { data, error } = await query.limit(200);
    if (error) return reply.code(500).send({ error: 'Error al cargar pagos' });
    return data;
  });

  // POST / - Registrar pago
  fastify.post('/', {
    schema: {
      body: {
        ...pagoBodySchema,
        required: ['pedido_id', 'metodo_pago_id', 'monto'],
      },
    },
  }, async (req, reply) => {
    // Obtener pedido actual para calcular nuevo saldo
    const { data: pedido } = await fastify.supabase
      .from('pedidos')
      .select('total, anticipo')
      .eq('id', req.body.pedido_id)
      .single();

    if (!pedido) {
      return reply.code(404).send({ error: 'Pedido no encontrado' });
    }

    // Crear pago
    const { data: pagoData, error: pagoError } = await fastify.supabase
      .from('pagos')
      .insert(req.body)
      .select()
      .single();

    if (pagoError) {
      return reply.code(500).send({ error: 'Error al registrar pago', details: pagoError.message });
    }

    // Recalcular saldo del pedido
    const { data: pagosActuales } = await fastify.supabase
      .from('pagos')
      .select('monto')
      .eq('pedido_id', req.body.pedido_id);

    const totalPagado = pagosActuales.reduce((sum, p) => sum + (p.monto || 0), 0);
    const nuevoSaldo = pedido.total - totalPagado;

    // Actualizar pedido con nuevo saldo
    await fastify.supabase
      .from('pedidos')
      .update({ anticipo: totalPagado, saldo: Math.max(0, nuevoSaldo) })
      .eq('id', req.body.pedido_id);

    return reply.code(201).send(pagoData);
  });

  // PUT /:id - Actualizar pago
  fastify.put('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: pagoBodySchema,
    },
  }, async (req, reply) => {
    // Obtener pago actual para conocer el pedido
    const { data: pagoAnterior } = await fastify.supabase
      .from('pagos')
      .select('pedido_id, monto')
      .eq('id', req.params.id)
      .single();

    if (!pagoAnterior) {
      return reply.code(404).send({ error: 'Pago no encontrado' });
    }

    // Actualizar pago
    const { error } = await fastify.supabase
      .from('pagos')
      .update(req.body)
      .eq('id', req.params.id);

    if (error) {
      return reply.code(500).send({ error: 'Error al actualizar pago' });
    }

    // Recalcular saldo del pedido
    const { data: pedido } = await fastify.supabase
      .from('pedidos')
      .select('total')
      .eq('id', pagoAnterior.pedido_id || req.body.pedido_id)
      .single();

    const { data: pagosActuales } = await fastify.supabase
      .from('pagos')
      .select('monto')
      .eq('pedido_id', pagoAnterior.pedido_id || req.body.pedido_id);

    const totalPagado = pagosActuales.reduce((sum, p) => sum + (p.monto || 0), 0);
    const nuevoSaldo = (pedido?.total || 0) - totalPagado;

    await fastify.supabase
      .from('pedidos')
      .update({ anticipo: totalPagado, saldo: Math.max(0, nuevoSaldo) })
      .eq('id', pagoAnterior.pedido_id || req.body.pedido_id);

    return reply.code(204).send();
  });

  // DELETE /:id - Eliminar pago
  fastify.delete('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    // Obtener pago para conocer el pedido
    const { data: pago } = await fastify.supabase
      .from('pagos')
      .select('pedido_id')
      .eq('id', req.params.id)
      .single();

    if (!pago) {
      return reply.code(404).send({ error: 'Pago no encontrado' });
    }

    // Eliminar pago
    const { error } = await fastify.supabase
      .from('pagos')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      return reply.code(500).send({ error: 'Error al eliminar pago' });
    }

    // Recalcular saldo del pedido
    const { data: pedido } = await fastify.supabase
      .from('pedidos')
      .select('total')
      .eq('id', pago.pedido_id)
      .single();

    const { data: pagosActuales } = await fastify.supabase
      .from('pagos')
      .select('monto')
      .eq('pedido_id', pago.pedido_id);

    const totalPagado = pagosActuales.reduce((sum, p) => sum + (p.monto || 0), 0);
    const nuevoSaldo = (pedido?.total || 0) - totalPagado;

    await fastify.supabase
      .from('pedidos')
      .update({ anticipo: totalPagado, saldo: Math.max(0, nuevoSaldo) })
      .eq('id', pago.pedido_id);

    return reply.code(204).send();
  });
}
