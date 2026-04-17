import { state, isAdmin } from '../state.js';
import { api } from '../api.js';
import { esc } from '../utils.js';
import { toast } from '../ui.js';
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

    <div id="cfg-add-panel" style="display:none">
      <div class="card">
        <div class="ch"><span style="font-weight:700">Agregar usuario existente</span></div>
        <div class="cb" style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Email del usuario (debe existir en Supabase Auth)</label>
            <input id="cfg-new-email" type="email" placeholder="correo@ejemplo.com" style="width:100%;padding:8px 12px;border:1px solid var(--bo);border-radius:8px;font-size:13px;background:var(--bg);color:var(--text);outline:none;box-sizing:border-box"/>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Rol</label>
            <select id="cfg-new-role" style="padding:8px 12px;border:1px solid var(--bo);border-radius:8px;font-size:13px;background:var(--bg);color:var(--text);outline:none">
              <option value="gestor">Gestor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn bp bsm" onclick="addUserProfile(true)">Guardar</button>
            <button class="btn bg bsm" onclick="addUserProfile(false)">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  refreshIcons(tab);
  await _loadProfiles();
}

async function _loadProfiles() {
  const body = document.getElementById('cfg-profiles-body');
  if (!body) return;
  try {
    _profiles = await api.userProfiles.getAll();
    _renderProfiles();
  } catch (err) {
    body.innerHTML = `<div style="color:var(--err);font-size:13px">Error: ${esc(err.message)}</div>`;
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
    return `
    <div style="border:1px solid var(--bo);border-radius:10px;padding:14px 16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-weight:700;font-size:13.5px">${esc(p.email)}</div>
          <div style="font-size:11px;color:var(--mu);margin-top:2px">ID: ${p.id.slice(0,8)}…</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <select id="role-${p.id}" class="cfg-role-sel" style="padding:5px 10px;border:1px solid var(--bo);border-radius:7px;font-size:12px;background:var(--bg);color:var(--text);outline:none" ${isCurrentUser ? 'disabled' : ''}>
            <option value="gestor" ${p.role === 'gestor' ? 'selected' : ''}>Gestor</option>
            <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
          ${!isCurrentUser ? `<button class="btn bp bsm" onclick="saveUserProfile('${p.id}')">Guardar</button>` : '<span style="font-size:11px;color:var(--mu)">(tú)</span>'}
        </div>
      </div>
      ${p.role !== 'admin' ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
        ${Object.entries(PERM_LABELS).map(([key, label]) => {
          const checked = perms[key] !== false;
          return `<label style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;padding:5px 8px;border:1px solid var(--bo);border-radius:7px;background:${checked ? 'var(--ok)18' : 'var(--bg)'}">
            <input type="checkbox" id="perm-${p.id}-${key}" ${checked ? 'checked' : ''} style="accent-color:var(--ok);width:14px;height:14px" onchange="saveUserProfile('${p.id}')"/>
            <span>${label}</span>
          </label>`;
        }).join('')}
      </div>` : '<div style="font-size:11px;color:var(--mu);margin-top:2px">Admin — acceso completo</div>'}
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

  try {
    await api.userProfiles.update(userId, { role, permissions });
    const idx = _profiles.findIndex(p => p.id === userId);
    if (idx !== -1) _profiles[idx] = { ..._profiles[idx], role, permissions };
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
    : {};

  try {
    const created = await api.userProfiles.create({ email, role, permissions: defaultPerms });
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

export function deleteUserProfile(userId) {
  // No implementamos borrado de perfil desde la UI — el admin puede reasignar roles
  toast('Para eliminar un usuario, hazlo desde Supabase Auth directamente.', 'er');
}
