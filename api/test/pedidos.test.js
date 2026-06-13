// Paginación del listado de pedidos: limit/offset con cap, default
// retrocompatible (loadAll() del frontend espera el dataset completo).
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import pedidosRoutes from '../_src/routes/pedidos.js';
import { QUERY_LIMITS } from '../_src/constants/limits.js';

function mockSupabase(handlers) {
  const calls = [];
  function from(table) {
    const ctx = { table, op: null, body: null, range: null };
    const resolve = () => {
      calls.push({ table: ctx.table, op: ctx.op, body: ctx.body, range: ctx.range });
      const result = handlers[`${ctx.table}.${ctx.op}`];
      return Promise.resolve(result !== undefined ? result : { data: [], error: null });
    };
    const builder = {
      select() { if (!ctx.op) ctx.op = 'select'; return builder; },
      insert(body) { ctx.op = 'insert'; ctx.body = body; return builder; },
      update(body) { ctx.op = 'update'; ctx.body = body; return builder; },
      delete() { ctx.op = 'delete'; return builder; },
      eq() { return builder; },
      order() { return builder; },
      range(a, b) { ctx.range = [a, b]; return builder; },
      limit() { return resolve(); },
      single() { return resolve(); },
      then(onOk, onErr) { return resolve().then(onOk, onErr); },
    };
    return builder;
  }
  return { client: { from }, calls };
}

async function buildApp(handlers = {}) {
  const app = Fastify();
  const { client, calls } = mockSupabase(handlers);
  app.decorate('supabase', client);
  app.decorate('verifyAuth', async () => {});
  app.decorate('requireRole', () => async () => {});
  await app.register(pedidosRoutes, { prefix: '/pedidos' });
  return { app, calls };
}

describe('GET /pedidos — paginación', () => {
  it('sin params usa el default retrocompatible (PAGE_DEFAULT desde offset 0)', async () => {
    const { app, calls } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/pedidos' });
    expect(res.statusCode).toBe(200);
    const call = calls.find(c => c.table === 'v_pedidos_resumen');
    expect(call.range).toEqual([0, QUERY_LIMITS.PAGE_DEFAULT - 1]);
  });

  it('respeta limit y offset explícitos', async () => {
    const { app, calls } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/pedidos?limit=50&offset=100' });
    expect(res.statusCode).toBe(200);
    const call = calls.find(c => c.table === 'v_pedidos_resumen');
    expect(call.range).toEqual([100, 149]);
  });

  it('rechaza limit por encima del máximo (400)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/pedidos?limit=${QUERY_LIMITS.PAGE_MAX + 1}` });
    expect(res.statusCode).toBe(400);
  });

  it('rechaza offset negativo (400)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/pedidos?offset=-1' });
    expect(res.statusCode).toBe(400);
  });
});
