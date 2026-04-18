import Fastify          from 'fastify';
import corsPlugin        from './plugins/cors.js';
import helmetPlugin      from './plugins/helmet.js';
import rateLimitPlugin   from './plugins/rate-limit.js';
import supabasePlugin    from './plugins/supabase.js';
import authPlugin        from './plugins/auth.js';
import msgraphPlugin     from './plugins/msgraph.js';
import clientesRoutes        from './routes/clientes.js';
import pedidosRoutes         from './routes/pedidos.js';
import metricasRoutes        from './routes/metricas.js';
import aiRoutes              from './routes/ai.js';
import calendarRoutes        from './routes/calendar.js';
import inventarioRoutes      from './routes/inventario.js';
import almacenamientoRoutes  from './routes/almacenamiento.js';
import serviciosRoutes       from './routes/servicios.js';
import pagosRoutes           from './routes/pagos.js';
import catalogoRoutes        from './routes/catalogo.js';
import tecnicosRoutes        from './routes/tecnicos.js';
import routeConfigsRoutes    from './routes/route_configs.js';
import userProfilesRoutes    from './routes/user_profiles.js';
import vehiculosRoutes       from './routes/vehiculos.js';
import geocodeRoutes         from './routes/geocode.js';

export async function createApp() {
  if (!process.env.SUPABASE_URL)         throw new Error('Missing env: SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_KEY) throw new Error('Missing env: SUPABASE_SERVICE_KEY');

  const app = Fastify({
    logger: process.env.NODE_ENV === 'production'
      ? { level: 'warn' }
      : { level: 'info' },
    trustProxy: true,
  });

  // Security plugins (order matters)
  await app.register(helmetPlugin);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);

  // Shared services
  await app.register(supabasePlugin);
  await app.register(authPlugin);
  await app.register(msgraphPlugin);

  // Routes
  await app.register(clientesRoutes,       { prefix: '/api/clientes' });
  await app.register(pedidosRoutes,        { prefix: '/api/pedidos' });
  await app.register(serviciosRoutes,      { prefix: '/api/servicios' });
  await app.register(pagosRoutes,          { prefix: '/api/pagos' });
  await app.register(catalogoRoutes,       { prefix: '/api/catalogo' });
  await app.register(tecnicosRoutes,       { prefix: '/api/tecnicos' });
  await app.register(metricasRoutes,       { prefix: '/api/metricas' });
  await app.register(aiRoutes,             { prefix: '/api/ai' });
  await app.register(calendarRoutes,       { prefix: '/api/calendar' });
  await app.register(inventarioRoutes,        { prefix: '/api/inventario' });
  await app.register(almacenamientoRoutes,    { prefix: '/api/almacenamiento' });
  await app.register(routeConfigsRoutes,      { prefix: '/api/route-configs' });
  await app.register(userProfilesRoutes,      { prefix: '/api/user-profiles' });
  await app.register(vehiculosRoutes,         { prefix: '/api/vehiculos' });
  await app.register(geocodeRoutes,           { prefix: '/api/geocode' });

  // Sanitized error handler — never leak internals
  app.setErrorHandler((error, request, reply) => {
    const status  = error.statusCode || 500;
    const message = status < 500 ? error.message : 'Error interno del servidor';
    request.log.error(error);
    reply.status(status).send({ error: message });
  });

  return app;
}
