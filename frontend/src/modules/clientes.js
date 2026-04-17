import { state, cFromDb, cToDb } from '../state.js';
import { api } from '../api.js';
import { esc, muniColor, pillPago, todayStr, downloadCSV } from '../utils.js';
import { toast, openOv, closeOv, badge } from '../ui.js';
import { renderDash } from './dashboard.js';
import { PAGO_IC } from '../constants.js';
import { refreshIcons } from '../icons.js';
import { updateMapMarkers } from './mapa.js';

let _showInactive = false;
let _allLoaded = false; // true cuando ya se cargaron inactivos

async function geocode(address) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(address)}&limit=1`, { headers: { 'Accept-Language': 'es', 'User-Agent': 'Moonlighting/4.0' } });
  const data = await res.json();
  if (data && data.length) { const item = data[0]; return { lat: +item.lat, lng: +item.lon, municipio: normMuni(item.address) }; }
  return null;
}
function normMuni(a) {
  let raw = '';
  for (const k of ['city', 'town', 'municipality', 'county', 'state_district']) if (a[k]) { raw = a[k]; break; }
  if (!raw) return 'Desconocido';
  raw = raw.replace(/^Municipio\s+(de\s+)?/i, '').trim();
  const known = ['Monterrey', 'San Pedro Garza García', 'Guadalupe', 'San Nicolás de los Garza', 'Apodaca', 'General Escobedo', 'Santa Catarina', 'García'];
  return known.find(k => k.toLowerCase() === raw.toLowerCase()) || known.find(k => raw.toLowerCase().includes(k.toLowerCase().split(' ')[0])) || raw;
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
  if (addressChanged) {
    btn.innerHTML = '<span class="sp"></span> Geocodificando…';
    try { const g = await geocode(dir); if (g) { lat = g.lat; lng = g.lng; municipio = g.municipio; } } catch (_) {}
  }
  const updated = { ...state.clientes[ci], nombre, numero, direccion: dir, metodoPago: pago, numPedido: np, lat, lng, municipio };
  try {
    await api.clientes.update(id, cToDb(updated));
    state.clientes[ci] = updated;
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
  if (!confirm(`¿Eliminar a ${c?.nombre || 'este cliente'}? Quedará inactivo y no aparecerá en la lista.`)) return;
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
  const q = (document.getElementById('qc')?.value || '').toLowerCase();
  const tbody = document.getElementById('tbc'), empty = document.getElementById('ec');

  // Sincronizar botón de toggle
  const btn = document.getElementById('btn-toggle-inactive');
  if (btn) {
    btn.classList.toggle('on', _showInactive);
    btn.title = _showInactive ? 'Ocultar eliminados' : 'Mostrar eliminados';
  }

  let list = state.clientes.filter(c => {
    if (!_showInactive && c.activo === false) return false;
    return c.nombre.toLowerCase().includes(q) || String(c.id).includes(q)
      || (c.numero || '').toLowerCase().includes(q)
      || (c.direccion || '').toLowerCase().includes(q)
      || (c.municipio || '').toLowerCase().includes(q);
  });

  if (!list.length) { tbody.innerHTML = ''; empty.style.display = 'block'; refreshIcons(empty); return; }
  empty.style.display = 'none';

  tbody.innerHTML = list.map(c => {
    const col = muniColor(c.municipio);
    const inactive = c.activo === false;
    return `<tr${inactive ? ' style="opacity:0.5"' : ''}>
      <td data-label="ID"><span class="pill pi">#${c.id}</span></td>
      <td data-label="Nombre" class="bold">${esc(c.nombre)}${inactive ? ' <span style="font-size:10px;color:var(--err);font-weight:400">(eliminado)</span>' : ''}</td>
      <td data-label="Teléfono" class="nw">${esc(c.numero || c.telefono || '—')}</td>
      <td data-label="Dirección"><span class="ell" title="${esc(c.direccion)}">${esc(c.direccion || '—')}</span></td>
      <td data-label="Municipio" class="nw"><span style="display:inline-flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${col};display:inline-block;flex-shrink:0"></span><span style="font-size:12px">${esc(c.municipio || '—')}</span></span></td>
      <td data-label="Pago" id="pago-${c.id}" ${!inactive ? `onclick="editPago(${c.id})" style="cursor:pointer" title="Click para cambiar"` : ''}>${pillPago(c.metodoPago)}</td>
      <td data-label="Pedido">${c.numPedido ? `<code>${esc(c.numPedido)}</code>` : '<span class="mu">—</span>'}</td>
      <td class="nw">
        ${inactive
          ? `<button class="btn bg bsm" onclick="restoreCliente(${c.id})" title="Restaurar"><i data-lucide="rotate-ccw" style="width:12px;height:12px"></i></button>`
          : `<button class="btn bw bsm" onclick="openClienteModal(${c.id})" title="Editar"><i data-lucide="pencil" style="width:12px;height:12px"></i></button>
             <button class="btn bd bsm" onclick="deleteCliente(${c.id})" title="Eliminar"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button>`
        }
      </td></tr>`;
  }).join('');

  const activeCount = state.clientes.filter(c => c.activo !== false).length;
  badge(activeCount + ' clientes');
  refreshIcons(tbody);
}

export function exportClientes() {
  const active = state.clientes.filter(c => c.activo !== false);
  if (!active.length) return toast('No hay clientes para exportar', 'er');
  const headers = ['ID', 'Nombre', 'Teléfono', 'Dirección', 'Municipio', 'Método Pago', 'Pedido'];
  const rows = active.map(c => [c.id, `"${c.nombre.replace(/"/g, '""')}"`, c.numero, `"${c.direccion.replace(/"/g, '""')}"`, c.municipio, c.metodoPago, c.numPedido || '']);
  downloadCSV([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), `clientes_moonlighting_${todayStr()}.csv`);
  toast('Listado de clientes exportado');
}
