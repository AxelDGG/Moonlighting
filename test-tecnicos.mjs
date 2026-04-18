// Tests for the tecnicos POST/PUT fallback when the vehiculo column
// doesn't exist in Supabase.
//
// Run: node test-tecnicos.mjs

import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./api/_src/routes/tecnicos.js', import.meta.url), 'utf8');

let passed = 0, failed = 0;
function assert(desc, cond) {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else      { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('\nTest — static checks on tecnicos.js source');

assert('exports isVehiculoColumnMissing helper', src.includes('function isVehiculoColumnMissing'));
assert('exports stripVehiculo helper',          src.includes('function stripVehiculo'));
assert('POST handler retries without vehiculo on column-missing error',
  src.includes('insert(stripVehiculo(req.body))') && src.includes('isVehiculoColumnMissing(attempt.error)'));
assert('PUT handler retries without vehiculo on column-missing error',
  src.includes('update(stripVehiculo(req.body))'));
assert('POST error surfaces the Supabase error message',
  src.includes('`Error al crear técnico: ${attempt.error.message}`'));
assert('PUT error surfaces the Supabase error message',
  src.includes('`Error al actualizar técnico: ${attempt.error.message}`'));

console.log('\nTest — isVehiculoColumnMissing recognises PostgREST shapes');

// Evaluate just the helper in a sandbox
const helperStart = src.indexOf('function isVehiculoColumnMissing');
const helperEnd   = src.indexOf('function stripVehiculo');
const helperSrc   = src.slice(helperStart, helperEnd);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(`${helperSrc}\nglobalThis.h = isVehiculoColumnMissing;`, ctx);
const h = ctx.h;

assert('null / undefined → false', h(null) === false && h(undefined) === false);
assert('generic error unrelated → false',
  h({ message: 'duplicate key on nombre', code: '23505' }) === false);
assert('PostgREST PGRST204 with vehiculo hint → true',
  h({ code: 'PGRST204', message: "Could not find the 'vehiculo' column of 'tecnicos' in the schema cache" }) === true);
assert('Supabase Postgres "column does not exist" for vehiculo → true',
  h({ message: 'column "vehiculo" of relation "tecnicos" does not exist' }) === true);
assert('column error for a different column → false',
  h({ message: 'column "apellido" does not exist' }) === false);

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
