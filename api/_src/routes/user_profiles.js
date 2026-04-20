import { ROLES, ALL_ROLES } from '../constants/roles.js';
import { defaultPermissionsFor } from '../constants/permissions.js';
import { SUPABASE_ERROR } from '../constants/http.js';

const { ADMIN_EMAILS: ADMIN_EMAILS_ENV } = process.env;
const ADMIN_EMAILS = (ADMIN_EMAILS_ENV || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const permissionsSchema = {
  type: 'object',
  properties: {
    ver_metricas:    { type: 'boolean' },
    ver_dashboard:   { type: 'boolean' },
    crear_tecnicos:  { type: 'boolean' },
    ver_porcentajes: { type: 'boolean' },
    ver_almacen:     { type: 'boolean' },
    ver_calendario:  { type: 'boolean' },
    ver_mapa:        { type: 'boolean' },
  },
  additionalProperties: true,
};

export default async function userProfilesRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  // GET /me - Obtener perfil propio (crea uno si no existe)
  fastify.get('/me', async (req, reply) => {
    const userId = req.user.id;
    const userEmail = req.user.email;

    let { data, error } = await fastify.supabase
      .from('user_profiles').select('*').eq('id', userId).single();

    if (error && error.code === SUPABASE_ERROR.NOT_FOUND) {
      const role = ADMIN_EMAILS.includes((userEmail || '').toLowerCase()) ? ROLES.ADMIN : ROLES.GESTOR;
      const defaultPerms = defaultPermissionsFor(role);
      const { data: created, error: createErr } = await fastify.supabase
        .from('user_profiles').insert({ id: userId, email: userEmail, role, permissions: defaultPerms })
        .select().single();
      if (createErr) {
        req.log.error({ err: createErr }, 'user_profiles create failed');
        return reply.code(500).send({ error: 'Error al crear perfil' });
      }
      fastify.invalidateProfileCache(userId);
      return created;
    }

    if (error) {
      req.log.error({ err: error }, 'user_profiles select failed');
      return reply.code(500).send({ error: 'Error al cargar perfil' });
    }
    return data;
  });

  // GET / - Listar todos los perfiles (solo admin)
  fastify.get('/', { preHandler: fastify.requireRole([ROLES.ADMIN]) }, async (req, reply) => {
    const { data, error } = await fastify.supabase
      .from('user_profiles').select('*').order('email');
    if (error) {
      req.log.error({ err: error }, 'user_profiles list failed');
      return reply.code(500).send({ error: 'Error al cargar perfiles' });
    }
    return data;
  });

  // PUT /:id - Actualizar rol y permisos de un usuario (solo admin)
  fastify.put('/:id', {
    preHandler: fastify.requireRole([ROLES.ADMIN]),
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          role:        { type: 'string', enum: [...ALL_ROLES] },
          permissions: permissionsSchema,
          tecnico_id:  { type: ['integer', 'null'] },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { error } = await fastify.supabase
      .from('user_profiles').update(req.body).eq('id', req.params.id);
    if (error) {
      req.log.error({ err: error }, 'user_profiles update failed');
      return reply.code(500).send({ error: 'Error al actualizar perfil' });
    }
    fastify.invalidateProfileCache(req.params.id);
    return reply.code(204).send();
  });

  // POST / - Registrar un nuevo perfil para usuario que ya existe en auth.users
  fastify.post('/', {
    preHandler: fastify.requireRole([ROLES.ADMIN]),
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email:       { type: 'string' },
          role:        { type: 'string', enum: [...ALL_ROLES] },
          permissions: permissionsSchema,
          tecnico_id:  { type: ['integer', 'null'] },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { data: uid, error: authErr } = await fastify.supabase
      .rpc('find_user_id_by_email', { p_email: req.body.email });
    if (authErr) {
      req.log.error({ err: authErr }, 'find_user_id_by_email failed');
      return reply.code(500).send({ error: 'Error al buscar usuario' });
    }
    if (!uid) return reply.code(404).send({ error: 'Usuario no encontrado. Debe registrarse primero.' });

    const role = req.body.role || ROLES.GESTOR;
    const permissions = req.body.permissions || defaultPermissionsFor(role);

    const upsertData = { id: uid, email: req.body.email, role, permissions };
    if (req.body.tecnico_id != null) upsertData.tecnico_id = req.body.tecnico_id;
    const { data, error } = await fastify.supabase
      .from('user_profiles')
      .upsert(upsertData)
      .select().single();
    if (error) {
      req.log.error({ err: error }, 'user_profiles upsert failed');
      return reply.code(500).send({ error: 'Error al crear perfil' });
    }
    fastify.invalidateProfileCache(uid);
    return reply.code(201).send(data);
  });
}
