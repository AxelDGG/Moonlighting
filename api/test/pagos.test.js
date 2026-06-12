// Rutas de pagos: verifica que la API ya NO recalcula saldos manualmente
// (eso lo hace el trigger pagos_recalc_saldo en la DB) y que los códigos
// de respuesta se mantienen.
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import pagosRoutes from '../_src/routes/pagos.js';

// Mock mínimo del query builder de supabase-js. Las respuestas se configuran
// por `tabla.operacion` y cada llamada queda registrada en `calls`.
function mockSupabase(handlers) {
  const calls = [];
  function from(table) {
    const ctx = { table, op: null, body: null };
    const resolve = () => {
      calls.push({ table: ctx.table, op: ctx.op, body: ctx.body });
      const result = handlers[`${ctx.table}.${ctx.op}`];
      return Promise.resolve(result !== undefined ? result : { data: null, error: null });
    };
    const builder = {
      select() { if (!ctx.op) ctx.op = 'select'; return builder; },
      insert(body) { ctx.op = 'insert'; ctx.body = body; return builder; },
      update(body) { ctx.op = 'update'; ctx.body = body; return builder; },
      delete() { ctx.op = 'delete'; return builder; },
      eq() { return builder; },
      gte() { return builder; },
      lte() { return builder; },
      order() { return builder; },
      limit() { return resolve(); },
      single() { return resolve(); },
      then(onOk, onErr) { return resolve().then(onOk, onErr); },
    };
    return builder;
  }
  return { client: { from }, calls };
}

async function buildApp(handlers) {
  const app = Fastify();
  const { client, calls } = mockSupabase(handlers);
  app.decorate('supabase', client);
  app.decorate('verifyAuth', async () => {});
  app.decorate('requireRole', () => async () => {});
  await app.register(pagosRoutes, { prefix: '/pagos' });
  return { app, calls };
}

const pedidosUpdates = (calls) => calls.filter(c => c.table === 'pedidos' && c.op === 'update');

describe('POST /pagos', () => {
  it('crea el pago (201) sin recalcular saldo en la API', async () => {
    const { app, calls } = await buildApp({
      'pedidos.select': { data: { id: 5 }, error: null },
      'pagos.insert':   { data: { id: 9, pedido_id: 5, monto: 400 }, error: null },
    });
    const res = await app.inject({
      method: 'POST', url: '/pagos',
      payload: { pedido_id: 5, metodo_pago_id: 1, monto: 400 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBe(9);
    // El trigger de DB es el único que toca pedidos — la API no debe hacerlo
    expect(pedidosUpdates(calls)).toHaveLength(0);
  });

  it('devuelve 404 si el pedido no existe', async () => {
    const { app, calls } = await buildApp({
      'pedidos.select': { data: null, error: { code: 'PGRST116' } },
    });
    const res = await app.inject({
      method: 'POST', url: '/pagos',
      payload: { pedido_id: 999, metodo_pago_id: 1, monto: 400 },
    });
    expect(res.statusCode).toBe(404);
    expect(calls.filter(c => c.table === 'pagos')).toHaveLength(0);
  });

  it('elimina campos extra del payload antes del insert (additionalProperties:false + removeAdditional)', async () => {
    const { app, calls } = await buildApp({
      'pedidos.select': { data: { id: 5 }, error: null },
      'pagos.insert':   { data: { id: 9 }, error: null },
    });
    const res = await app.inject({
      method: 'POST', url: '/pagos',
      payload: { pedido_id: 5, metodo_pago_id: 1, monto: 400, hack: true },
    });
    expect(res.statusCode).toBe(201);
    const insert = calls.find(c => c.table === 'pagos' && c.op === 'insert');
    expect(insert.body).not.toHaveProperty('hack');
  });
});

describe('PUT /pagos/:id', () => {
  it('actualiza el pago (204) sin recalcular saldo en la API', async () => {
    const { app, calls } = await buildApp({
      'pagos.select': { data: { id: 9 }, error: null },
      'pagos.update': { data: null, error: null },
    });
    const res = await app.inject({
      method: 'PUT', url: '/pagos/9',
      payload: { monto: 500 },
    });
    expect(res.statusCode).toBe(204);
    expect(pedidosUpdates(calls)).toHaveLength(0);
  });

  it('devuelve 404 si el pago no existe', async () => {
    const { app } = await buildApp({
      'pagos.select': { data: null, error: { code: 'PGRST116' } },
    });
    const res = await app.inject({ method: 'PUT', url: '/pagos/999', payload: { monto: 1 } });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /pagos/:id', () => {
  it('elimina el pago (204) sin recalcular saldo en la API', async () => {
    const { app, calls } = await buildApp({
      'pagos.select': { data: { id: 9 }, error: null },
      'pagos.delete': { data: null, error: null },
    });
    const res = await app.inject({ method: 'DELETE', url: '/pagos/9' });
    expect(res.statusCode).toBe(204);
    expect(pedidosUpdates(calls)).toHaveLength(0);
  });
});

describe('GET /pagos/pedido/:pedido_id', () => {
  it('devuelve pagos con total_pagado calculado', async () => {
    const { app } = await buildApp({
      'pagos.select': { data: [{ monto: 100 }, { monto: 50 }], error: null },
    });
    const res = await app.inject({ method: 'GET', url: '/pagos/pedido/5' });
    expect(res.statusCode).toBe(200);
    expect(res.json().total_pagado).toBe(150);
  });
});
