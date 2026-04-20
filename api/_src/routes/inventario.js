import { ROLES } from '../constants/roles.js';
import { INVENTORY_MOVEMENT_TYPES, LOCATION_TYPES } from '../constants/inventory.js';
import { QUERY_LIMITS } from '../constants/limits.js';

const existenciasSchema = {
  type: 'object',
  properties: {
    item_catalogo_id: { type: 'integer' },
    ubicacion_id:     { type: 'integer' },
    cantidad:         { type: 'number', minimum: 0 },
    costo_promedio:   { type: 'number', minimum: 0 },
  },
  additionalProperties: false,
};

const movimientoSchema = {
  type: 'object',
  properties: {
    item_catalogo_id:     { type: 'integer' },
    ubicacion_origen_id:  { type: ['integer', 'null'] },
    ubicacion_destino_id: { type: ['integer', 'null'] },
    tipo_movimiento:      { type: 'string', enum: [...INVENTORY_MOVEMENT_TYPES] },
    cantidad:             { type: 'number', minimum: 0 },
    costo_unitario:       { type: 'number', minimum: 0 },
    pedido_id:            { type: ['integer', 'null'] },
    servicio_id:          { type: ['integer', 'null'] },
    referencia:           { type: ['string', 'null'] },
    notas:                { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export default async function inventarioRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);
  const mutate = fastify.requireRole([ROLES.ADMIN, ROLES.GESTOR]);

  // GET /existencias - Listar existencias consolidadas
  fastify.get('/existencias', async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('v_inventario_consolidado')
      .select('*')
      .order('item_nombre');
    if (error) return reply.code(500).send({ error: 'Error al cargar existencias' });
    return data;
  });

  // GET /existencias/:ubicacion - Listar existencias por ubicación
  fastify.get('/existencias/:ubicacion', {
    schema: {
      params: { type: 'object', properties: { ubicacion: { type: 'integer' } }, required: ['ubicacion'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('inventario_existencias')
      .select(`
        *,
        items_catalogo (id, sku, nombre),
        ubicaciones_inventario (nombre)
      `)
      .eq('ubicacion_id', req.params.ubicacion)
      .gt('cantidad', 0);
    if (error) return reply.code(500).send({ error: 'Error al cargar existencias' });
    return data;
  });

  // POST /existencias - Crear/actualizar existencia
  fastify.post('/existencias', {
    preHandler: mutate,
    schema: { body: existenciasSchema },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('inventario_existencias')
      .upsert(req.body, { onConflict: 'item_catalogo_id,ubicacion_id' })
      .select()
      .single();
    if (error) {
      req.log.error({ err: error }, 'inventario_existencias upsert failed');
      return reply.code(500).send({ error: 'Error al actualizar existencia' });
    }
    return reply.code(201).send(data);
  });

  // GET /movimientos - Listar movimientos con filtros
  fastify.get('/movimientos', async (req, reply) => {
    let query = fastify.supabase
      .from('inventario_movimientos')
      .select(`
        *,
        items_catalogo (sku, nombre),
        ubicaciones_inventario!ubicacion_origen_id (nombre),
        ubicaciones_inventario!ubicacion_destino_id (nombre)
      `)
      .order('created_at', { ascending: false });

    // Aplicar filtros si existen
    if (req.query.item_id) query = query.eq('item_catalogo_id', req.query.item_id);
    if (req.query.ubicacion_id) query = query.or(
      `ubicacion_origen_id.eq.${req.query.ubicacion_id},ubicacion_destino_id.eq.${req.query.ubicacion_id}`
    );
    if (req.query.tipo) query = query.eq('tipo_movimiento', req.query.tipo);

    const { data, error } = await query.limit(QUERY_LIMITS.MOVIMIENTOS);
    if (error) return reply.code(500).send({ error: 'Error al cargar movimientos' });
    return data;
  });

  // POST /movimientos - Registrar movimiento
  fastify.post('/movimientos', {
    preHandler: mutate,
    schema: { body: movimientoSchema },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('inventario_movimientos')
      .insert(req.body)
      .select()
      .single();
    if (error) return reply.code(500).send({ error: 'Error al registrar movimiento' });
    return reply.code(201).send(data);
  });

  // GET /ubicaciones - Listar ubicaciones
  fastify.get('/ubicaciones', async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('ubicaciones_inventario')
      .select('*')
      .order('tipo')
      .order('nombre');
    if (error) return reply.code(500).send({ error: 'Error al cargar ubicaciones' });
    return data;
  });

  // POST /ubicaciones - Crear ubicación
  fastify.post('/ubicaciones', {
    preHandler: fastify.requireRole([ROLES.ADMIN]),
    schema: {
      body: {
        type: 'object',
        properties: {
          nombre:   { type: 'string', minLength: 1 },
          tipo:     { type: 'string', enum: [...LOCATION_TYPES] },
          direccion: { type: ['string', 'null'] },
          notas:    { type: ['string', 'null'] },
        },
        required: ['nombre'],
      },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('ubicaciones_inventario')
      .insert(req.body)
      .select()
      .single();
    if (error) return reply.code(500).send({ error: 'Error al crear ubicación' });
    return reply.code(201).send(data);
  });
}
