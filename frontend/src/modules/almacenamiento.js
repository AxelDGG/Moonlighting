import { state, aFromDb } from '../state.js';
import { api } from '../api.js';
import { esc, money, fdateShort } from '../utils.js';
import { toast, openOv, closeOv } from '../ui.js';
import { refreshIcons } from '../icons.js';

const FIXED_ZONAS = ['Bodega', 'Casa'];

const catPillHtml = {
  abanico:     `<span class="pill pill-abanico"><i data-lucide="wind" style="width:11px;height:11px"></i> Abanico</span>`,
  persiana:    `<span class="pill pill-persiana"><i data-lucide="layout-template" style="width:11px;height:11px"></i> Tela/Persiana</span>`,
  refacciones: `<span class="pill pill-refacc"><i data-lucide="wrench" style="width:11px;height:11px"></i> Refacciones</span>`,
};

function lugarIcoHtml(lugar) {
  if (!lugar) return '';
  const l = lugar.toLowerCase();
  if (l.includes('bodega'))   return `<i data-lucide="warehouse" style="width:13px;height:13px;color:#64748b"></i>`;
  if (l.includes('casa'))     return `<i data-lucide="home"      style="width:13px;height:13px;color:#64748b"></i>`;
  if (l.includes('camioneta') || l.includes('van') || l.includes('truck'))
    return `<i data-lucide="truck" style="width:13px;height:13px;color:#64748b"></i>`;
  return `<i data-lucide="box" style="width:13px;height:13px;color:#94a3b8"></i>`;
}

function _lugarOptions(selected = '') {
  const all = [...FIXED_ZONAS, ...(state.vehiculos || []).map(v => v.nombre)];
  return all.map(z => `<option value="${esc(z)}" ${z === selected ? 'selected' : ''}>${esc(z)}</option>`).join('');
}

export function renderAlmacenamiento() {
  const q      = (document.getElementById('qa')?.value || '').toLowerCase();
  const catFil = document.getElementById('fa-cat')?.value || '';
  const tbody  = document.getElementById('tba');
  const empty  = document.getElementById('ea');
  if (!tbody) return;

  const list = state.almacenamiento.filter(a => {
    const matchQ   = !q || a.modelo.toLowerCase().includes(q) || (a.lugar || '').toLowerCase().includes(q) || (a.notas || '').toLowerCase().includes(q);
    const matchCat = !catFil || a.categoria === catFil;
    return matchQ && matchCat;
  });

  if (!list.length) { tbody.innerHTML = ''; empty.style.display = 'block'; refreshIcons(empty); return; }
  empty.style.display = 'none';

  tbody.innerHTML = list
    .sort((a, b) => a.modelo.localeCompare(b.modelo) || (a.lugar || '').localeCompare(b.lugar || ''))
    .map(a => {
      const catPill = catPillHtml[a.categoria] || `<span class="pill">${esc(a.categoria || '—')}</span>`;
      const lugarIc = lugarIcoHtml(a.lugar);
      const stockCl = a.cantidad > 3 ? 'color:#15803d;font-weight:700' : a.cantidad > 0 ? 'color:#92400e;font-weight:700' : 'color:#ef4444;font-weight:700';
      const unidad  = a.categoria === 'persiana' ? '/m²' : '/ud';
      const dateStr = a.updatedAt ? fdateShort(a.updatedAt.substring(0, 10)) : '—';
      return `<tr>
        <td><span class="pill pi">#${a.id}</span></td>
        <td><span class="bold">${esc(a.modelo)}</span></td>
        <td>${catPill}</td>
        <td style="display:flex;align-items:center;gap:5px">${lugarIc} ${esc(a.lugar || '—')}</td>
        <td class="tr" style="${stockCl}">${a.cantidad}</td>
        <td class="nw">${money(a.precio)}<span style="font-size:10px;color:var(--mu)">${unidad}</span></td>
        <td style="font-size:11px;color:var(--mu);max-width:180px">${a.notas ? esc(a.notas) : '<span class="mu">—</span>'}</td>
        <td style="font-size:11px;color:var(--mu)" class="nw">${dateStr}</td>
        <td class="nw">
          <button class="btn bw bsm" onclick="openAlmacenModal(${a.id})" title="Editar">
            <i data-lucide="pencil" style="width:12px;height:12px"></i>
          </button>
          <button class="btn bd bsm" onclick="deleteAlmacen(${a.id})" title="Eliminar">
            <i data-lucide="trash-2" style="width:12px;height:12px"></i>
          </button>
        </td>
      </tr>`;
    }).join('');

  refreshIcons(tbody);
}

export function openAlmacenModal(id = null) {
  document.getElementById('fa').reset();
  document.getElementById('a-eid').value = '';
  document.getElementById('ma-t').textContent = id ? 'Editar Inventario' : 'Nueva Entrada';

  // Populate lugar dynamically
  const lugarSel = document.getElementById('a-lugar');
  if (lugarSel) {
    const current = id ? (state.almacenamiento.find(x => x.id === id)?.lugar || '') : '';
    lugarSel.innerHTML = _lugarOptions(current);
  }

  if (id !== null) {
    const a = state.almacenamiento.find(x => x.id === id); if (!a) return;
    document.getElementById('a-eid').value    = id;
    document.getElementById('a-modelo').value = a.modelo;
    document.getElementById('a-cat').value    = a.categoria;
    document.getElementById('a-qty').value    = a.cantidad;
    document.getElementById('a-precio').value = a.precio;
    document.getElementById('a-notas').value  = a.notas || '';
  }
  openOv('ov-almacen');
}

export async function submitAlmacen(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-sa');
  btn.innerHTML = '<span class="sp"></span> Guardando…'; btn.disabled = true;
  const eid    = document.getElementById('a-eid').value;
  const modelo = document.getElementById('a-modelo').value.trim();
  const cat    = document.getElementById('a-cat').value;
  const lugar  = document.getElementById('a-lugar').value;
  const qty    = parseInt(document.getElementById('a-qty').value);
  const precio = parseFloat(document.getElementById('a-precio').value);
  const notas  = document.getElementById('a-notas').value.trim() || null;
  try {
    const body = { modelo, categoria: cat, lugar, cantidad: qty, precio, notas };
    if (eid) {
      await api.almacenamiento.update(+eid, body);
      const i = state.almacenamiento.findIndex(x => x.id === +eid);
      if (i !== -1) state.almacenamiento[i] = { ...state.almacenamiento[i], ...body, updatedAt: new Date().toISOString() };
      toast('Inventario actualizado');
    } else {
      const row = await api.almacenamiento.create(body);
      state.almacenamiento.push(aFromDb(row));
      toast('Entrada creada');
    }
    renderAlmacenamiento();
    closeOv('ov-almacen');
  } catch (err) { toast('Error: ' + err.message, 'er'); }
  btn.innerHTML = 'Guardar'; btn.disabled = false;
}

export async function deleteAlmacen(id) {
  if (!confirm('¿Eliminar esta entrada de inventario?')) return;
  try {
    await api.almacenamiento.delete(id);
    state.almacenamiento = state.almacenamiento.filter(x => x.id !== id);
    renderAlmacenamiento();
    toast('Entrada eliminada', 'er');
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}

// ── GESTOR DE VEHÍCULOS ────────────────────────────────────────────────────────
export function openVehiculosManager() {
  _renderVehiculosList();
  openOv('ov-vehiculos');
}

function _renderVehiculosList() {
  const body = document.getElementById('veh-list');
  if (!body) return;
  const list = state.vehiculos || [];
  body.innerHTML = list.map(v =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--bo);border-radius:8px;margin-bottom:6px">
      <span style="display:flex;align-items:center;gap:8px"><i data-lucide="truck" style="width:14px;height:14px;color:#64748b"></i> <b>${esc(v.nombre)}</b></span>
      <button class="btn bd bsm" onclick="deleteVehiculo(${v.id})" title="Eliminar"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button>
    </div>`
  ).join('') || '<div style="color:var(--mu);font-size:13px">Sin vehículos registrados.</div>';
  refreshIcons(body);
}

export async function submitVehiculo(e) {
  e.preventDefault();
  const inp = document.getElementById('veh-nombre');
  const nombre = inp?.value.trim();
  if (!nombre) return toast('Ingresa un nombre', 'er');
  try {
    const row = await api.vehiculos.create({ nombre });
    state.vehiculos.push(row);
    inp.value = '';
    _renderVehiculosList();
    toast('Vehículo agregado: ' + nombre);
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}

export async function deleteVehiculo(id) {
  const v = state.vehiculos.find(x => x.id === id);
  if (!confirm(`¿Eliminar "${v?.nombre}"?`)) return;
  try {
    await api.vehiculos.delete(id);
    state.vehiculos = state.vehiculos.filter(x => x.id !== id);
    _renderVehiculosList();
    toast('Vehículo eliminado');
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}
