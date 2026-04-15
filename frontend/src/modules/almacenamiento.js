import { state, aFromDb } from '../state.js';
import { api } from '../api.js';
import { esc, money, fdateShort } from '../utils.js';
import { toast, openOv, closeOv } from '../ui.js';
import { refreshIcons } from '../icons.js';

const catPillHtml = {
  abanico:     `<span class="pill pill-abanico"><i data-lucide="wind" style="width:11px;height:11px"></i> Abanico</span>`,
  persiana:    `<span class="pill pill-persiana"><i data-lucide="layout-template" style="width:11px;height:11px"></i> Tela/Persiana</span>`,
  refacciones: `<span class="pill pill-refacc"><i data-lucide="wrench" style="width:11px;height:11px"></i> Refacciones</span>`,
};

const lugarIcoHtml = {
  'Bodega':          `<i data-lucide="warehouse" style="width:13px;height:13px;color:#64748b"></i>`,
  'Casa':            `<i data-lucide="home"      style="width:13px;height:13px;color:#64748b"></i>`,
  'Camioneta Nueva': `<i data-lucide="truck"     style="width:13px;height:13px;color:#64748b"></i>`,
  'Camioneta Vieja': `<i data-lucide="truck"     style="width:13px;height:13px;color:#94a3b8"></i>`,
};

export function renderAlmacenamiento() {
  const q      = (document.getElementById('qa')?.value || '').toLowerCase();
  const catFil = document.getElementById('fa-cat')?.value || '';
  const tbody  = document.getElementById('tba');
  const empty  = document.getElementById('ea');
  if (!tbody) return;

  const list = state.almacenamiento.filter(a => {
    const matchQ   = !q || a.modelo.toLowerCase().includes(q) || a.lugar.toLowerCase().includes(q) || (a.notas || '').toLowerCase().includes(q);
    const matchCat = !catFil || a.categoria === catFil;
    return matchQ && matchCat;
  });

  if (!list.length) { tbody.innerHTML = ''; empty.style.display = 'block'; refreshIcons(empty); return; }
  empty.style.display = 'none';

  tbody.innerHTML = list
    .sort((a, b) => a.modelo.localeCompare(b.modelo) || a.lugar.localeCompare(b.lugar))
    .map(a => {
      const catPill = catPillHtml[a.categoria] || `<span class="pill">${esc(a.categoria)}</span>`;
      const lugarIc = lugarIcoHtml[a.lugar] || '';
      const stockCl = a.cantidad > 3 ? 'color:#15803d;font-weight:700' : a.cantidad > 0 ? 'color:#92400e;font-weight:700' : 'color:#ef4444;font-weight:700';
      const unidad  = a.categoria === 'persiana' ? '/m²' : '/ud';
      const dateStr = a.updatedAt ? fdateShort(a.updatedAt.substring(0, 10)) : '—';
      return `<tr>
        <td><span class="pill pi">#${a.id}</span></td>
        <td><span class="bold">${esc(a.modelo)}</span></td>
        <td>${catPill}</td>
        <td style="display:flex;align-items:center;gap:5px">${lugarIc} ${esc(a.lugar)}</td>
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
  if (id !== null) {
    const a = state.almacenamiento.find(x => x.id === id); if (!a) return;
    document.getElementById('a-eid').value    = id;
    document.getElementById('a-modelo').value = a.modelo;
    document.getElementById('a-cat').value    = a.categoria;
    document.getElementById('a-lugar').value  = a.lugar;
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
