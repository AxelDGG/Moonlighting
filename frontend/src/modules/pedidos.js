import { state, cFromDb, pFromDb, pToDb, cToDb, smFromDb } from '../state.js';
import { api } from '../api.js';
import { esc, money, fdateShort, tipoPill, pedidoDetalle, statusPill, todayStr, getDiaSemana, downloadCSV } from '../utils.js';
import { toast, openOv, closeOv, badge } from '../ui.js';
import { renderDash } from './dashboard.js';
import { refreshIcons } from '../icons.js';

let cliMode = 'ex';
let selectedModeloPrecio = 0;
let selectedTelaPrice    = 0;
let modeloAcIdx = -1;
let telaAcIdx   = -1;

// ── CLIENT MODE ──────────────────────────────────────────────────────────────
export function setCliMode(m) {
  cliMode = m;
  document.getElementById('cli-ex').style.display = m === 'ex' ? '' : 'none';
  document.getElementById('cli-nw').style.display = m === 'nw' ? '' : 'none';
  document.getElementById('btn-ex').className = 'mode-btn' + (m === 'ex' ? ' on' : '');
  document.getElementById('btn-nw').className = 'mode-btn' + (m === 'nw' ? ' on' : '');
  ['nc-n', 'nc-t', 'nc-d'].forEach(id => { const el = document.getElementById(id); if (el) el.required = m === 'nw'; });
}

// ── FORM VISIBILITY ──────────────────────────────────────────────────────────
export function updatePF() {
  const tipo = document.getElementById('p-tipo').value;
  const isAb = tipo === 'Abanico', isPe = tipo === 'Persiana', isLi = tipo === 'Limpieza';
  const hasNotas = ['Levantamiento', 'Limpieza', 'Mantenimiento'].includes(tipo);
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };
  show('r-ab-hd', isAb); show('r-modelo', isAb || isLi); show('r-ndesins', isAb);
  show('r-pe-hd', isPe); show('r-ancho', isPe); show('r-alto', isPe); show('r-inst', isPe); show('r-tela', isPe);
  show('r-nt-hd', hasNotas); show('r-notas', hasNotas);
  const setReq = (id, v) => { const el = document.getElementById(id); if (el) el.required = v; };
  setReq('p-modelo', isAb); setReq('p-ancho', isPe); setReq('p-alto', isPe);
  // Reset autocomplete state when type changes
  selectedModeloPrecio = 0; selectedTelaPrice = 0;
  const mi = document.getElementById('modelo-info'); if (mi) mi.innerHTML = '';
  const ti = document.getElementById('tela-info');   if (ti) ti.innerHTML = '';
}

// ── DESINSTALACIÓN HINT ──────────────────────────────────────────────────────
export function calcExtra() {
  const n = parseInt(document.getElementById('p-ndesins').value) || 0;
  const el = document.getElementById('desins-hint');
  if (el) el.textContent = n > 0 ? `+$${n * 100} adicionales por desinstalación` : '';
}

// ── TOTAL AUTO-CALCULATION ───────────────────────────────────────────────────
export function calcPedidoTotal() {
  const tipo = document.getElementById('p-tipo').value;
  const qty  = parseInt(document.getElementById('p-qty').value) || 1;
  if (tipo === 'Abanico' && selectedModeloPrecio > 0) {
    document.getElementById('p-total').value = (qty * selectedModeloPrecio).toFixed(2);
  } else if (tipo === 'Persiana' && selectedTelaPrice > 0) {
    const ancho = parseFloat(document.getElementById('p-ancho').value) || 0;
    const alto  = parseFloat(document.getElementById('p-alto').value)  || 0;
    const m2    = (ancho / 100) * (alto / 100);
    document.getElementById('p-total').value = (qty * m2 * selectedTelaPrice).toFixed(2);
  }
}

// ── AUTOCOMPLETE HELPERS ─────────────────────────────────────────────────────
function highlight(text, q) {
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx)) +
    '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>' +
    esc(text.slice(idx + q.length));
}

function stockClass(n) {
  return n > 3 ? 'ac-stock-ok' : n > 0 ? 'ac-stock-lo' : 'ac-stock-no';
}

function getAggregated(categoria) {
  const map = {};
  state.almacenamiento
    .filter(a => a.categoria === categoria)
    .forEach(a => {
      if (!map[a.modelo]) map[a.modelo] = { modelo: a.modelo, precio: a.precio, cantidad: 0 };
      map[a.modelo].cantidad += a.cantidad;
    });
  return Object.values(map).sort((a, b) => a.modelo.localeCompare(b.modelo));
}

// ── MODELO AUTOCOMPLETE (ABANICO) ────────────────────────────────────────────
export function onModeloInput() {
  const q    = document.getElementById('p-modelo').value.trim();
  const list = getAggregated('abanico').filter(m =>
    !q || m.modelo.toLowerCase().includes(q.toLowerCase())
  );
  const ac = document.getElementById('ac-modelo');
  modeloAcIdx = -1;
  if (!list.length) { ac.classList.remove('open'); return; }
  ac.innerHTML = list.map((m, i) =>
    `<div class="ac-item" data-idx="${i}"
         onmousedown="selectModelo('${esc(m.modelo).replace(/'/g, "\\'")}',${m.precio},${m.cantidad})">
       <span class="ac-item-name">${highlight(m.modelo, q)}</span>
       <span class="ac-item-stock ${stockClass(m.cantidad)}">Disp: ${m.cantidad}</span>
       <span class="ac-item-meta">${money(m.precio)}/ud</span>
     </div>`
  ).join('');
  ac.classList.add('open');
}

export function onModeloKey(e) {
  const ac    = document.getElementById('ac-modelo');
  const items = ac.querySelectorAll('.ac-item');
  if (!items.length) return;
  if      (e.key === 'ArrowDown')                      { e.preventDefault(); modeloAcIdx = Math.min(modeloAcIdx + 1, items.length - 1); }
  else if (e.key === 'ArrowUp')                        { e.preventDefault(); modeloAcIdx = Math.max(modeloAcIdx - 1, 0); }
  else if (e.key === 'Enter' && modeloAcIdx >= 0)      { e.preventDefault(); items[modeloAcIdx].dispatchEvent(new MouseEvent('mousedown')); return; }
  else if (e.key === 'Escape')                         { ac.classList.remove('open'); return; }
  items.forEach((el, i) => el.classList.toggle('focused', i === modeloAcIdx));
  if (modeloAcIdx >= 0) items[modeloAcIdx].scrollIntoView({ block: 'nearest' });
}

export function onModeloBlur() {
  setTimeout(() => document.getElementById('ac-modelo')?.classList.remove('open'), 150);
}

export function selectModelo(nombre, precio, stock) {
  document.getElementById('p-modelo').value = nombre;
  document.getElementById('ac-modelo').classList.remove('open');
  selectedModeloPrecio = precio;
  modeloAcIdx = -1;
  _updateModeloInfo(nombre, precio, stock);
  calcPedidoTotal();
}

function _updateModeloInfo(nombre, precio, stock) {
  const el = document.getElementById('modelo-info');
  if (!el) return;
  if (precio > 0) {
    const qty = typeof stock !== 'undefined' ? stock : (() => {
      const agg = getAggregated('abanico').find(m => m.modelo === nombre);
      return agg ? agg.cantidad : null;
    })();
    const stockHtml = qty !== null
      ? `<span class="ac-item-stock ${stockClass(qty)}" style="border-radius:10px;padding:1px 8px">Disp: ${qty} ud</span>`
      : '';
    el.innerHTML = `<span style="font-size:11px;color:var(--mu)">${money(precio)}/ud</span>${stockHtml ? '&nbsp;&nbsp;' + stockHtml : ''}`;
  } else {
    el.innerHTML = '';
  }
}

// ── TELA AUTOCOMPLETE (PERSIANA) ─────────────────────────────────────────────
export function onTelaInput() {
  const q    = document.getElementById('p-tela').value.trim();
  const list = getAggregated('persiana').filter(m =>
    !q || m.modelo.toLowerCase().includes(q.toLowerCase())
  );
  const ac = document.getElementById('ac-tela');
  telaAcIdx = -1;
  if (!list.length) { ac.classList.remove('open'); return; }
  ac.innerHTML = list.map((m, i) =>
    `<div class="ac-item" data-idx="${i}"
         onmousedown="selectTela('${esc(m.modelo).replace(/'/g, "\\'")}',${m.precio},${m.cantidad})">
       <span class="ac-item-name">${highlight(m.modelo, q)}</span>
       <span class="ac-item-stock ${stockClass(m.cantidad)}">Disp: ${m.cantidad} m</span>
       <span class="ac-item-meta">${money(m.precio)}/m²</span>
     </div>`
  ).join('');
  ac.classList.add('open');
}

export function onTelaKey(e) {
  const ac    = document.getElementById('ac-tela');
  const items = ac.querySelectorAll('.ac-item');
  if (!items.length) return;
  if      (e.key === 'ArrowDown')                    { e.preventDefault(); telaAcIdx = Math.min(telaAcIdx + 1, items.length - 1); }
  else if (e.key === 'ArrowUp')                      { e.preventDefault(); telaAcIdx = Math.max(telaAcIdx - 1, 0); }
  else if (e.key === 'Enter' && telaAcIdx >= 0)      { e.preventDefault(); items[telaAcIdx].dispatchEvent(new MouseEvent('mousedown')); return; }
  else if (e.key === 'Escape')                       { ac.classList.remove('open'); return; }
  items.forEach((el, i) => el.classList.toggle('focused', i === telaAcIdx));
  if (telaAcIdx >= 0) items[telaAcIdx].scrollIntoView({ block: 'nearest' });
}

export function onTelaBlur() {
  setTimeout(() => document.getElementById('ac-tela')?.classList.remove('open'), 150);
}

export function selectTela(nombre, precio, stock) {
  document.getElementById('p-tela').value = nombre;
  document.getElementById('ac-tela').classList.remove('open');
  selectedTelaPrice = precio;
  telaAcIdx = -1;
  const el = document.getElementById('tela-info');
  if (el) el.innerHTML =
    `<span style="font-size:11px;color:var(--mu)">${money(precio)}/m²</span>` +
    `&nbsp;&nbsp;<span class="ac-item-stock ${stockClass(stock)}" style="border-radius:10px;padding:1px 8px">Disp: ${stock} m</span>`;
  calcPedidoTotal();
}

// ── OPEN MODAL ───────────────────────────────────────────────────────────────
export function openPedidoModal(id = null) {
  document.getElementById('fp').reset();
  document.getElementById('p-eid').value = '';
  document.getElementById('mp-t').textContent = id ? 'Editar Pedido' : 'Nuevo Pedido';
  document.getElementById('p-fecha').value = todayStr();
  selectedModeloPrecio = 0; selectedTelaPrice = 0;
  const mi = document.getElementById('modelo-info'); if (mi) mi.innerHTML = '';
  const ti = document.getElementById('tela-info');   if (ti) ti.innerHTML = '';
  setCliMode('ex');
  const sel = document.getElementById('p-ce');
  sel.innerHTML = '<option value="">— Sin cliente —</option>';
  state.clientes.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = `${c.nombre} (#${c.id})`;
    sel.appendChild(o);
  });
  // Populate technicians from DB (with fallback to constants)
  const tecSel = document.getElementById('p-tecnico');
  tecSel.innerHTML = '<option value="">— Ninguno —</option>';
  const tecList = state.tecnicos && state.tecnicos.length ? state.tecnicos : [];
  tecList.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.nombre;
    opt.textContent = t.nombre;
    tecSel.appendChild(opt);
  });

  if (!id) { document.getElementById('p-tipo').value = 'Abanico'; updatePF(); }
  if (id !== null) {
    const p = state.pedidos.find(x => x.id === id); if (!p) return;
    document.getElementById('p-eid').value   = id;
    document.getElementById('p-ce').value    = p.clienteId || '';
    document.getElementById('p-tipo').value  = p.tipoServicio;
    document.getElementById('p-fecha').value = p.fecha || todayStr();
    document.getElementById('p-qty').value   = p.cantidad;
    document.getElementById('p-total').value = p.total;
    updatePF();
    const d = p.detalles || {};
    if (p.tipoServicio === 'Abanico') {
      document.getElementById('p-modelo').value  = d.modelo || '';
      document.getElementById('p-ndesins').value = d.nDesins || 0;
      calcExtra();
      if (d.modelo) {
        const agg = getAggregated('abanico').find(m => m.modelo === d.modelo);
        if (agg) { selectedModeloPrecio = agg.precio; _updateModeloInfo(d.modelo, agg.precio, agg.cantidad); }
      }
    }
    if (p.tipoServicio === 'Persiana') {
      document.getElementById('p-ancho').value = d.ancho || '';
      document.getElementById('p-alto').value  = d.alto  || '';
      document.getElementById('p-inst').value  = d.instalacion || 'interior';
      document.getElementById('p-tela').value  = d.tipoTela || '';
      if (d.tipoTela) {
        const agg = getAggregated('persiana').find(m => m.modelo === d.tipoTela);
        if (agg) {
          selectedTelaPrice = agg.precio;
          const el = document.getElementById('tela-info');
          if (el) el.innerHTML =
            `<span style="font-size:11px;color:var(--mu)">${money(agg.precio)}/m²</span>` +
            `&nbsp;&nbsp;<span class="ac-item-stock ${stockClass(agg.cantidad)}" style="border-radius:10px;padding:1px 8px">Disp: ${agg.cantidad} m</span>`;
        }
      }
    }
    if (['Levantamiento', 'Limpieza', 'Mantenimiento'].includes(p.tipoServicio)) {
      if (p.tipoServicio === 'Limpieza') document.getElementById('p-modelo').value = d.modelo || '';
      document.getElementById('p-notas').value = d.notas || '';
    }
    const cli = p.clienteId ? state.clientes.find(c => c.id === +p.clienteId) : null;
    if (cli) document.getElementById('p-pago').value = cli.metodoPago;
    const sm = state.servicios_metricas.find(s => s.pedido_id === id);
    if (sm) {
      if (sm.hora_programada) document.getElementById('p-hora-prog').value = sm.hora_programada;
      if (sm.tecnico)         document.getElementById('p-tecnico').value    = sm.tecnico;
      if (sm.orden_ruta)      document.getElementById('p-orden-ruta').value = sm.orden_ruta;
    }
  }
  openOv('ov-ped');
}

// ── SUBMIT ───────────────────────────────────────────────────────────────────
export async function submitPedido(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-sp');
  btn.innerHTML = '<span class="sp"></span> Guardando…'; btn.disabled = true;
  const eid       = document.getElementById('p-eid').value;
  const tipo      = document.getElementById('p-tipo').value;
  const fecha     = document.getElementById('p-fecha').value;
  const qty       = parseInt(document.getElementById('p-qty').value);
  const total     = parseFloat(document.getElementById('p-total').value);
  const pago      = document.getElementById('p-pago').value;
  const horaProg  = document.getElementById('p-hora-prog').value || null;
  const tecnico   = document.getElementById('p-tecnico').value || null;
  const ordenRuta = document.getElementById('p-orden-ruta').value ? parseInt(document.getElementById('p-orden-ruta').value) : null;
  let clienteId = null;
  try {
    if (cliMode === 'nw') {
      const nombre = document.getElementById('nc-n').value.trim();
      const numero = document.getElementById('nc-t').value.trim();
      const dir    = document.getElementById('nc-d').value.trim();
      btn.innerHTML = '<span class="sp"></span> Geocodificando…';
      let lat = null, lng = null, municipio = 'Desconocido';
      try { const g = await geocodeAddress(dir); if (g) { lat = g.lat; lng = g.lng; municipio = g.municipio; } } catch (_) {}
      const row = await api.clientes.create({ nombre, numero, direccion: dir, metodo_pago: pago, num_pedido: null, lat, lng, municipio });
      const nc = cFromDb(row);
      state.clientes.push(nc);
      clienteId = nc.id;
      toast('Cliente creado: ' + nombre);
    } else {
      clienteId = document.getElementById('p-ce').value ? +document.getElementById('p-ce').value : null;
      if (clienteId) {
        const ci = state.clientes.findIndex(c => c.id === clienteId);
        if (ci !== -1 && state.clientes[ci].metodoPago !== pago) {
          const updated = { ...state.clientes[ci], metodoPago: pago };
          await api.clientes.update(clienteId, cToDb(updated));
          state.clientes[ci] = updated;
        }
      }
    }
    let detalles = {};
    if (tipo === 'Abanico')       detalles = { modelo: document.getElementById('p-modelo').value.trim(), nDesins: parseInt(document.getElementById('p-ndesins').value) || 0 };
    else if (tipo === 'Persiana') detalles = { ancho: +document.getElementById('p-ancho').value, alto: +document.getElementById('p-alto').value, instalacion: document.getElementById('p-inst').value, tipoTela: document.getElementById('p-tela').value.trim() };
    else if (tipo === 'Limpieza') detalles = { modelo: document.getElementById('p-modelo').value.trim(), notas: document.getElementById('p-notas').value.trim() };
    else                          detalles = { notas: document.getElementById('p-notas').value.trim() };

    btn.innerHTML = '<span class="sp"></span> Guardando…';
    const cli = clienteId ? state.clientes.find(c => c.id === clienteId) : null;

    if (eid) {
      const p = state.pedidos.find(x => x.id === +eid);
      if (p) {
        await api.pedidos.update(+eid, pToDb({ ...p, clienteId, tipoServicio: tipo, fecha, cantidad: qty, total, detalles }));
        const i = state.pedidos.findIndex(x => x.id === +eid);
        if (i !== -1) state.pedidos[i] = { ...state.pedidos[i], clienteId, tipoServicio: tipo, fecha, cantidad: qty, total, detalles };
        toast('Pedido actualizado');
      }
      const existingSM = state.servicios_metricas.find(s => s.pedido_id === +eid);
      if (existingSM) {
        await api.metricas.update(existingSM.id, { tecnico: tecnico || '', hora_programada: horaProg, zona: cli?.municipio || '', orden_ruta: ordenRuta });
        const si = state.servicios_metricas.findIndex(s => s.id === existingSM.id);
        if (si !== -1) state.servicios_metricas[si] = { ...state.servicios_metricas[si], tecnico: tecnico || '', hora_programada: horaProg, zona: cli?.municipio || '', orden_ruta: ordenRuta };
      } else if (horaProg || tecnico) {
        const row = await api.metricas.create({ pedido_id: +eid, tecnico: tecnico || '', hora_programada: horaProg, zona: cli?.municipio || '', orden_ruta: ordenRuta, estado: 'programado', dia_semana: getDiaSemana(fecha) });
        state.servicios_metricas.push(smFromDb(row));
      }
    } else {
      const row = await api.pedidos.create(pToDb({ clienteId, tipoServicio: tipo, fecha, cantidad: qty, total, detalles }));
      const np = pFromDb(row);
      state.pedidos.push(np);
      if (clienteId) {
        const ci = state.clientes.findIndex(c => c.id === clienteId);
        if (ci !== -1 && !state.clientes[ci].numPedido) {
          const numPedido = 'PED-' + String(np.id).padStart(3, '0');
          await api.clientes.update(clienteId, cToDb({ ...state.clientes[ci], numPedido }));
          state.clientes[ci] = { ...state.clientes[ci], numPedido };
        }
      }
      if (horaProg || tecnico) {
        const smRow = await api.metricas.create({ pedido_id: np.id, tecnico: tecnico || '', hora_programada: horaProg, zona: cli?.municipio || '', orden_ruta: ordenRuta, estado: 'programado', dia_semana: getDiaSemana(fecha) });
        state.servicios_metricas.push(smFromDb(smRow));
      }
      toast('Pedido creado');
    }
    renderPedidos(); renderDash(); closeOv('ov-ped');
    if (document.getElementById('tab-cal').classList.contains('active')) window.renderCal?.();
  } catch (err) { toast('Error: ' + err.message, 'er'); }
  btn.innerHTML = 'Guardar'; btn.disabled = false;
}

async function geocodeAddress(address) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(address)}&limit=1`,
    { headers: { 'Accept-Language': 'es', 'User-Agent': 'Moonlighting/4.0' } }
  );
  const data = await res.json();
  if (data && data.length) return { lat: +data[0].lat, lng: +data[0].lon, municipio: data[0].address?.city || 'Desconocido' };
  return null;
}

export async function deletePedido(id) {
  if (!confirm('¿Eliminar este pedido?')) return;
  try {
    const sm = state.servicios_metricas.find(s => s.pedido_id === id);
    if (sm) { await api.metricas.update(sm.id, { estado: 'cancelado' }); state.servicios_metricas = state.servicios_metricas.filter(s => s.id !== sm.id); }
    await api.pedidos.delete(id);
    state.pedidos = state.pedidos.filter(x => x.id !== id);
    renderPedidos(); renderDash(); toast('Pedido eliminado', 'er');
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}

export function renderPedidos() {
  const q = (document.getElementById('qp')?.value || '').toLowerCase();
  const tbody = document.getElementById('tbp'), empty = document.getElementById('ep');
  const list = state.pedidos.filter(p => {
    const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    return String(p.id).includes(q) || p.tipoServicio.toLowerCase().includes(q) ||
      (p.detalles?.modelo || '').toLowerCase().includes(q) ||
      (p.detalles?.tipoTela || '').toLowerCase().includes(q) ||
      (c?.nombre || '').toLowerCase().includes(q) ||
      (p.fecha || '').includes(q);
  });
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = list.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).map(p => {
    const c  = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
    return `<tr>
      <td data-label="ID"><span class="pill pi">#${p.id}</span></td>
      <td data-label="Fecha" class="nw">${fdateShort(p.fecha)}</td>
      <td data-label="Cliente">${c ? `<span class="bold">${esc(c.nombre)}</span>` : '<span class="mu">Sin cliente</span>'}</td>
      <td data-label="Servicio">${tipoPill(p.tipoServicio)}</td>
      <td data-label="Detalle">${pedidoDetalle(p)}</td>
      <td data-label="Cant." class="tr">${p.cantidad}</td>
      <td data-label="Total" class="bold grn nw">${money(p.total)}</td>
      <td data-label="Estado">${sm ? statusPill(sm.estado) : '<span class="mu" style="font-size:11px">Sin tracking</span>'}</td>
      <td class="nw">
        <button class="btn bsm" style="background:#dbeafe;color:#1d4ed8" onclick="openTrackModal(${p.id})" title="Seguimiento">
          <i data-lucide="map-pin" style="width:12px;height:12px"></i>
        </button>
        <button class="btn bw bsm" onclick="openPedidoModal(${p.id})" title="Editar">
          <i data-lucide="pencil" style="width:12px;height:12px"></i>
        </button>
        <button class="btn bd bsm" onclick="deletePedido(${p.id})" title="Eliminar">
          <i data-lucide="trash-2" style="width:12px;height:12px"></i>
        </button>
      </td></tr>`;
  }).join('');
  badge(state.pedidos.length + ' pedidos');
  refreshIcons(tbody);
}

export function exportPedidos() {
  if (!state.pedidos.length) return toast('No hay pedidos para exportar', 'er');
  const headers = ['ID', 'Fecha', 'Cliente', 'Servicio', 'Monto', 'Cantidad', 'Estado'];
  const rows = state.pedidos.map(p => {
    const c  = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
    return [p.id, p.fecha, `"${(c?.nombre || 'Sin cliente').replace(/"/g, '""')}"`, p.tipoServicio, p.total, p.cantidad, sm ? sm.estado : 'N/A'];
  });
  downloadCSV([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), `pedidos_moonlighting_${todayStr()}.csv`);
  toast('Listado de pedidos exportado');
}
