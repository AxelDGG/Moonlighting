import { state, cFromDb, cToDb } from '../state.js';
import { api } from '../api.js';
import { esc, muniColor, pillPago, todayStr, downloadCSV } from '../utils.js';
import { toast, openOv, closeOv, badge, initMobileRows, confirmDialog } from '../ui.js';
import { renderDash } from './dashboard.js';
import { PAGO_IC } from '../constants.js';
import { refreshIcons } from '../icons.js';
import { updateMapMarkers } from './mapa.js';
import { refreshClientesDropdown } from './pedidos.js';
import { resolveLocation } from '../geocoding.js';

let _showInactive = false;
let _allLoaded = false; // true cuando ya se cargaron inactivos
let _sort = { col: 'id', dir: 'desc' };
let _pageLimit = 50;

const SORT_ACCESSORS = {
  id: c => c.id,
  nombre: c => (c.nombre || '').toLowerCase(),
  numero: c => (c.numero || c.telefono || '').replace(/\D/g, ''),
  municipio: c => (c.municipio || '').toLowerCase(),
  metodoPago: c => (c.metodoPago || '').toLowerCase(),
  numPedido: c => (c.numPedido || '').toLowerCase(),
};

export function sortClientes(col) {
  if (_sort.col === col) _sort.dir = _sort.dir === 'asc' ? 'desc' : 'asc';
  else { _sort = { col, dir: col === 'id' ? 'desc' : 'asc' }; }
  _pageLimit = 50;
  renderClientes();
}

export function loadMoreClientes() {
  _pageLimit += 50;
  renderClientes();
}

export async function toggleShowInactive() {
  _showInactive = !_showInactive;
  const btn = document.getElementById('btn-toggle-inactive');
  if (btn) {
    btn.classList.toggle('on', _showInactive);
    btn.title = _showInactive ? 'Ocultar eliminados' : 'Mostrar eliminados';
  }
  // Cargar inactivos del API solo la primera vez que se activa el toggle
  if (_showInactive && !_allLoaded) {
    try {
      const all = await api.clientesAll.getAll();
      state.clientes = all.map(cFromDb);
      _allLoaded = true;
    } catch (_) {}
  }
  renderClientes();
}

export function openClienteModal(id) {
  document.getElementById('fc').reset();
  const c = state.clientes.find(x => x.id === id); if (!c) return;
  document.getElementById('c-eid').value  = id;
  document.getElementById('c-n').value    = c.nombre;
  document.getElementById('c-t').value    = c.numero;
  document.getElementById('c-d').value    = c.direccion;
  document.getElementById('c-p').value    = c.metodoPago;
  document.getElementById('c-np').value   = c.numPedido || '';
  openOv('ov-cli');
}

export async function submitCliente(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-sc');
  btn.innerHTML = '<span class="sp"></span>'; btn.disabled = true;
  const id = +document.getElementById('c-eid').value;
  const ci = state.clientes.findIndex(x => x.id === id);
  if (ci === -1) { btn.innerHTML = 'Guardar'; btn.disabled = false; return; }
  const nombre = document.getElementById('c-n').value.trim();
  const numero = document.getElementById('c-t').value.trim();
  const dir    = document.getElementById('c-d').value.trim();
  const pago   = document.getElementById('c-p').value;
  const np     = document.getElementById('c-np').value.trim();
  const addressChanged = dir !== state.clientes[ci].direccion;
  let lat = addressChanged ? null : state.clientes[ci].lat;
  let lng = addressChanged ? null : state.clientes[ci].lng;
  let municipio = addressChanged ? 'Desconocido' : (state.clientes[ci].municipio || 'Desconocido');
  let codigoPostal = addressChanged ? null : (state.clientes[ci].codigoPostal || null);
  let geocodeSource = addressChanged ? null : state.clientes[ci].geocodeSource;
  let geocodeConfidence = addressChanged ? null : state.clientes[ci].geocodeConfidence;
  let ubicacionVerificada = addressChanged ? false : state.clientes[ci].ubicacionVerificada;
  if (addressChanged) {
    btn.innerHTML = '<span class="sp"></span> Geocodificando…';
    try {
      const r = await resolveLocation({ address: dir });
      if (r && !r.error && r.lat != null) {
        lat = r.lat; lng = r.lng;
        municipio = r.municipio || 'Desconocido';
        codigoPostal = r.codigoPostal || null;
        geocodeSource = r.source;
        geocodeConfidence = r.confidence;
        ubicacionVerificada = !!r.verified;
      }
    } catch (_) {}
  }
  const updated = {
    ...state.clientes[ci], nombre, numero, direccion: dir, metodoPago: pago, numPedido: np,
    lat, lng, municipio, codigoPostal,
    geocodeSource, geocodeConfidence, ubicacionVerificada,
    verifiedAt: ubicacionVerificada ? new Date().toISOString() : state.clientes[ci].verifiedAt,
  };
  try {
    await api.clientes.update(id, cToDb(updated));
    state.clientes[ci] = updated;
    refreshClientesDropdown();
    toast('Cliente actualizado');
    renderClientes(); renderDash(); closeOv('ov-cli');
    if (addressChanged) updateMapMarkers();
  } catch (err) { toast('Error: ' + err.message, 'er'); }
  btn.innerHTML = 'Guardar'; btn.disabled = false;
}

export function editPago(id) {
  const span = document.getElementById('pago-' + id);
  const c = state.clientes.find(x => x.id === id); if (!c) return;
  span.innerHTML = `<select onchange="savePago(${id},this.value)" onblur="renderClientes()" style="padding:4px 8px;border:1px solid var(--bo);border-radius:6px;font-size:12px;outline:none">
    ${Object.keys(PAGO_IC).map(m => `<option value="${m}" ${c.metodoPago === m ? 'selected' : ''}>${m}</option>`).join('')}
  </select>`;
  span.querySelector('select').focus();
}

export async function savePago(id, val) {
  const ci = state.clientes.findIndex(x => x.id === id); if (ci === -1) return;
  const updated = { ...state.clientes[ci], metodoPago: val };
  try { await api.clientes.update(id, cToDb(updated)); state.clientes[ci] = updated; toast('Método de pago actualizado'); } catch (err) { toast('Error: ' + err.message, 'er'); }
  setTimeout(renderClientes, 150);
}

export async function restoreCliente(id) {
  const ci = state.clientes.findIndex(x => x.id === id); if (ci === -1) return;
  try {
    await api.clientes.update(id, { activo: true });
    state.clientes[ci] = { ...state.clientes[ci], activo: true };
    toast('Cliente restaurado');
    renderClientes(); renderDash();
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}

export async function deleteCliente(id) {
  const c = state.clientes.find(x => x.id === id);
  const ok = await confirmDialog(
    `¿Eliminar a ${c?.nombre || 'este cliente'}? Quedará inactivo y no aparecerá en la lista. Puedes restaurarlo después.`,
    { title: 'Eliminar cliente', confirmLabel: 'Eliminar', variant: 'danger' }
  );
  if (!ok) return;
  try {
    await api.clientes.delete(id);
    // Marcar como inactivo en estado local (soft delete)
    const ci = state.clientes.findIndex(x => x.id === id);
    if (ci !== -1) state.clientes[ci] = { ...state.clientes[ci], activo: false };
    renderClientes(); renderDash();
    toast('Cliente eliminado');
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}

export function renderClientes() {
  const q = (document.getElementById('qc')?.value || '').toLowerCase().trim();
  const tbody = document.getElementById('tbc'), empty = document.getElementById('ec');

  // Sincronizar botón de toggle
  const btn = document.getElementById('btn-toggle-inactive');
  if (btn) {
    btn.classList.toggle('on', _showInactive);
    btn.title = _showInactive ? 'Ocultar eliminados' : 'Mostrar eliminados';
  }

  let list = state.clientes.filter(c => {
    if (!_showInactive && c.activo === false) return false;
    if (!q) return true;
    return c.nombre.toLowerCase().includes(q) || String(c.id).includes(q)
      || (c.numero || '').toLowerCase().includes(q)
      || (c.direccion || '').toLowerCase().includes(q)
      || (c.municipio || '').toLowerCase().includes(q);
  });

  // Sort
  const accessor = SORT_ACCESSORS[_sort.col] || SORT_ACCESSORS.id;
  const dirMul = _sort.dir === 'asc' ? 1 : -1;
  list = list.slice().sort((a, b) => {
    const va = accessor(a), vb = accessor(b);
    if (va < vb) return -1 * dirMul;
    if (va > vb) return 1 * dirMul;
    return 0;
  });

  const total = list.length;
  const shown = Math.min(_pageLimit, total);

  // Update sortable header indicators
  document.querySelectorAll('#tab-clientes th.sortable').forEach(th => {
    const col = th.dataset.sort;
    th.classList.toggle('asc', col === _sort.col && _sort.dir === 'asc');
    th.classList.toggle('desc', col === _sort.col && _sort.dir === 'desc');
  });

  if (!total) {
    tbody.innerHTML = '';
    const hasFilter = q || _showInactive;
    empty.innerHTML = hasFilter
      ? `<div class="ei"><i data-lucide="search-x" style="width:40px;height:40px"></i></div>
         <p>Ningún cliente coincide con tu búsqueda.</p>
         <button class="btn bg empty-cta" onclick="document.getElementById('qc').value='';renderClientes()"><i data-lucide="x" style="width:13px;height:13px"></i> Limpiar búsqueda</button>`
      : `<div class="ei"><i data-lucide="users" style="width:40px;height:40px"></i></div>
         <p>Aún no hay clientes registrados.</p>
         <p style="font-size:12px;margin-top:4px">Los clientes se crean al registrar un pedido.</p>
         <button class="btn bp empty-cta" onclick="showTab('pedidos')"><i data-lucide="plus" style="width:13px;height:13px"></i> Nuevo pedido</button>`;
    empty.style.display = 'block';
    refreshIcons(empty);
    _updatePagBar(shown, total);
    return;
  }
  empty.style.display = 'none';

  const page = list.slice(0, shown);
  tbody.innerHTML = page.map(c => {
    const col = muniColor(c.municipio);
    const inactive = c.activo === false;
    return `<tr${inactive ? ' style="opacity:0.5"' : ''}>
      <td data-label="ID" class="mob-det"><span class="pill pi">#${c.id}</span></td>
      <td data-label="Nombre" class="bold">${esc(c.nombre)}${inactive ? ' <span style="font-size:10px;color:var(--err);font-weight:400">(eliminado)</span>' : ''}</td>
      <td data-label="Teléfono" class="nw mob-det">${esc(c.numero || c.telefono || '—')}</td>
      <td data-label="Dirección" class="mob-det"><span class="ell" title="${esc(c.direccion)}">${esc(c.direccion || '—')}</span></td>
      <td data-label="Municipio" class="nw"><span style="display:inline-flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${col};display:inline-block;flex-shrink:0"></span><span style="font-size:12px">${esc(c.municipio || '—')}</span></span></td>
      <td data-label="Pago" class="mob-det" id="pago-${c.id}" ${!inactive ? `onclick="editPago(${c.id})" style="cursor:pointer" title="Click para cambiar"` : ''}>${pillPago(c.metodoPago)}</td>
      <td data-label="Pedido" class="mob-det">${c.numPedido ? `<code>${esc(c.numPedido)}</code>` : '<span class="mu">—</span>'}</td>
      <td class="td-act nw">
        ${inactive
          ? `<button class="btn bg bsm" onclick="restoreCliente(${c.id})" title="Restaurar" aria-label="Restaurar cliente"><i data-lucide="rotate-ccw" style="width:12px;height:12px" aria-hidden="true"></i></button>`
          : `<button class="btn bw bsm" onclick="openClienteModal(${c.id})" title="Editar" aria-label="Editar cliente"><i data-lucide="pencil" style="width:12px;height:12px" aria-hidden="true"></i></button>
             <button class="btn bd bsm" onclick="deleteCliente(${c.id})" title="Eliminar" aria-label="Eliminar cliente"><i data-lucide="trash-2" style="width:12px;height:12px" aria-hidden="true"></i></button>`
        }
      </td></tr>`;
  }).join('');

  const activeCount = state.clientes.filter(c => c.activo !== false).length;
  badge(activeCount + ' clientes');
  refreshIcons(tbody);
  initMobileRows(tbody);
  _updatePagBar(shown, total);
}

function _updatePagBar(shown, total) {
  const bar = document.getElementById('cli-pag');
  if (!bar) return;
  if (total <= 50) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = `
    <div class="pg-info">Mostrando <b>${shown}</b> de <b>${total}</b> clientes</div>
    ${shown < total
      ? `<button class="pg-more" onclick="loadMoreClientes()"><i data-lucide="chevron-down" style="width:13px;height:13px" aria-hidden="true"></i> Cargar 50 más</button>`
      : `<span class="pg-info">Todos mostrados</span>`
    }`;
  refreshIcons(bar);
}

export function exportClientes() {
  const active = state.clientes.filter(c => c.activo !== false);
  if (!active.length) return toast('No hay clientes para exportar', 'er');
  const headers = ['ID', 'Nombre', 'Teléfono', 'Dirección', 'Municipio', 'Método Pago', 'Pedido'];
  const rows = active.map(c => [c.id, `"${c.nombre.replace(/"/g, '""')}"`, c.numero, `"${c.direccion.replace(/"/g, '""')}"`, c.municipio, c.metodoPago, c.numPedido || '']);
  downloadCSV([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), `clientes_moonlighting_${todayStr()}.csv`);
  toast('Listado de clientes exportado');
}
