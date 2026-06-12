// @vitest-environment jsdom
// Flujo del wizard de pedidos (ov-ped): navegación por pasos, validación
// inline por línea y submit completo contra fetch mockeado.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// auth.js crea el cliente Supabase al importar — mockearlo evita necesitar env vars
vi.mock('../src/auth.js', () => ({
  getToken: () => null,
  login: vi.fn(),
  logout: vi.fn(),
  checkSession: vi.fn(),
}));

import { state } from '../src/state.js';
import { openPedidoModal, pedNext, pedBack, pedGoStep, setCliMode, submitPedido, updatePF } from '../src/modules/pedidos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const bodyHtml = html
  .split(/<body>/)[1]
  .split(/<\/body>/)[0]
  .replace(/<script[\s\S]*?<\/script>/g, '');

const stepVisible = (n) => document.getElementById(`ped-step-${n}`).style.display !== 'none';
const btnVisible  = (id) => document.getElementById(id).style.display !== 'none';
const isInvalid   = (id) => document.getElementById(id).closest('.fi').classList.contains('invalid');
const setVal      = (id, v) => { document.getElementById(id).value = v; };

beforeEach(async () => {
  document.body.innerHTML = bodyHtml;
  state.clientes = [];
  state.pedidos = [];
  state.pedidoDetalle = [];
  state.servicios_metricas = [];
  state.almacenamiento = [];
  state.tecnicos = [];
  state._tecnicoNombre = null;
  await openPedidoModal();
});

describe('wizard de pedido — navegación', () => {
  it('abre en el paso 1 con Siguiente visible y Guardar oculto', () => {
    expect(stepVisible(1)).toBe(true);
    expect(stepVisible(2)).toBe(false);
    expect(stepVisible(3)).toBe(false);
    expect(btnVisible('btn-ped-next')).toBe(true);
    expect(btnVisible('btn-sp')).toBe(false);
    expect(btnVisible('btn-ped-back')).toBe(false);
  });

  it('con cliente existente avanza libre al paso 2', () => {
    pedNext();
    expect(stepVisible(2)).toBe(true);
    expect(btnVisible('btn-ped-back')).toBe(true);
  });

  it('pedBack regresa sin validar', () => {
    pedNext();
    pedBack();
    expect(stepVisible(1)).toBe(true);
  });
});

describe('wizard de pedido — validación inline', () => {
  it('bloquea el paso 2 si la línea de Abanico no tiene modelo', () => {
    pedNext(); // → paso 2 (tipo default: Abanico con una línea vacía)
    pedNext(); // intento → paso 3
    expect(stepVisible(2)).toBe(true);
    expect(isInvalid('p-modelo-0')).toBe(true);
  });

  it('avanza al paso 3 cuando la línea está completa', () => {
    pedNext();
    setVal('p-modelo-0', 'Hunter Elite 52');
    pedNext();
    expect(stepVisible(3)).toBe(true);
    expect(btnVisible('btn-sp')).toBe(true);
    expect(btnVisible('btn-ped-next')).toBe(false);
  });

  it('exige ancho/alto en la línea cuando el tipo es Persiana', () => {
    pedNext();
    setVal('p-tipo', 'Persiana');
    updatePF(); // re-renderiza las líneas para el nuevo tipo
    pedNext();
    expect(stepVisible(2)).toBe(true);
    expect(isInvalid('p-ancho-0')).toBe(true);
    expect(isInvalid('p-alto-0')).toBe(true);
  });

  it('bloquea el paso 1 en modo nuevo cliente sin datos', () => {
    setCliMode('nw');
    pedGoStep(2);
    expect(stepVisible(1)).toBe(true);
    expect(isInvalid('nc-n')).toBe(true);
    expect(isInvalid('nc-t')).toBe(true);
    expect(isInvalid('nc-calle')).toBe(true);
    expect(isInvalid('nc-muni')).toBe(true);
  });

  it('limpia el error al escribir en el campo', () => {
    setCliMode('nw');
    pedGoStep(2);
    expect(isInvalid('nc-n')).toBe(true);
    const input = document.getElementById('nc-n');
    input.value = 'Juan Pérez';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(isInvalid('nc-n')).toBe(false);
  });

  it('saltar directo al paso 3 desde el indicador valida los pasos intermedios', () => {
    pedGoStep(3); // paso 2 incompleto → debe quedarse en 2 con errores
    expect(stepVisible(2)).toBe(true);
    expect(isInvalid('p-modelo-0')).toBe(true);
  });
});

describe('wizard de pedido — submit (flujo completo)', () => {
  it('crea el pedido y sus líneas vía API y cierra el modal', async () => {
    const fetchMock = vi.fn(async (url, opts) => {
      if (url === '/api/pedidos' && opts.method === 'POST') {
        return {
          ok: true, status: 201,
          json: async () => ({
            id: 101, tipo_servicio: 'Abanico', fecha: '2026-06-12',
            cantidad: 1, total: 0, detalles: { modelo: 'Hunter Elite 52' },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    pedNext();
    setVal('p-modelo-0', 'Hunter Elite 52');
    pedNext();
    expect(stepVisible(3)).toBe(true);

    await submitPedido({ preventDefault: () => {} });

    const urls = fetchMock.mock.calls.map(([u, o]) => `${o.method} ${u}`);
    expect(urls).toContain('POST /api/pedidos');
    expect(urls).toContain('POST /api/pedidos/101/detalle/bulk');

    const createCall = fetchMock.mock.calls.find(([u, o]) => u === '/api/pedidos' && o.method === 'POST');
    const sent = JSON.parse(createCall[1].body);
    expect(sent.tipo_servicio).toBe('Abanico');

    expect(state.pedidos).toHaveLength(1);
    expect(state.pedidos[0].id).toBe(101);
    expect(document.getElementById('ov-ped').classList.contains('open')).toBe(false);

    vi.unstubAllGlobals();
  });

  it('submit en paso intermedio (Enter) avanza en vez de guardar', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await submitPedido({ preventDefault: () => {} }); // estamos en paso 1
    expect(stepVisible(2)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
