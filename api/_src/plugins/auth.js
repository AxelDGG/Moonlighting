import fp from 'fastify-plugin';
import { CACHE_TTLS } from '../config/cache-ttls.js';

const PROFILE_TTL_MS = CACHE_TTLS.PROFILE_MS;
const profileCache = new Map();

function cacheGet(userId) {
  const entry = profileCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.ts > PROFILE_TTL_MS) {
    profileCache.delete(userId);
    return null;
  }
  return entry.profile;
}

function cacheSet(userId, profile) {
  profileCache.set(userId, { profile, ts: Date.now() });
}

export default fp(async (fastify) => {
  fastify.decorate('verifyAuth', async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'No autorizado' });
    }
    const token = auth.slice(7);
    const { data: { user }, error } = await fastify.supabase.auth.getUser(token);
    if (error || !user) {
      return reply.code(401).send({ error: 'No autorizado' });
    }
    request.user = user;

    let profile = cacheGet(user.id);
    if (!profile) {
      const { data } = await fastify.supabase
        .from('user_profiles')
        .select('id, email, role, permissions, tecnico_id')
        .eq('id', user.id)
        .single();
      profile = data || null;
      if (profile) cacheSet(user.id, profile);
    }
    request.profile = profile;
  });

  fastify.decorate('requireRole', (roles) => async (request, reply) => {
    const role = request.profile?.role;
    if (!role || !roles.includes(role)) {
      return reply.code(403).send({ error: 'Sin acceso' });
    }
  });

  fastify.decorate('invalidateProfileCache', (userId) => {
    if (userId) profileCache.delete(userId);
    else profileCache.clear();
  });
});
