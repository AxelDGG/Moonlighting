export default async function calendarRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  // POST /api/calendar/sync/:pedidoId — crea o actualiza evento en Outlook Calendar
  fastify.post('/sync/:pedidoId', {
    schema: {
      params: {
        type:       'object',
        properties: { pedidoId: { type: 'integer' } },
        required:   ['pedidoId'],
      },
    },
  }, async (req, reply) => {
    if (!fastify.msGraph) {
      return reply.code(503).send({ error: 'Integración con Outlook no configurada' });
    }

    const { pedidoId } = req.params;

    const { data: pedido, error: pErr } = await fastify.supabase
      .from('pedidos').select('*').eq('id', pedidoId).single();
    if (pErr || !pedido) return reply.code(404).send({ error: 'Pedido no encontrado' });

    const { data: metrica } = await fastify.supabase
      .from('servicios_metricas').select('*').eq('pedido_id', pedidoId).single();

    const cliente = pedido.cliente_id
      ? (await fastify.supabase.from('clientes').select('*').eq('id', pedido.cliente_id).single()).data
      : null;

    const { data: lineas } = await fastify.supabase
      .from('pedido_detalle').select('*').eq('pedido_id', pedidoId);

    try {
      const payload         = await fastify.msGraph.buildEventPayload(pedido, metrica, cliente, lineas || []);
      const existingEventId = pedido.detalles?.outlook_event_id;

      let eventId;
      if (existingEventId) {
        await fastify.msGraph.updateEvent(existingEventId, payload);
        eventId = existingEventId;
      } else {
        const event = await fastify.msGraph.createEvent(payload);
        eventId     = event.id;
        await fastify.supabase
          .from('pedidos')
          .update({ detalles: { ...(pedido.detalles || {}), outlook_event_id: eventId } })
          .eq('id', pedidoId);
      }

      return reply.send({ ok: true, eventId });
    } catch (err) {
      req.log.error({ err }, 'Outlook sync failed');
      return reply.code(500).send({ error: err.message });
    }
  });
}
