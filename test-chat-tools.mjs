// Functional test for executeTool (no network, no DB).
// Exercises each tool against a fake Supabase client and verifies:
//   - the correct table is queried
//   - the expected filters are applied
//   - the shape of the returned summary matches what the LLM expects
//
// Run with: node test-chat-tools.mjs

import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./api/_src/routes/ai.js', import.meta.url), 'utf8');

// Pull out the executeTool function body via a simple marker so we can eval it.
const startIdx = src.indexOf('async function executeTool');
const endMarker = '\nconst zonaSchema';
const endIdx = src.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1) {
  console.error('Could not locate executeTool boundaries');
  process.exit(1);
}
const fnSrc = src.slice(startIdx, endIdx);
const ctx  = {};
vm.createContext(ctx);
vm.runInContext(`${fnSrc}\nglobalThis.executeTool = executeTool;`, ctx);
const executeTool = ctx.executeTool;

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else      { console.error(`  ✗ ${desc}`); failed++; }
}

/* ── mock Supabase builder ─────────────────────────────────────────── */
function mockSupabase(tables) {
  const calls = [];
  function makeBuilder(table) {
    const state = { table, filters: {}, op: 'select' };
    const builder = {
      select() { return builder; },
      gt(col, val)    { state.filters[`gt:${col}`]    = val; return builder; },
      lt(col, val)    { state.filters[`lt:${col}`]    = val; return builder; },
      gte(col, val)   { state.filters[`gte:${col}`]   = val; return builder; },
      lte(col, val)   { state.filters[`lte:${col}`]   = val; return builder; },
      eq(col, val)    { state.filters[`eq:${col}`]    = val; return builder; },
      ilike(col, val) { state.filters[`ilike:${col}`] = val; return builder; },
      order()         { return builder; },
      limit()         { return builder; },
      then(resolve) {
        calls.push(state);
        const rows = typeof tables[table] === 'function' ? tables[table](state) : (tables[table] || []);
        resolve({ data: rows, error: null });
      },
    };
    return builder;
  }
  return { from(table) { return makeBuilder(table); }, _calls: calls };
}

/* ══════════════════════════════════════════════════════════════════ */
console.log('\nTest A — query_inventory reads almacenamiento with filters');
{
  const sb = mockSupabase({
    almacenamiento: [
      { id: 1, modelo: 'F7239', categoria: 'abanico', lugar: 'Bodega', cantidad: 5, precio: 1200 },
      { id: 2, modelo: 'F7239', categoria: 'abanico', lugar: 'Camioneta Nueva', cantidad: 2, precio: 1200 },
    ],
  });
  const r = await executeTool('query_inventory', { nombre_item: 'F7239', categoria: 'abanico' }, sb);
  const c = sb._calls[0];
  assert('queries almacenamiento table', c.table === 'almacenamiento');
  assert('applies gt cantidad 0', c.filters['gt:cantidad'] === 0);
  assert('applies ilike modelo filter', c.filters['ilike:modelo'] === '%F7239%');
  assert('applies eq categoria filter', c.filters['eq:categoria'] === 'abanico');
  assert('returns total_unidades = 7', r.total_unidades === 7);
  assert('returns 2 registros', r.total_registros === 2);
}

console.log('\nTest B — query_inventory_summary groups por_ubicacion/por_categoria');
{
  const sb = mockSupabase({
    almacenamiento: [
      { categoria: 'abanico',     lugar: 'Bodega',           cantidad: 10 },
      { categoria: 'abanico',     lugar: 'Camioneta Nueva',  cantidad: 3 },
      { categoria: 'persiana',    lugar: 'Bodega',           cantidad: 5 },
      { categoria: 'refacciones', lugar: 'Casa',             cantidad: 20 },
    ],
  });
  const r = await executeTool('query_inventory_summary', {}, sb);
  assert('total_unidades = 38', r.total_unidades === 38);
  assert('por_ubicacion.Bodega = 15', r.por_ubicacion.Bodega === 15);
  assert('por_ubicacion["Camioneta Nueva"] = 3', r.por_ubicacion['Camioneta Nueva'] === 3);
  assert('por_ubicacion.Casa = 20', r.por_ubicacion.Casa === 20);
  assert('por_categoria.abanico = 13', r.por_categoria.abanico === 13);
  assert('por_categoria.persiana = 5', r.por_categoria.persiana === 5);
  assert('por_categoria.refacciones = 20', r.por_categoria.refacciones === 20);
}

console.log('\nTest C — query_vehicle_inventory ilike lugar');
{
  const sb = mockSupabase({
    almacenamiento: (state) => {
      const pattern = state.filters['ilike:lugar'];
      // simulate Postgres ilike
      if (pattern === '%camioneta nueva%') return [
        { modelo: 'F7239', categoria: 'abanico', lugar: 'Camioneta Nueva', cantidad: 2, precio: 1200 },
        { modelo: 'Ven 12', categoria: 'abanico', lugar: 'Camioneta Nueva', cantidad: 1, precio: 900 },
      ];
      return [];
    },
  });
  const r = await executeTool('query_vehicle_inventory', { nombre_vehiculo: 'camioneta nueva' }, sb);
  const c = sb._calls[0];
  assert('queries almacenamiento', c.table === 'almacenamiento');
  assert('filters lugar by ilike', c.filters['ilike:lugar'] === '%camioneta nueva%');
  assert('filters gt cantidad 0', c.filters['gt:cantidad'] === 0);
  assert('total_unidades = 3', r.total_unidades === 3);
  assert('listing has 2 rows', r.inventario.length === 2);
}

console.log('\nTest D — query_vehicle_inventory empty result → friendly message');
{
  const sb = mockSupabase({ almacenamiento: [] });
  const r = await executeTool('query_vehicle_inventory', { nombre_vehiculo: 'zafiro' }, sb);
  assert('resultado indicates sin inventario', typeof r.resultado === 'string' && r.resultado.includes('zafiro'));
}

console.log('\nTest E — query_orders_today hits v_pedidos_resumen with gte/lt range');
{
  const sb = mockSupabase({ v_pedidos_resumen: [] });
  await executeTool('query_orders_today', { fecha: '2026-04-18' }, sb);
  const c = sb._calls[0];
  assert('queries v_pedidos_resumen', c.table === 'v_pedidos_resumen');
  assert('applies gte fecha_servicio 2026-04-18', c.filters['gte:fecha_servicio'] === '2026-04-18');
  assert('applies lt fecha_servicio 2026-04-19', c.filters['lt:fecha_servicio'] === '2026-04-19');
}

console.log('\nTest F — query_sales_today reads pagos with fecha_pago range');
{
  const sb = mockSupabase({ pagos: [
    { monto: 1500, fecha_pago: '2026-04-18T10:00:00', metodos_pago: { nombre: 'Efectivo' } },
    { monto: 500,  fecha_pago: '2026-04-18T14:00:00', metodos_pago: { nombre: 'Transferencia' } },
  ] });
  const r = await executeTool('query_sales_today', { desde: '2026-04-18', hasta: '2026-04-18' }, sb);
  const c = sb._calls[0];
  assert('queries pagos', c.table === 'pagos');
  assert('gte fecha_pago 2026-04-18T00:00:00', c.filters['gte:fecha_pago'] === '2026-04-18T00:00:00');
  assert('lte fecha_pago 2026-04-18T23:59:59', c.filters['lte:fecha_pago'] === '2026-04-18T23:59:59');
  assert('total_cobrado = 2000', r.total_cobrado === 2000);
  assert('por_metodo Efectivo = 1500', r.por_metodo.Efectivo === 1500);
  assert('por_metodo Transferencia = 500', r.por_metodo.Transferencia === 500);
}

console.log('\nTest G — query_orders_by_status resolves estado name → id');
{
  const sb = mockSupabase({
    estados_pedido: [ { id: 10, nombre: 'Pendiente' }, { id: 20, nombre: 'Completado' } ],
    v_pedidos_resumen: [ { id: 1, estado_id: 10 } ],
  });
  await executeTool('query_orders_by_status', { estado: 'pendiente' }, sb);
  const viewCall = sb._calls.find(c => c.table === 'v_pedidos_resumen');
  assert('calls estados_pedido first', sb._calls[0].table === 'estados_pedido');
  assert('filters v_pedidos_resumen by estado_id=10', viewCall?.filters['eq:estado_id'] === 10);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
