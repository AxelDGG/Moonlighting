import { state, isAdmin } from '../state.js';
import { api } from '../api.js';
import { esc } from '../utils.js';
import { toast, confirmDialog } from '../ui.js';
import { refreshIcons } from '../icons.js';

const PERM_LABELS = {
  ver_dashboard:   'Dashboard',
  ver_metricas:    'Métricas',
  ver_almacen:     'Almacén',
  ver_calendario:  'Calendario',
  ver_mapa:        'Mapa',
  crear_tecnicos:  'Crear/editar técnicos',
  ver_porcentajes: 'Ver % de ganancias',
};

let _profiles = [];
let _addMode = false;

export async function renderConfiguracion() {
  const tab = document.getElementById('tab-configuracion');
  if (!tab) return;

  if (!isAdmin()) {
    tab.innerHTML = '<div style="padding:24px;color:var(--err)">Sin acceso.</div>';
    return;
  }

  const inp = 'width:100%;padding:8px 12px;border:1px solid var(--bo);border-radius:8px;font-size:13px;background:var(--bg);color:var(--text);outline:none;box-sizing:border-box';
  const lbl = 'font-size:12px;font-weight:600;display:block;margin-bottom:4px';

  tab.innerHTML = `<div style="max-width:800px;margin:0 auto">
    <div class="card" style="margin-bottom:16px">
      <div class="ch" style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:700;font-size:15px"><i data-lucide="users" style="width:16px;height:16px;vertical-align:middle;margin-right:6px"></i>Usuarios y permisos</span>
        <button class="btn bp bsm" onclick="addUserProfile()">
          <i data-lucide="user-plus" style="width:13px;height:13px"></i> Agregar usuario
        </button>
      </div>
      <div class="cb" id="cfg-profiles-body">
        <div style="color:var(--mu);font-size:13px">Cargando…</div>
      </div>
    </div>

    <div id="cfg-add-panel" style="display:none;margin-bottom:16px">
      <div class="card">
        <div class="ch"><span style="font-weight:700">Agregar usuario existente</span></div>
        <div class="cb" style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="${lbl}">Email del usuario (debe existir en Supabase Auth)</label>
            <input id="cfg-new-email" type="email" placeholder="correo@ejemplo.com" style="${inp}"/>
          </div>
          <div>
            <label style="${lbl}">Rol</label>
            <select id="cfg-new-role" onchange="_cfgRoleChange(this,'cfg-new')" style="padding:8px 12px;border:1px solid var(--bo);border-radius:8px;font-size:13px;background:var(--bg);color:var(--text);outline:none">
              <option value="gestor">Gestor</option>
              <option value="tecnico">Técnico</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div id="cfg-new-tec-wrap" style="display:none">
            <div style="display:flex;gap:14px;align-items:center;font-size:13px;margin-bottom:10px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="radio" name="cfg-tec-mode" value="existing" checked onchange="_cfgTecModeChange(this)"/> Vincular técnico existente
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="radio" name="cfg-tec-mode" value="new" onchange="_cfgTecModeChange(this)"/> Crear nuevo técnico
              </label>
            </div>
            <div id="cfg-tec-existing-wrap" style="margin-bottom:10px">
              <label style="${lbl}">Técnico</label>
              <select id="cfg-new-tecnico-id" style="${inp}">
                <option value="">— Seleccionar técnico —</option>
                ${(state.tecnicos || []).map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}
              </select>
            </div>
            <div id="cfg-tec-new-wrap" style="display:none;border:1px dashed var(--bo);border-radius:10px;padding:12px;background:var(--bg);margin-bottom:10px">
              <div style="font-size:12px;font-weight:700;color:var(--mu);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Datos del nuevo técnico</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div>
                  <label style="${lbl}">Nombre *</label>
                  <input id="cfg-tn-nombre" type="text" placeholder="Ej: Carlos R." style="${inp}"/>
                </div>
                <div>
                  <label style="${lbl}">Teléfono</label>
                  <input id="cfg-tn-tel" type="tel" placeholder="+52 81 ..." style="${inp}"/>
                </div>
                <div>
                  <label style="${lbl}">Tipo de colaborador</label>
                  <select id="cfg-tn-tipo" style="${inp}">
                    <option value="">— Sin especificar —</option>
                    <option value="interno">Interno</option>
                    <option value="externo">Externo</option>
                    <option value="especialista">Especialista</option>
                  </select>
                </div>
                <div>
                  <label style="${lbl}">Vehículo asignado</label>
                  <select id="cfg-tn-vehiculo" style="${inp}">
                    <option value="">— Sin vehículo —</option>
                    ${(state.vehiculos || []).map(v => `<option value="${esc(v.nombre)}">${esc(v.nombre)}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label style="${lbl}">Comisión instalación (%)</label>
                  <input id="cfg-tn-pct-inst" type="number" min="0" max="100" step="0.1" placeholder="0–100" style="${inp}"/>
                </div>
                <div>
                  <label style="${lbl}">Comisión mantenimiento (%)</label>
                  <input id="cfg-tn-pct-mant" type="number" min="0" max="100" step="0.1" placeholder="0–100" style="${inp}"/>
                </div>
                <div style="grid-column:1 / -1">
                  <label style="${lbl}">Notas</label>
                  <textarea id="cfg-tn-notas" rows="2" placeholder="Observaciones opcionales…" style="${inp};resize:vertical;font-family:inherit"></textarea>
                </div>
                <div style="grid-column:1 / -1;display:flex;align-items:center;gap:8px">
                  <input id="cfg-tn-activo" type="checkbox" checked style="width:15px;height:15px;accent-color:var(--ok)"/>
                  <label for="cfg-tn-activo" style="font-size:13px;cursor:pointer">Técnico activo</label>
                </div>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn bp bsm" onclick="addUserProfile(true)">Guardar</button>
            <button class="btn bg bsm" onclick="addUserProfile(false)">Cancelar</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="ch" style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:700;font-size:15px"><i data-lucide="truck" style="width:16px;height:16px;vertical-align:middle;margin-right:6px"></i>Vehículos</span>
      </div>
      <div class="cb" style="display:flex;flex-direction:column;gap:10px">
        <div id="cfg-veh-list" style="display:flex;flex-direction:column;gap:6px">
          <div style="color:var(--mu);font-size:13px">Cargando…</div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-end;border-top:1px solid var(--bo);padding-top:10px">
          <div style="flex:1">
            <label style="${lbl}">Nombre del vehículo</label>
            <input id="cfg-veh-nombre" type="text" placeholder="Ej: Toyota Hilux 2024" style="${inp}"
                   onkeydown="if(event.key==='Enter'){event.preventDefault();cfgAddVehiculo();}"/>
          </div>
          <button class="btn bp bsm" onclick="cfgAddVehiculo()">
            <i data-lucide="plus" style="width:13px;height:13px"></i> Agregar
          </button>
        </div>
      </div>
    </div>
  </div>`;

  refreshIcons(tab);
  _renderVehiculosList();
  await _loadProfiles();
}

function _renderVehiculosList() {
  const body = document.getElementById('cfg-veh-list');
  if (!body) return;
  const list = state.vehiculos || [];
  if (!list.length) {
    body.innerHTML = '<div style="color:var(--mu);font-size:13px">Sin vehículos registrados.</div>';
    return;
  }
  body.innerHTML = list.map(v =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--bo);border-radius:8px">
      <span style="display:flex;align-items:center;gap:8px;font-size:13px">
        <i data-lucide="truck" style="width:14px;height:14px;color:#64748b"></i>
        <b>${esc(v.nombre)}</b>
      </span>
      <button class="btn bd bsm" onclick="cfgDeleteVehiculo(${v.id})" title="Eliminar">
        <i data-lucide="trash-2" style="width:12px;height:12px"></i>
      </button>
    </div>`
  ).join('');
  refreshIcons(body);
}

function _repopulateVehiculoSelects() {
  const sel = document.getElementById('cfg-tn-vehiculo');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">— Sin vehículo —</option>` +
    (state.vehiculos || []).map(v => `<option value="${esc(v.nombre)}">${esc(v.nombre)}</option>`).join('');
  if (current && (state.vehiculos || []).some(v => v.nombre === current)) sel.value = current;
}

export async function cfgAddVehiculo() {
  const inp = document.getElementById('cfg-veh-nombre');
  const nombre = inp?.value.trim();
  if (!nombre) { toast('Ingresa un nombre', 'er'); return; }
  try {
    const row = await api.vehiculos.create({ nombre });
    if (!state.vehiculos) state.vehiculos = [];
    state.vehiculos.push(row);
    state.vehiculos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (inp) inp.value = '';
    _renderVehiculosList();
    _repopulateVehiculoSelects();
    toast('Vehículo agregado: ' + nombre);
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}

export async function cfgDeleteVehiculo(id) {
  const v = (state.vehiculos || []).find(x => x.id === id);
  const ok = await confirmDialog(`¿Eliminar "${v?.nombre}"?`, {
    title: 'Eliminar vehículo', confirmLabel: 'Eliminar', variant: 'danger',
  });
  if (!ok) return;
  try {
    await api.vehiculos.delete(id);
    state.vehiculos = (state.vehiculos || []).filter(x => x.id !== id);
    _renderVehiculosList();
    _repopulateVehiculoSelects();
    toast('Vehículo eliminado');
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}

async function _loadProfiles() {
  const body = document.getElementById('cfg-profiles-body');
  if (!body) return;
  try {
    _profiles = await api.userProfiles.getAll();
    _renderProfiles();
  } catch (err) {
    const isNotFound = err.message?.toLowerCase().includes('not found') || err.message?.includes('404');
    if (isNotFound) {
      body.innerHTML = `<div style="color:var(--mu);font-size:13px;display:flex;align-items:center;gap:8px;padding:8px 0">
        <i data-lucide="cloud-off" style="width:15px;height:15px;flex-shrink:0"></i>
        Módulo de usuarios no disponible en este entorno.
      </div>`;
      refreshIcons(body);
    } else {
      body.innerHTML = `<div style="color:var(--err);font-size:13px">Error: ${esc(err.message)}</div>`;
    }
  }
}

function _renderProfiles() {
  const body = document.getElementById('cfg-profiles-body');
  if (!body) return;

  if (!_profiles.length) {
    body.innerHTML = '<div style="color:var(--mu);font-size:13px">Sin usuarios registrados.</div>';
    return;
  }

  body.innerHTML = _profiles.map(p => {
    const isCurrentUser = p.id === state.userProfile?.id;
    const perms = p.permissions || {};
    const isTecnico = p.role === 'tecnico';
    const tecLinked = isTecnico && p.tecnico_id
      ? (state.tecnicos || []).find(t => t.id === p.tecnico_id)
      : null;
    const tecOptions = (state.tecnicos || []).map(t =>
      `<option value="${t.id}" ${p.tecnico_id === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`
    ).join('');
    return `
    <div style="border:1px solid var(--bo);border-radius:10px;padding:14px 16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:700;font-size:13.5px">${esc(p.email)}</div>
          <div style="font-size:11px;color:var(--mu);margin-top:2px">ID: ${p.id.slice(0,8)}…${tecLinked ? ` · Técnico: ${esc(tecLinked.nombre)}` : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <select id="role-${p.id}" class="cfg-role-sel" onchange="_cfgRoleChange(this,'${p.id}')" style="padding:5px 10px;border:1px solid var(--bo);border-radius:7px;font-size:12px;background:var(--bg);color:var(--text);outline:none" ${isCurrentUser ? 'disabled' : ''}>
            <option value="gestor" ${p.role === 'gestor' ? 'selected' : ''}>Gestor</option>
            <option value="tecnico" ${p.role === 'tecnico' ? 'selected' : ''}>Técnico</option>
            <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
          ${!isCurrentUser ? `<button class="btn bp bsm" onclick="saveUserProfile('${p.id}')">Guardar</button>` : '<span style="font-size:11px;color:var(--mu)">(tú)</span>'}
        </div>
      </div>
      ${isTecnico ? `
      <div id="tec-wrap-${p.id}" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600;color:var(--mu);display:block;margin-bottom:4px">Técnico vinculado</label>
        <select id="tecnico-id-${p.id}" style="padding:5px 10px;border:1px solid var(--bo);border-radius:7px;font-size:12px;background:var(--bg);color:var(--text);outline:none">
          <option value="">— Sin vincular —</option>${tecOptions}
        </select>
      </div>` : `<div id="tec-wrap-${p.id}" style="display:none"></div>`}
      ${p.role !== 'admin' && !isTecnico ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
        ${Object.entries(PERM_LABELS).map(([key, label]) => {
          const checked = perms[key] !== false;
          return `<label style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;padding:5px 8px;border:1px solid var(--bo);border-radius:7px;background:${checked ? 'var(--ok)18' : 'var(--bg)'}">
            <input type="checkbox" id="perm-${p.id}-${key}" ${checked ? 'checked' : ''} style="accent-color:var(--ok);width:14px;height:14px" onchange="saveUserProfile('${p.id}')"/>
            <span>${label}</span>
          </label>`;
        }).join('')}
      </div>` : p.role === 'admin' ? '<div style="font-size:11px;color:var(--mu);margin-top:2px">Admin — acceso completo</div>' : '<div style="font-size:11px;color:var(--mu)">Acceso solo a pedidos asignados y seguimiento.</div>'}
    </div>`;
  }).join('');

  refreshIcons(body);
}

export async function saveUserProfile(userId) {
  const profile = _profiles.find(p => p.id === userId);
  if (!profile) return;

  const roleEl = document.getElementById('role-' + userId);
  const role = roleEl?.value || profile.role;

  const permissions = {};
  Object.keys(PERM_LABELS).forEach(key => {
    const el = document.getElementById(`perm-${userId}-${key}`);
    if (el) permissions[key] = el.checked;
  });

  const tecnicoIdEl = document.getElementById(`tecnico-id-${userId}`);
  const tecnico_id = tecnicoIdEl?.value ? +tecnicoIdEl.value : null;

  const payload = { role, permissions };
  if (role === 'tecnico') payload.tecnico_id = tecnico_id;

  try {
    await api.userProfiles.update(userId, payload);
    const idx = _profiles.findIndex(p => p.id === userId);
    if (idx !== -1) _profiles[idx] = { ..._profiles[idx], role, permissions, tecnico_id: payload.tecnico_id ?? _profiles[idx].tecnico_id };
    toast('Permisos guardados');
    _renderProfiles();
  } catch (err) {
    toast('Error: ' + err.message, 'er');
  }
}

export async function addUserProfile(confirm = undefined) {
  if (confirm === undefined || confirm === false) {
    _addMode = !_addMode && confirm !== false;
    const panel = document.getElementById('cfg-add-panel');
    if (panel) panel.style.display = _addMode ? '' : 'none';
    return;
  }
  // confirm === true: submit
  const email = document.getElementById('cfg-new-email')?.value.trim();
  const role  = document.getElementById('cfg-new-role')?.value || 'gestor';
  if (!email) { toast('Ingresa un email', 'er'); return; }

  const defaultPerms = role === 'gestor'
    ? { ver_metricas: false, ver_dashboard: false, crear_tecnicos: false, ver_porcentajes: false, ver_almacen: true, ver_calendario: true, ver_mapa: true }
    : role === 'tecnico'
    ? { ver_metricas: false, ver_dashboard: false, crear_tecnicos: false, ver_porcentajes: false, ver_almacen: false, ver_calendario: false, ver_mapa: false }
    : {};

  let tecnico_id = null;
  if (role === 'tecnico') {
    const modeEl = document.querySelector('input[name="cfg-tec-mode"]:checked');
    const mode = modeEl?.value || 'existing';

    if (mode === 'new') {
      const nombre = document.getElementById('cfg-tn-nombre')?.value.trim();
      if (!nombre) { toast('Ingresa el nombre del técnico', 'er'); return; }
      const pctI = document.getElementById('cfg-tn-pct-inst')?.value;
      const pctM = document.getElementById('cfg-tn-pct-mant')?.value;
      const newTecBody = {
        nombre,
        telefono:                 document.getElementById('cfg-tn-tel')?.value.trim() || null,
        tipo_colaborador:         document.getElementById('cfg-tn-tipo')?.value || null,
        porcentaje_instalacion:   pctI !== '' && pctI != null ? parseFloat(pctI) : null,
        porcentaje_mantenimiento: pctM !== '' && pctM != null ? parseFloat(pctM) : null,
        notas:                    document.getElementById('cfg-tn-notas')?.value.trim() || null,
        activo:                   document.getElementById('cfg-tn-activo')?.checked !== false,
        vehiculo:                 document.getElementById('cfg-tn-vehiculo')?.value || null,
      };
      try {
        const createdTec = await api.tecnicos.create(newTecBody);
        if (!state.tecnicos) state.tecnicos = [];
        state.tecnicos.push(createdTec);
        tecnico_id = createdTec.id;
        toast('Técnico creado: ' + nombre);
      } catch (err) {
        toast('Error al crear técnico: ' + err.message, 'er');
        return;
      }
    } else {
      const tecnicoIdEl = document.getElementById('cfg-new-tecnico-id');
      tecnico_id = tecnicoIdEl?.value ? +tecnicoIdEl.value : null;
      if (!tecnico_id) { toast('Selecciona un técnico o crea uno nuevo', 'er'); return; }
    }
  }

  const body = { email, role, permissions: defaultPerms };
  if (tecnico_id) body.tecnico_id = tecnico_id;

  try {
    const created = await api.userProfiles.create(body);
    _profiles.push(created);
    _addMode = false;
    const panel = document.getElementById('cfg-add-panel');
    if (panel) panel.style.display = 'none';
    toast(`Usuario ${email} agregado como ${role}`);
    _renderProfiles();
  } catch (err) {
    toast('Error: ' + err.message, 'er');
  }
}

// Expose to HTML (used by inline onchange)
window._cfgRoleChange = function(sel, userId) {
  const isTec = sel.value === 'tecnico';
  const wrap = document.getElementById('tec-wrap-' + userId) || document.getElementById('cfg-new-tec-wrap');
  if (wrap) wrap.style.display = isTec ? '' : 'none';
};

window._cfgTecModeChange = function(radio) {
  const isNew = radio.value === 'new';
  const existingWrap = document.getElementById('cfg-tec-existing-wrap');
  const newWrap      = document.getElementById('cfg-tec-new-wrap');
  if (existingWrap) existingWrap.style.display = isNew ? 'none' : '';
  if (newWrap)      newWrap.style.display      = isNew ? '' : 'none';
};

export function deleteUserProfile(userId) {
  // No implementamos borrado de perfil desde la UI — el admin puede reasignar roles
  toast('Para eliminar un usuario, hazlo desde Supabase Auth directamente.', 'er');
}
