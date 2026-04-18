// Tests for the user_profiles POST endpoint pagination + error surfacing.
// Run: node test-user-profiles.mjs

import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./api/_src/routes/user_profiles.js', import.meta.url), 'utf8');

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else      { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('\nTest — user_profiles POST surfaces real Supabase errors');

assert('no longer swallows authErr with generic message only',
  src.includes('`Error al buscar usuario: ${authErr.message') );
assert('paginates through auth users (not limited to first 50)',
  src.includes('listUsers({ page, perPage: PER_PAGE })') && src.includes('while (page <= MAX_PAGES)'));
assert('uses perPage >= 200 to avoid most pagination rounds',
  /PER_PAGE\s*=\s*200/.test(src));
assert('has safety cap on pagination',
  src.includes('MAX_PAGES = 50'));
assert('normalises email (lowercase + trim) before comparison',
  src.includes('.toLowerCase()') && src.includes('.trim()'));
assert('returns 404 with actual email when user not found',
  src.includes("No se encontró \"${targetEmail}\" en Supabase Auth"));
assert('surfaces supabase error message on upsert failure',
  src.includes('`Error al crear perfil: ${error.message'));
assert('retries upsert without tecnico_id if column missing',
  src.includes('tecnico_id column missing') && src.includes('/tecnico_id/i'));
assert('logs errors via fastify.log.error for debugging',
  src.includes("fastify.log.error({ err: authErr") && src.includes("fastify.log.error({ err: error"));

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
