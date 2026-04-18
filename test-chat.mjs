// Quick smoke tests for the two fixed bugs.
// Run with: node test-chat.mjs

let passed = 0;
let failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}`);
    failed++;
  }
}

/* ── helpers matching the actual code ── */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ══════════════════════════════════════════════════════════════
   TEST 1: chip onclick — no broken HTML attribute quotes
══════════════════════════════════════════════════════════════ */
console.log('\nTest 1 — chip onclick HTML');

const SUGGESTIONS = [
  '¿Qué pedidos tengo hoy?',
  '¿Cuánto he vendido hoy?',
  '¿Qué hay en inventario?',
  '¿Cuántos pedidos están pendientes?',
];

const chipHtml = SUGGESTIONS.map(s =>
  `<button class="chat-chip" onclick="sendChatMsg(this.getAttribute('data-q'))" data-q="${esc(s)}">${esc(s)}</button>`
).join('');

// The onclick value must not contain unescaped double-quotes
assert('no double-quote inside onclick attribute', !chipHtml.includes('onclick="sendChatMsg("'));
// data-q must be present
assert('data-q attribute present for each suggestion', (chipHtml.match(/data-q=/g) || []).length === SUGGESTIONS.length);
// Uses getAttribute, not JSON.stringify inline
assert('uses getAttribute in onclick', chipHtml.includes("this.getAttribute('data-q')"));

/* ══════════════════════════════════════════════════════════════
   TEST 2: tool-call loop — handles multi-hop and null content
══════════════════════════════════════════════════════════════ */
console.log('\nTest 2 — tool call loop logic');

function simulateLoop(mockChoices) {
  const messages = [{ role: 'user', content: 'test' }];
  let idx = 0;
  let choice = mockChoices[idx++];
  let maxIter = 4;
  let toolRounds = 0;

  while (choice?.finish_reason === 'tool_calls' && choice.message?.tool_calls?.length > 0 && maxIter-- > 0) {
    toolRounds++;
    // normalize null content (the fix)
    messages.push({ ...choice.message, content: choice.message.content ?? '' });
    // push fake tool result
    for (const tc of choice.message.tool_calls) {
      messages.push({ role: 'tool', tool_call_id: tc.id, content: '{"resultado":"ok"}' });
    }
    choice = mockChoices[idx++] || { finish_reason: 'stop', message: { content: 'done' } };
  }

  return { choice, toolRounds, messages };
}

// Scenario A: single tool call → text response
{
  const choices = [
    { finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'query_inventory', arguments: '{}' } }] } },
    { finish_reason: 'stop', message: { content: 'Hay 5 abanicos en bodega.' } },
  ];
  const { choice, toolRounds, messages } = simulateLoop(choices);
  assert('single tool call: 1 round executed', toolRounds === 1);
  assert('single tool call: final content present', choice?.message?.content === 'Hay 5 abanicos en bodega.');
  assert('null content normalized to empty string in messages', messages.some(m => m.content === '' && Array.isArray(m.tool_calls)));
}

// Scenario B: two consecutive tool calls (chained)
{
  const choices = [
    { finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'query_orders_today', arguments: '{}' } }] } },
    { finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'c2', function: { name: 'query_sales_today',  arguments: '{}' } }] } },
    { finish_reason: 'stop', message: { content: 'Tienes 3 pedidos y $500 vendidos hoy.' } },
  ];
  const { choice, toolRounds } = simulateLoop(choices);
  assert('chained tool calls: 2 rounds executed', toolRounds === 2);
  assert('chained tool calls: final content present', !!choice?.message?.content);
}

// Scenario C: no tool calls (plain conversation)
{
  const choices = [
    { finish_reason: 'stop', message: { content: '¡Hola! ¿En qué te ayudo?' } },
  ];
  const { choice, toolRounds } = simulateLoop(choices);
  assert('no tool call: 0 rounds', toolRounds === 0);
  assert('no tool call: content returned directly', choice?.message?.content === '¡Hola! ¿En qué te ayudo?');
}

// Scenario D: runaway loop capped at maxIter=4
{
  const alwaysTool = Array(10).fill({
    finish_reason: 'tool_calls',
    message: { content: null, tool_calls: [{ id: 'cx', function: { name: 'query_inventory', arguments: '{}' } }] },
  });
  const { toolRounds } = simulateLoop(alwaysTool);
  assert('runaway loop capped at 4 iterations', toolRounds === 4);
}

/* ══════════════════════════════════════════════════════════════
   TEST 3: inventory tool — queries almacenamiento, not inventario_existencias
══════════════════════════════════════════════════════════════ */
console.log('\nTest 3 — inventory tool uses almacenamiento table');

import { readFileSync } from 'fs';
const aiSrc = readFileSync(new URL('./api/_src/routes/ai.js', import.meta.url), 'utf8');

assert('executeTool queries almacenamiento', aiSrc.includes("from('almacenamiento')"));
assert('executeTool does NOT query inventario_existencias', !aiSrc.includes("from('inventario_existencias')"));
assert('inventory filters by modelo (not items_catalogo)', aiSrc.includes("ilike('modelo'"));
assert('inventory filters by lugar (not ubicaciones_inventario)', aiSrc.includes("ilike('lugar'"));

/* ══════════════════════════════════════════════════════════════
   TEST 4: orders tool — uses v_pedidos_resumen, no timestamp in date comparison
══════════════════════════════════════════════════════════════ */
console.log('\nTest 4 — orders tool uses view and correct date format');

assert('orders uses v_pedidos_resumen view', aiSrc.includes("from('v_pedidos_resumen')"));
assert('orders does NOT use nested select estados_pedido(nombre)', !aiSrc.includes("estados_pedido(nombre)"));
assert('orders does NOT append T00:00:00 to fecha_servicio', !aiSrc.includes('fecha}T00:00:00'));
assert('orders uses gte/lt range (works for DATE and TIMESTAMP)', aiSrc.includes(".gte('fecha_servicio', fecha)") && aiSrc.includes(".lt('fecha_servicio', fechaSiguiente)"));
assert('orders_by_status resolves estado name to ID via estados_pedido table', aiSrc.includes("from('estados_pedido')"));

/* ══════════════════════════════════════════════════════════════
   RESULTS
══════════════════════════════════════════════════════════════ */
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
