import { login, logout, checkSession } from './auth.js';
import { api } from './api.js';
import { state, cFromDb, pFromDb, smFromDb, aFromDb, isAdmin, canDo } from './state.js';
import { toast, setLoader, setDbStatus, openOv, closeOv, badge, toggleSidebar, initOverlayListeners } from './ui.js';

import { renderDash } from './modules/dashboard.js';
import { renderClientes, openClienteModal, submitCliente, editPago, savePago, deleteCliente, restoreCliente, exportClientes, toggleShowInactive } from './modules/clientes.js';
import { renderPedidos, openPedidoModal, submitPedido, deletePedido, exportPedidos, updatePF, calcExtra, setCliMode,
         calcPedidoTotal, onModeloInput, onModeloKey, onModeloBlur, selectModelo,
         onTelaInput, onTelaKey, onTelaBlur, selectTela, toggleShowCancelled,
         triggerNcGeoPreview, onNcUrlInput } from './modules/pedidos.js';
import { renderCal, calNav, calToday, setCalMode, goToDay, calSetTipo, calSetFilter, calToggleCancelados, calResetFilter } from './modules/calendar.js';
import { openTrackModal, trackAction, saveMotivo, cancelService } from './modules/tracking.js';
import { initMap, toggleMuni, onMfInput, onMfFocus, onMfBlur, onMfKey, selectAcItem, toggleMapTipo, resetMapFilter, onMfSelect,
         generateDayRoute, onRouteDayChange, openRouteConfig, saveRouteConfig, closeRouteConfig, onRouteConfigChange,
         viewRoute, deleteRoute, saveCurrentRoute, renderRoutesList } from './modules/mapa.js';
import { renderMetricas, generateFeedback } from './modules/metricas.js';
import { renderAlmacenamiento, openAlmacenModal, submitAlmacen, deleteAlmacen, openVehiculosManager, submitVehiculo, deleteVehiculo } from './modules/almacenamiento.js';
import { openTecnicosManager, openTecnicoModal, submitTecnico, deleteTecnico } from './modules/tecnicos.js';
import { renderConfiguracion, saveUserProfile, addUserProfile, deleteUserProfile, cfgAddVehiculo, cfgDeleteVehiculo } from './modules/configuracion.js';

/* ── TAB TITLES ── */
const TAB_TITLES = {
  dashboard:      'Dashboard',
  clientes:       'Clientes',
  pedidos:        'Pedidos',
  almacen:        'Almacén',
  cal:            'Calendario',
  mapa:           'Mapa',
  metricas:       'Métricas',
  configuracion:  'Configuración',
};

/* ── SHOW TAB ── */
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.ni-item').forEach(n => n.classList.remove('active'));
  const tab = document.getElementById('tab-' + name);
  const nav = document.getElementById('nav-' + name);
  if (tab) tab.classList.add('active');
  if (nav) nav.classList.add('active');
  document.getElementById('ptitle').textContent = TAB_TITLES[name] || name;

  if      (name === 'dashboard')     renderDash();
  else if (name === 'clientes')      renderClientes();
  else if (name === 'pedidos')       renderPedidos();
  else if (name === 'almacen')       renderAlmacenamiento();
  else if (name === 'cal')           renderCal();
  else if (name === 'mapa')          initMap();
  else if (name === 'metricas')      renderMetricas();
  else if (name === 'configuracion') renderConfiguracion();

  // Close sidebar on mobile
  const sidebar = document.querySelector('.sidebar');
  if (sidebar?.classList.contains('open')) toggleSidebar();
}

/* ── APPLY ROLE RESTRICTIONS ── */
function applyRoleRestrictions() {
  const profile = state.userProfile;
  if (!profile) return;

  const admin    = profile.role === 'admin';
  const isTec    = profile.role === 'tecnico';
  const perms    = profile.permissions || {};

  const hide = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  };

  if (isTec) {
    // Técnico: solo ve Pedidos
    ['nav-dashboard', 'nav-almacen', 'nav-cal', 'nav-mapa', 'nav-metricas'].forEach(hide);
    document.getElementById('nav-configuracion')?.style && (document.getElementById('nav-configuracion').style.display = 'none');
    // Guardar nombre del técnico asignado para filtrar pedidos
    const tec = profile.tecnico_id ? state.tecnicos.find(t => t.id === profile.tecnico_id) : null;
    state._tecnicoNombre = tec?.nombre || null;
    showTab('pedidos');
    return;
  }

  // Dashboard: gestor sin permiso
  if (!admin && perms.ver_dashboard === false) hide('nav-dashboard');

  // Métricas: gestor sin permiso
  if (!admin && perms.ver_metricas === false) hide('nav-metricas');

  // Almacén: gestor sin permiso
  if (!admin && perms.ver_almacen === false) hide('nav-almacen');

  // Calendario: gestor sin permiso
  if (!admin && perms.ver_calendario === false) hide('nav-cal');

  // Mapa: gestor sin permiso
  if (!admin && perms.ver_mapa === false) hide('nav-mapa');

  // Configuración: solo admin
  const navCfg = document.getElementById('nav-configuracion');
  if (navCfg) navCfg.style.display = admin ? '' : 'none';

  // Porcentajes de técnicos
  if (!admin && perms.ver_porcentajes === false) {
    document.querySelectorAll('.tec-porcentaje').forEach(el => el.style.display = 'none');
  }

  // Botón crear técnico
  if (!admin && perms.crear_tecnicos === false) {
    document.querySelectorAll('.btn-crear-tecnico').forEach(el => el.style.display = 'none');
  }

  const firstAvail = admin ? 'dashboard'
    : perms.ver_dashboard !== false ? 'dashboard'
    : 'clientes';

  showTab(firstAvail);
}

/* ── LOAD ALL DATA ── */
async function loadAll() {
  setLoader(true, 'Cargando datos…');
  try {
    const [clientes, pedidos] = await Promise.all([
      api.clientes.getAll(),
      api.pedidos.getAll(),
    ]);
    state.clientes = clientes.map(cFromDb);
    state.pedidos  = pedidos.map(pFromDb);
    setDbStatus(true);
    badge(state.pedidos.length + ' pedidos');
  } catch (err) {
    toast('Error cargando datos: ' + err.message, 'er');
    setDbStatus(false);
  } finally {
    setLoader(false);
  }

  // Carga datos legacy en paralelo — fallan silenciosamente si la tabla no existe
  try {
    const metricas = await api.metricas.getAll();
    state.servicios_metricas = metricas.map(smFromDb);
  } catch { /* tabla servicios_metricas puede no existir */ }

  try {
    const almacenamiento = await api.almacenamiento.getAll();
    state.almacenamiento = almacenamiento.map(aFromDb);
  } catch { /* tabla almacenamiento puede no existir */ }

  try {
    state.tecnicos = await api.tecnicos.getAll();
  } catch { /* tabla tecnicos puede no existir */ }

  try {
    state.routeConfigs = await api.routeConfigs.getAll();
  } catch { /* tabla route_configs puede no existir */ }

  try {
    state.vehiculos = await api.vehiculos.getAll();
  } catch { /* tabla vehiculos puede no existir */ }
}

/* ── OUTLOOK SYNC ── */
async function syncOutlook(pedidoId) {
  try {
    setLoader(true, 'Sincronizando con Outlook…');
    await api.calendar.sync(pedidoId);
    await loadAll();
    renderCal();
    toast('Sincronizado con Outlook', 'ok');
  } catch (err) {
    toast('Error al sincronizar con Outlook: ' + err.message, 'er');
  } finally {
    setLoader(false);
  }
}

/* ── AUTH FLOW ── */
async function doLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const errEl = document.getElementById('l-err');
  errEl.style.display = 'none';
  btn.textContent = 'Entrando…';
  btn.disabled = true;
  try {
    const email = document.getElementById('l-email').value.trim();
    const pass  = document.getElementById('l-pass').value;
    const user  = await login(email, pass);
    document.getElementById('user-email').textContent = user.email;
    await loadUserProfile();
    showApp();
    await loadAll();
    applyRoleRestrictions();
  } catch (err) {
    errEl.textContent = err.message || 'Credenciales incorrectas';
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Entrar';
    btn.disabled = false;
  }
}

async function loadUserProfile() {
  try {
    state.userProfile = await api.userProfiles.me();
  } catch {
    // Si falla, asumir admin para no bloquear
    state.userProfile = { role: 'admin', permissions: {} };
  }
}

async function doLogout() {
  await logout();
  location.reload();
}

function showApp() {
  document.getElementById('login-screen').classList.remove('show');
  document.getElementById('app-shell').style.display = 'flex';
}

function showLogin() {
  document.getElementById('login-screen').classList.add('show');
  document.getElementById('app-shell').style.display = 'none';
}

/* ── INIT ── */
async function init() {
  document.getElementById('login-form').addEventListener('submit', doLogin);

  const user = await checkSession();
  if (user) {
    document.getElementById('user-email').textContent = user.email;
    await loadUserProfile();
    showApp();
    await loadAll();
    applyRoleRestrictions();
  } else {
    showLogin();
  }
}

/* ── EXPOSE TO HTML ── */
window.showTab       = showTab;
window.toggleSidebar = toggleSidebar;
window.doLogout      = doLogout;

// Clientes
window.openClienteModal = openClienteModal;
window.submitCliente    = submitCliente;
window.editPago         = editPago;
window.savePago         = savePago;
window.deleteCliente       = deleteCliente;
window.restoreCliente      = restoreCliente;
window.exportClientes      = exportClientes;
window.renderClientes      = renderClientes;
window.toggleShowInactive  = toggleShowInactive;

// Pedidos
window.openPedidoModal  = openPedidoModal;
window.submitPedido     = submitPedido;
window.deletePedido     = deletePedido;
window.exportPedidos    = exportPedidos;
window.updatePF         = updatePF;
window.calcExtra        = calcExtra;
window.setCliMode           = setCliMode;
window.triggerNcGeoPreview  = triggerNcGeoPreview;
window.onNcUrlInput         = onNcUrlInput;
window.renderPedidos    = renderPedidos;
window.calcPedidoTotal  = calcPedidoTotal;
window.onModeloInput    = onModeloInput;
window.onModeloKey      = onModeloKey;
window.onModeloBlur     = onModeloBlur;
window.selectModelo     = selectModelo;
window.onTelaInput      = onTelaInput;
window.onTelaKey        = onTelaKey;
window.onTelaBlur       = onTelaBlur;
window.selectTela            = selectTela;
window.toggleShowCancelled   = toggleShowCancelled;

// Calendar
window.renderCal          = renderCal;
window.calNav             = calNav;
window.calToday           = calToday;
window.setCalMode         = setCalMode;
window.goToDay            = goToDay;
window.syncOutlook        = syncOutlook;
window.calSetTipo         = calSetTipo;
window.calSetFilter       = calSetFilter;
window.calToggleCancelados = calToggleCancelados;
window.calResetFilter     = calResetFilter;

// Tracking
window.openTrackModal  = openTrackModal;
window.trackAction     = trackAction;
window.saveMotivo      = saveMotivo;
window.cancelService   = cancelService;

// Map
window.toggleMuni        = toggleMuni;
window.onMfInput         = onMfInput;
window.onMfFocus         = onMfFocus;
window.onMfBlur          = onMfBlur;
window.onMfKey           = onMfKey;
window.selectAcItem      = selectAcItem;
window.toggleMapTipo     = toggleMapTipo;
window.resetMapFilter    = resetMapFilter;
window.onMfSelect        = onMfSelect;
window.generateDayRoute  = generateDayRoute;
window.onRouteDayChange  = onRouteDayChange;
window.openRouteConfig   = openRouteConfig;
window.saveRouteConfig   = saveRouteConfig;
window.closeRouteConfig     = closeRouteConfig;
window.onRouteConfigChange  = onRouteConfigChange;
window.viewRoute         = viewRoute;
window.deleteRoute       = deleteRoute;
window.saveCurrentRoute  = saveCurrentRoute;
window.renderRoutesList  = renderRoutesList;

// Modals
window.openOv  = openOv;
window.closeOv = closeOv;

// Métricas
window.generateFeedback = generateFeedback;

// Almacén
window.renderAlmacenamiento = renderAlmacenamiento;
window.openAlmacenModal     = openAlmacenModal;
window.submitAlmacen        = submitAlmacen;
window.deleteAlmacen        = deleteAlmacen;
window.openVehiculosManager = openVehiculosManager;
window.submitVehiculo       = submitVehiculo;
window.deleteVehiculo       = deleteVehiculo;

// Técnicos
window.openTecnicosManager = openTecnicosManager;
window.openTecnicoModal    = openTecnicoModal;
window.submitTecnico       = submitTecnico;
window.deleteTecnico       = deleteTecnico;

// Configuración
window.renderConfiguracion = renderConfiguracion;
window.saveUserProfile     = saveUserProfile;
window.addUserProfile      = addUserProfile;
window.deleteUserProfile   = deleteUserProfile;
window.cfgAddVehiculo      = cfgAddVehiculo;
window.cfgDeleteVehiculo   = cfgDeleteVehiculo;

document.addEventListener('DOMContentLoaded', () => {
  initOverlayListeners();
  if (window.lucide) try { window.lucide.createIcons(); } catch (_) {}
  init();
});
