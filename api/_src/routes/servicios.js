import { ROLES } from '../constants/roles.js';
import {
  SERVICE_STATES,
  ALL_SERVICE_STATES,
  ACTIVE_SERVICE_STATES,
} from '../constants/service-states.js';
import { SERVICE_CATEGORIES } from '../constants/service-types.js';

const servicioBodySchema = {
  type: 'object',
  properties: {
    pedido_id:        { type: 'integer' },
    pedido_detalle_id: { type: ['integer', 'null'] },
    tipo_servicio:    { type: 'string', enum: [...SERVICE_CATEGORIES] },
    fecha_servicio:   { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    hora_programada:  { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$' },
    hora_llegada:     { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$' },
    hora_inicio:      { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$' },
    hora_fin:         { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$' },
    tecnico_id:       { type: ['integer', 'null'] },
    tecnico_apoyo_id: { type: ['integer', 'null'] },
    ruta_num:         { type: ['integer', 'null'] },
    estado:           { type: 'string', enum: [...ALL_SERVICE_STATES] },
    motivo_cancelacion: { type: ['string', 'null'] },
    motivo_retraso:   { type: ['string', 'null'] },
    evidencia_url:    { type: ['string', 'null'] },
    observaciones:    { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export default async function serviciosRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);
  const mutate = fastify.requireRole([ROLES.ADMIN, ROLES.GESTOR]);
  const tecnicoOwnedMutate = async (req, reply) => {
    const role = req.profile?.role;
    if (role === ROLES.ADMIN || role === ROLES.GESTOR) return;
    if (role !== ROLES.TECNICO) return reply.code(403).send({ error: 'Sin acceso' });
    const tecnicoId = req.profile?.tecnico_id;
    if (!tecnicoId) return reply.code(403).send({ error: 'Sin acceso' });
    const id = req.params?.id;
    if (!id) return reply.code(403).send({ error: 'Sin acceso' });
    const { data } = await fastify.supabase
      .from('servicios').select('tecnico_id, tecnico_apoyo_id').eq('id', id).single();
    if (!data || (data.tecnico_id !== tecnicoId && data.tecnico_apoyo_id !== tecnicoId)) {
      return reply.code(403).send({ error: 'Sin acceso' });
    }
  };

  // GET / - Listar servicios con resumen
  fastify.get('/', async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('v_servicios_resumen')
      .select('*')
      .order('fecha_servicio', { ascending: false });
    if (error) return reply.code(500).send({ error: 'Error al cargar servicios' });
    return data;
  });

  // GET /:id - Obtener servicio con detalles
  fastify.get('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('servicios')
      .select(`
        *,
        pedidos (folio, cliente_id),
        pedido_detalle (descripcion, cantidad, unidad_medida),
        tecnicos!tecnico_id (nombre, telefono),
        tecnicos!tecnico_apoyo_id (nombre, telefono)
      `)
      .eq('id', req.params.id)
      .single();
    if (error) return reply.code(500).send({ error: 'Error al cargar servicio' });
    return data;
  });

  // POST / - Crear servicio
  fastify.post('/', {
    preHandler: mutate,
    schema: {
      body: {
        ...servicioBodySchema,
        required: ['pedido_id', 'tipo_servicio', 'fecha_servicio', 'estado'],
      },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('servicios')
      .insert(req.body)
      .select()
      .single();
    if (error) {
      req.log.error({ err: error }, 'servicios insert failed');
      return reply.code(500).send({ error: 'Error al crear servicio' });
    }
    return reply.code(201).send(data);
  });

  // PUT /:id - Actualizar servicio
  fastify.put('/:id', {
    preHandler: tecnicoOwnedMutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: servicioBodySchema,
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('servicios')
      .update(req.body)
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar servicio' });
    return reply.code(204).send();
  });

  // DELETE /:id - Cambiar estado a cancelado
  fastify.delete('/:id', {
    preHandler: mutate,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('servicios')
      .update({ estado: SERVICE_STATES.CANCELADO })
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al cancelar servicio' });
    return reply.code(204).send();
  });

  // GET /fecha/:fecha - Obtener servicios por fecha
  fastify.get('/fecha/:fecha', {
    schema: {
      params: { type: 'object', properties: { fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }, required: ['fecha'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('servicios')
      .select(`
        *,
        pedidos (folio),
        tecnicos!tecnico_id (nombre),
        tecnicos!tecnico_apoyo_id (nombre)
      `)
      .eq('fecha_servicio', req.params.fecha)
      .order('hora_programada', { ascending: true });
    if (error) return reply.code(500).send({ error: 'Error al cargar servicios' });
    return data;
  });

  // GET /tecnico/:tecnico_id - Obtener servicios asignados a técnico
  fastify.get('/tecnico/:tecnico_id', {
    schema: {
      params: { type: 'object', properties: { tecnico_id: { type: 'integer' } }, required: ['tecnico_id'] },
    },
  }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('servicios')
      .select(`
        *,
        pedidos (folio),
        tecnicos!tecnico_id (nombre)
      `)
      .or(`tecnico_id.eq.${req.params.tecnico_id},tecnico_apoyo_id.eq.${req.params.tecnico_id}`)
      .in('estado', [...ACTIVE_SERVICE_STATES, SERVICE_STATES.ATRASADO])
      .order('fecha_servicio', { ascending: true });
    if (error) return reply.code(500).send({ error: 'Error al cargar servicios' });
    return data;
  });
}
