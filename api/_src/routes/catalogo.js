import { ROLES } from '../constants/roles.js';
import { MEASUREMENT_UNITS } from '../constants/units.js';
import { MAX_LENGTHS, QUERY_LIMITS } from '../constants/limits.js';

const itemBodySchema = {
  type: 'object',
  properties: {
    sku:                  { type: ['string', 'null'], maxLength: MAX_LENGTHS.SKU },
    nombre:               { type: 'string', minLength: 1 },
    categoria_id:         { type: 'integer' },
    tipo_persiana_id:     { type: ['integer', 'null'] },
    marca:                { type: ['string', 'null'] },
    modelo:               { type: ['string', 'null'] },
    color:                { type: ['string', 'null'] },
    unidad_medida:        { type: 'string', enum: [...MEASUREMENT_UNITS] },
    precio_base:          { type: 'number', minimum: 0 },
    costo_base:           { type: 'number', minimum: 0 },
    controla_inventario:  { type: 'boolean' },
    activo:               { type: 'boolean' },
    notas:                { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export default async function catalogoRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);
  const mutate = fastify.requireRole([ROLES.ADMIN]);

  // GET / - Listar items del catálogo
  fastify.get('/', async (req, reply) => {
    let query = fastify.supabase
      .from('items_catalogo')
      .select(`
        *,
        categorias_item (nombre),
        tipos_persiana (nombre)
      `)
      .eq('activo', true)
      .order('nombre');

    // Filtrar por categoría si se proporciona
    if (req.query.categoria_id) {
      query = query.eq('categoria_id', req.query.categoria_id);
    }

    const { data, error } = await query;
    if (error) return reply.code(500).send({ error: 'Error al cargar catálogo' });
    return data;
  });

  // GET /:id - Obtener item específico
  fastify.get('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('items_catalogo')
      .select(`
        *,
        categorias_item (nombre),
        tipos_persiana (nombre),
        inventario_existencias (
          cantidad,
          ubicaciones_inventario (nombre)
        )
      `)
      .eq('id', req.params.id)
      .single();
    if (error) return reply.code(500).send({ error: 'Error al cargar item' });
    return data;
  });

  // POST / - Crear item de catálogo
  fastify.post('/', {
    preHandler: mutate,
    schema: {
      body: {
        ...itemBodySchema,
        required: ['nombre', 'categoria_id', 'unidad_medida'],
      },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('items_catalogo')
      .insert(req.body)
      .select()
      .single();
    if (error) {
      req.log.error({ err: error }, 'items_catalogo insert failed');
      return reply.code(500).send({ error: 'Error al crear item' });
    }
    return reply.code(201).send(data);
  });

  // PUT /:id - Actualizar item
  fastify.put('/:id', {
    preHandler: mutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: itemBodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('items_catalogo')
      .update(req.body)
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar item' });
    return reply.code(204).send();
  });

  // DELETE /:id - Desactivar item (no borrar, por historial)
  fastify.delete('/:id', {
    preHandler: mutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('items_catalogo')
      .update({ activo: false })
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al desactivar item' });
    return reply.code(204).send();
  });

  // GET /categoria/:id - Obtener todos los items de una categoría
  fastify.get('/categoria/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('items_catalogo')
      .select('*')
      .eq('categoria_id', req.params.id)
      .eq('activo', true)
      .order('nombre');
    if (error) return reply.code(500).send({ error: 'Error al cargar items' });
    return data;
  });

  // GET /buscar/:query - Buscar items por nombre o SKU
  fastify.get('/buscar/:query', {
    schema: {
      params: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  }, async (req, reply) => {
    const searchTerm = `%${req.params.query}%`;
    const { data, error } = await fastify.supabase
      .from('items_catalogo')
      .select('*')
      .or(`nombre.ilike.${searchTerm},sku.ilike.${searchTerm},modelo.ilike.${searchTerm}`)
      .eq('activo', true)
      .limit(QUERY_LIMITS.SEARCH_RESULTS);
    if (error) return reply.code(500).send({ error: 'Error en búsqueda' });
    return data;
  });
}
