import { ROLES, ALL_ROLES } from '../constants/roles.js';
import {
  ALL_SERVICE_STATES,
  normalizeServiceState,
} from '../constants/service-states.js';
import { MAX_LENGTHS } from '../constants/limits.js';

const bodySchema = {
  type: 'object',
  properties: {
    pedido_id:           { type: 'integer' },
    tecnico:             { type: ['string', 'null'], maxLength: MAX_LENGTHS.TECNICO_NAME },
    hora_programada:     { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$', maxLength: 5 },
    hora_llegada:        { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$', maxLength: 5 },
    hora_inicio:         { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$', maxLength: 5 },
    hora_fin:            { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$', maxLength: 5 },
    zona:                { type: ['string', 'null'], maxLength: MAX_LENGTHS.ZONA_NAME },
    orden_ruta:          { type: ['integer', 'null'] },
    estado:              { type: 'string', enum: [...ALL_SERVICE_STATES] },
    retraso_min:         { type: ['integer', 'null'] },
    motivo_retraso:      { type: ['string', 'null'], maxLength: MAX_LENGTHS.MOTIVO },
    motivo_cancelacion:  { type: ['string', 'null'], maxLength: MAX_LENGTHS.MOTIVO },
    dia_semana:          { type: ['string', 'null'], maxLength: MAX_LENGTHS.DIA_SEMANA },
    es_fecha_especial:   { type: 'boolean' },
    nota_fecha_especial: { type: ['string', 'null'], maxLength: MAX_LENGTHS.NOTA },
  },
  additionalProperties: false,
};

export default async function metricasRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);
  const mutate = fastify.requireRole([...ALL_ROLES]);

  // Si el usuario es técnico, solo puede modificar métricas donde el nombre del
  // técnico asignado coincide con el suyo (desde user_profiles.tecnico_id → tecnicos.nombre).
  async function enforceTecnicoOwnership(req, reply) {
    const role = req.profile?.role;
    if (role === ROLES.ADMIN || role === ROLES.GESTOR) return;
    if (role !== ROLES.TECNICO) return reply.code(403).send({ error: 'Sin acceso' });

    const tecnicoId = req.profile?.tecnico_id;
    if (!tecnicoId) return reply.code(403).send({ error: 'Sin acceso' });

    const { data: tec } = await fastify.supabase
      .from('tecnicos').select('nombre').eq('id', tecnicoId).single();
    const miNombre = tec?.nombre;
    if (!miNombre) return reply.code(403).send({ error: 'Sin acceso' });

    if (req.method === 'POST') {
      if (req.body?.tecnico && req.body.tecnico !== miNombre) {
        return reply.code(403).send({ error: 'Sin acceso' });
      }
      return;
    }
    if (req.params?.id) {
      const { data: sm } = await fastify.supabase
        .from('servicios_metricas').select('tecnico').eq('id', req.params.id).single();
      if (!sm || (sm.tecnico && sm.tecnico !== miNombre)) {
        return reply.code(403).send({ error: 'Sin acceso' });
      }
    }
  }

  fastify.get('/', async (req, reply) => {
    const { data, error } = await fastify.supabase.from('servicios_metricas').select('*').order('id');
    if (error) return reply.code(500).send({ error: 'Error al cargar métricas' });
    return data;
  });

  fastify.post('/', {
    preHandler: [mutate, enforceTecnicoOwnership],
    schema: { body: { ...bodySchema, required: ['pedido_id'] } },
  }, async (req, reply) => {
    const body = { ...req.body };
    if (body.estado) body.estado = normalizeServiceState(body.estado);
    const { data, error } = await fastify.supabase.from('servicios_metricas').insert(body).select().single();
    if (error) return reply.code(500).send({ error: 'Error al crear métrica' });
    return reply.code(201).send(data);
  });

  fastify.put('/:id', {
    preHandler: [mutate, enforceTecnicoOwnership],
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      body: bodySchema,
    },
  }, async (req, reply) => {
    const body = { ...req.body };
    if (body.estado) body.estado = normalizeServiceState(body.estado);
    const { error } = await fastify.supabase.from('servicios_metricas').update(body).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar métrica' });
    return reply.code(204).send();
  });
}
