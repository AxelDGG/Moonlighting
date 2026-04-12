import fp from 'fastify-plugin';

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
  });
});
