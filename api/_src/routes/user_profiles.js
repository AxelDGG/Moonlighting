const ADMIN_EMAIL = 'axeldegyvesgarcia@gmail.com';

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

    if (error && error.code === 'PGRST116') {
      // No existe — crearlo (admin si es el email principal, gestor si no)
      const role = userEmail === ADMIN_EMAIL ? 'admin' : 'gestor';
      const defaultPerms = role === 'gestor'
        ? { ver_metricas: false, ver_dashboard: false, crear_tecnicos: false, ver_porcentajes: false, ver_almacen: true, ver_calendario: true, ver_mapa: true }
        : role === 'tecnico'
        ? { ver_metricas: false, ver_dashboard: false, crear_tecnicos: false, ver_porcentajes: false, ver_almacen: false, ver_calendario: false, ver_mapa: false }
        : {};
      const { data: created, error: createErr } = await fastify.supabase
        .from('user_profiles').insert({ id: userId, email: userEmail, role, permissions: defaultPerms })
        .select().single();
      if (createErr) return reply.code(500).send({ error: 'Error al crear perfil' });
      return created;
    }

    if (error) return reply.code(500).send({ error: 'Error al cargar perfil' });
    return data;
  });

  // GET / - Listar todos los perfiles (solo admin)
  fastify.get('/', async (req, reply) => {
    const { data: me } = await fastify.supabase
      .from('user_profiles').select('role').eq('id', req.user.id).single();
    if (!me || me.role !== 'admin') return reply.code(403).send({ error: 'Sin acceso' });

    const { data, error } = await fastify.supabase
      .from('user_profiles').select('*').order('email');
    if (error) return reply.code(500).send({ error: 'Error al cargar perfiles' });
    return data;
  });

  // PUT /:id - Actualizar rol y permisos de un usuario (solo admin)
  fastify.put('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          role:        { type: 'string', enum: ['admin', 'gestor', 'tecnico'] },
          permissions: permissionsSchema,
          tecnico_id:  { type: ['integer', 'null'] },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { data: me } = await fastify.supabase
      .from('user_profiles').select('role').eq('id', req.user.id).single();
    if (!me || me.role !== 'admin') return reply.code(403).send({ error: 'Sin acceso' });

    const { error } = await fastify.supabase
      .from('user_profiles').update(req.body).eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: 'Error al actualizar perfil' });
    return reply.code(204).send();
  });

  // POST / - Registrar un nuevo perfil para usuario que ya existe en auth.users
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email:       { type: 'string' },
          role:        { type: 'string', enum: ['admin', 'gestor', 'tecnico'] },
          permissions: permissionsSchema,
          tecnico_id:  { type: ['integer', 'null'] },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const { data: me } = await fastify.supabase
      .from('user_profiles').select('role').eq('id', req.user.id).single();
    if (!me || me.role !== 'admin') return reply.code(403).send({ error: 'Sin acceso' });

    const targetEmail = String(req.body.email).trim().toLowerCase();
    if (!targetEmail) return reply.code(400).send({ error: 'El email es obligatorio' });

    // Buscar el usuario en auth.users por email — paginado por si hay >50 usuarios
    let targetUser = null;
    let page = 1;
    const PER_PAGE = 200;
    const MAX_PAGES = 50; // safety cap (10k users)
    while (page <= MAX_PAGES) {
      const { data, error: authErr } = await fastify.supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (authErr) {
        fastify.log.error({ err: authErr, page }, 'auth.admin.listUsers failed');
        return reply.code(500).send({
          error: `Error al buscar usuario: ${authErr.message || 'respuesta inesperada de Supabase Auth'}`,
        });
      }
      const users = data?.users || [];
      targetUser = users.find(u => (u.email || '').toLowerCase() === targetEmail);
      if (targetUser) break;
      if (users.length < PER_PAGE) break; // última página
      page++;
    }

    if (!targetUser) {
      return reply.code(404).send({
        error: `No se encontró "${targetEmail}" en Supabase Auth. Crea primero el usuario en Supabase → Authentication → Users.`,
      });
    }

    const role = req.body.role || 'gestor';
    const permissions = req.body.permissions || (
      role === 'gestor'
        ? { ver_metricas: false, ver_dashboard: false, crear_tecnicos: false, ver_porcentajes: false, ver_almacen: true, ver_calendario: true, ver_mapa: true }
        : role === 'tecnico'
        ? { ver_metricas: false, ver_dashboard: false, crear_tecnicos: false, ver_porcentajes: false, ver_almacen: false, ver_calendario: false, ver_mapa: false }
        : {});

    const upsertData = { id: targetUser.id, email: targetUser.email || targetEmail, role, permissions };
    if (req.body.tecnico_id != null) upsertData.tecnico_id = req.body.tecnico_id;

    let { data, error } = await fastify.supabase
      .from('user_profiles')
      .upsert(upsertData)
      .select().single();

    // tecnico_id column may not exist in older schemas — retry without it
    if (error && /tecnico_id/i.test(`${error.message || ''} ${error.details || ''}`)) {
      fastify.log.warn('user_profiles.tecnico_id column missing — retrying without it');
      const { tecnico_id: _omit, ...rest } = upsertData;
      ({ data, error } = await fastify.supabase
        .from('user_profiles').upsert(rest).select().single());
    }

    if (error) {
      fastify.log.error({ err: error }, 'user_profiles.upsert failed');
      return reply.code(500).send({
        error: `Error al crear perfil: ${error.message || 'error desconocido de Supabase'}`,
      });
    }
    return reply.code(201).send(data);
  });
}
