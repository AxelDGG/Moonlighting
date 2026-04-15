import { state } from '../state.js';
import { api } from '../api.js';
import { esc } from '../utils.js';
import { toast, openOv, closeOv } from '../ui.js';
import { refreshIcons } from '../icons.js';

// ── LISTA ─────────────────────────────────────────────────────────────────────
export function renderTecnicosList() {
  const tbody = document.getElementById('tb-tec');
  if (!tbody) return;
  const list = state.tecnicos || [];
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--mu);font-size:12px;padding:20px">Sin técnicos registrados</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(t => {
    const tipos = { interno: '#dbeafe:#1d4ed8', externo: '#fef3c7:#92400e', especialista: '#f3e8ff:#7c3aed' };
    const [tbg, tco] = (tipos[t.tipo_colaborador] || '#f1f5f9:#475569').split(':');
    const tipoBadge = t.tipo_colaborador
      ? `<span class="pill" style="background:${tbg};color:${tco};font-size:10px">${esc(t.tipo_colaborador)}</span>`
      : '<span class="mu" style="font-size:11px">—</span>';
    const activoBadge = t.activo !== false
      ? `<span class="pill" style="background:#dcfce7;color:#15803d;font-size:10px">Activo</span>`
      : `<span class="pill" style="background:#fee2e2;color:#dc2626;font-size:10px">Inactivo</span>`;
    const pcts = [];
    if (t.porcentaje_instalacion != null)   pcts.push(`Inst ${t.porcentaje_instalacion}%`);
    if (t.porcentaje_mantenimiento != null) pcts.push(`Mant ${t.porcentaje_mantenimiento}%`);
    return `<tr>
      <td><span class="bold">${esc(t.nombre)}</span></td>
      <td style="font-size:12px">${t.telefono ? esc(t.telefono) : '<span class="mu">—</span>'}</td>
      <td>${tipoBadge}</td>
      <td style="font-size:11px;color:var(--mu)">${pcts.length ? pcts.join(' · ') : '—'}</td>
      <td>${activoBadge}</td>
      <td class="nw">
        <button class="btn bw bsm" onclick="openTecnicoModal(${t.id})" title="Editar">
          <i data-lucide="pencil" style="width:12px;height:12px"></i>
        </button>
        <button class="btn bd bsm" onclick="deleteTecnico(${t.id})" title="Desactivar">
          <i data-lucide="trash-2" style="width:12px;height:12px"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
  refreshIcons(tbody);
}

// ── MANAGER PANEL ─────────────────────────────────────────────────────────────
export function openTecnicosManager() {
  renderTecnicosList();
  openOv('ov-tecnicos');
}

// ── MODAL CREATE/EDIT ─────────────────────────────────────────────────────────
export function openTecnicoModal(id = null) {
  document.getElementById('ft').reset();
  document.getElementById('t-eid').value = '';
  document.getElementById('mt-title').textContent = id ? 'Editar Técnico' : 'Nuevo Técnico';
  document.getElementById('t-activo').checked = true;
  if (id !== null) {
    const t = (state.tecnicos || []).find(x => x.id === id);
    if (!t) return;
    document.getElementById('t-eid').value      = id;
    document.getElementById('t-nombre').value   = t.nombre || '';
    document.getElementById('t-tel').value      = t.telefono || '';
    document.getElementById('t-tipo').value     = t.tipo_colaborador || '';
    document.getElementById('t-pct-inst').value = t.porcentaje_instalacion ?? '';
    document.getElementById('t-pct-mant').value = t.porcentaje_mantenimiento ?? '';
    document.getElementById('t-notas').value    = t.notas || '';
    document.getElementById('t-activo').checked = t.activo !== false;
  }
  openOv('ov-tecnico');
}

// ── SUBMIT ────────────────────────────────────────────────────────────────────
export async function submitTecnico(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-st');
  btn.innerHTML = '<span class="sp"></span> Guardando…'; btn.disabled = true;
  const eid     = document.getElementById('t-eid').value;
  const nombre  = document.getElementById('t-nombre').value.trim();
  const tel     = document.getElementById('t-tel').value.trim() || null;
  const tipo    = document.getElementById('t-tipo').value || null;
  const pctI    = document.getElementById('t-pct-inst').value !== '' ? parseFloat(document.getElementById('t-pct-inst').value) : null;
  const pctM    = document.getElementById('t-pct-mant').value !== '' ? parseFloat(document.getElementById('t-pct-mant').value) : null;
  const notas   = document.getElementById('t-notas').value.trim() || null;
  const activo  = document.getElementById('t-activo').checked;
  const body = {
    nombre,
    telefono:                tel,
    tipo_colaborador:        tipo,
    porcentaje_instalacion:  pctI,
    porcentaje_mantenimiento: pctM,
    notas,
    activo,
  };
  try {
    if (eid) {
      await api.tecnicos.update(+eid, body);
      const i = (state.tecnicos || []).findIndex(x => x.id === +eid);
      if (i !== -1) state.tecnicos[i] = { ...state.tecnicos[i], ...body };
      toast('Técnico actualizado');
    } else {
      const row = await api.tecnicos.create(body);
      if (!state.tecnicos) state.tecnicos = [];
      state.tecnicos.push(row);
      toast('Técnico creado: ' + nombre);
    }
    renderTecnicosList();
    closeOv('ov-tecnico');
  } catch (err) { toast('Error: ' + err.message, 'er'); }
  btn.innerHTML = 'Guardar'; btn.disabled = false;
}

// ── DELETE (desactiva, no borra) ──────────────────────────────────────────────
export async function deleteTecnico(id) {
  const t = (state.tecnicos || []).find(x => x.id === id);
  if (!confirm(`¿Desactivar a ${t?.nombre || 'este técnico'}?`)) return;
  try {
    await api.tecnicos.delete(id);
    const i = (state.tecnicos || []).findIndex(x => x.id === id);
    if (i !== -1) state.tecnicos[i] = { ...state.tecnicos[i], activo: false };
    renderTecnicosList();
    toast('Técnico desactivado');
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}
