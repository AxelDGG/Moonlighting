import { login, logout, checkSession } from './auth.js';
import { api } from './api.js';
import { state, cFromDb, pFromDb, pdFromDb, smFromDb, aFromDb, isAdmin, canDo } from './state.js';
import { toast, setLoader, setDbStatus, openOv, closeOv, badge, toggleSidebar, initOverlayListeners, confirmDialog } from './ui.js';

import { renderDash } from './modules/dashboard.js';
import { renderClientes, openClienteModal, submitCliente, editPago, savePago, deleteCliente, restoreCliente, exportClientes, toggleShowInactive, sortClientes, loadMoreClientes } from './modules/clientes.js';
import { renderPedidos, openPedidoModal, submitPedido, deletePedido, exportPedidos, updatePF, calcExtra, setCliMode,
         calcPedidoTotal, onModeloInput, onModeloKey, onModeloBlur, selectModelo,
         onTelaInput, onTelaKey, onTelaBlur, selectTela, toggleShowCancelled,
         triggerNcGeoPreview, onNcUrlInput,
         addLinea, removeLinea, togglePedidoExpand, loadMorePedidos } from './modules/pedidos.js';
import { renderCal, calNav, calToday, setCalMode, goToDay, calSetTipo, calSetFilter, calToggleCancelados, calResetFilter } from './modules/calendar.js';
import { openTrackModal, trackAction, saveMotivo, cancelService } from './modules/tracking.js';
import { initMap, toggleMuni, onMfInput, onMfFocus, onMfBlur, onMfKey, selectAcItem, toggleMapTipo, resetMapFilter, onMfSelect,
         generateDayRoute, onRouteDayChange, openRouteConfig, saveRouteConfig, closeRouteConfig, onRouteConfigChange,
         viewRoute, deleteRoute, saveCurrentRoute, renderRoutesList } from './modules/mapa.js';
import { renderMetricas, generateFeedback } from './modules/metricas.js';
import { renderAlmacenamiento, openAlmacenModal, submitAlmacen, deleteAlmacen, openVehiculosManager, submitVehiculo, deleteVehiculo } from './modules/almacenamiento.js';
import { openTecnicosManager, openTecnicoModal, submitTecnico, deleteTecnico } from './modules/tecnicos.js';
import { renderConfiguracion, saveUserProfile, addUserProfile, deleteUserProfile, cfgAddVehiculo, cfgDeleteVehiculo } from './modules/configuracion.js';
import { renderTecnicoView } from './modules/tecnico_view.js';

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
  tecnico:        'Mi agenda',
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
  else if (name === 'tecnico')       renderTecnicoView();

  // Close sidebar on mobile
  const sidebar = document.querySelector('.sidebar');
  if (sidebar?.classList.contains('open')) toggleSidebar();
}

/* ── APPLY ROLE RESTRICTIONS ── */
// Preflight: se ejecuta ANTES de showApp() para evitar flash del UI completo
// mientras loadAll() está corriendo. Oculta navs según rol+permisos y activa
// la pestaña correcta en el DOM (sin disparar renders — eso lo hace
// applyRoleRestrictions después de loadAll).
function applyRolePreflight() {
  const profile = state.userProfile;
  if (!profile) return;
  const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
  const show = (id) => { const el = document.getElementById(id); if (el) el.style.display = ''; };
  const activate = (name) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.ni-item').forEach(n => n.classList.remove('active'));
    document.getElementById('tab-' + name)?.classList.add('active');
    document.getElementById('nav-' + name)?.classList.add('active');
    const ptitle = document.getElementById('ptitle');
    if (ptitle) ptitle.textContent = TAB_TITLES[name] || name;
  };

  if (profile.role === 'tecnico') {
    ['nav-dashboard', 'nav-clientes', 'nav-pedidos', 'nav-almacen', 'nav-cal', 'nav-mapa', 'nav-metricas', 'nav-configuracion'].forEach(hide);
    show('nav-tecnico');
    activate('tecnico');
    return;
  }

  const admin = profile.role === 'admin';
  const perms = profile.permissions || {};

  if (!admin && perms.ver_dashboard  === false) hide('nav-dashboard');
  if (!admin && perms.ver_metricas   === false) hide('nav-metricas');
  if (!admin && perms.ver_almacen    === false) hide('nav-almacen');
  if (!admin && perms.ver_calendario === false) hide('nav-cal');
  if (!admin && perms.ver_mapa       === false) hide('nav-mapa');
  if (admin) show('nav-configuracion'); else hide('nav-configuracion');

  const firstAvail = admin ? 'dashboard'
    : perms.ver_dashboard !== false ? 'dashboard'
    : 'clientes';
  activate(firstAvail);
}

function applyRoleRestrictions() {
  const profile = state.userProfile;
  if (!profile) return;

  const admin = profile.role === 'admin';
  const isTec = profile.role === 'tecnico';
  const perms = profile.permissions || {};

  if (isTec) {
    // Nombre del técnico ya disponible porque loadAll pobló state.tecnicos
    const tec = profile.tecnico_id ? state.tecnicos.find(t => t.id === profile.tecnico_id) : null;
    state._tecnicoNombre = tec?.nombre || null;
    showTab('tecnico');
    return;
  }

  // Post-render: estos ocultamientos necesitan que el DOM ya tenga los elementos
  if (!admin && perms.ver_porcentajes === false) {
    document.querySelectorAll('.tec-porcentaje').forEach(el => el.style.display = 'none');
  }
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
  const errores = [];
  try {
    const [clientesR, pedidosR, detalleR, metricasR, almacenR, tecnicosR, routesR, vehiR] = await Promise.allSettled([
      api.clientes.getAll(),
      api.pedidos.getAll(),
      api.pedidos.allDetalle(),
      api.metricas.getAll(),
      api.almacenamiento.getAll(),
      api.tecnicos.getAll(),
      api.routeConfigs.getAll(),
      api.vehiculos.getAll(),
    ]);

    if (clientesR.status === 'fulfilled') state.clientes = clientesR.value.map(cFromDb);
    else { state.clientes = []; errores.push('clientes'); }

    if (pedidosR.status === 'fulfilled') state.pedidos = pedidosR.value.map(pFromDb);
    else { state.pedidos = []; errores.push('pedidos'); }

    if (detalleR.status === 'fulfilled') state.pedidoDetalle = (detalleR.value || []).map(pdFromDb);
    else state.pedidoDetalle = [];

    if (metricasR.status === 'fulfilled') state.servicios_metricas = metricasR.value.map(smFromDb);
    else state.servicios_metricas = [];

    if (almacenR.status === 'fulfilled') state.almacenamiento = almacenR.value.map(aFromDb);
    else state.almacenamiento = [];

    if (tecnicosR.status === 'fulfilled') state.tecnicos = tecnicosR.value;
    else state.tecnicos = [];

    if (routesR.status === 'fulfilled') state.routeConfigs = routesR.value;
    else state.routeConfigs = [];

    if (vehiR.status === 'fulfilled') state.vehiculos = vehiR.value;
    else state.vehiculos = [];

    // Éxito parcial: mostrar toast específico pero no marcar DB como offline
    // salvo que fallaran las dos tablas principales.
    const coreFailed = clientesR.status === 'rejected' && pedidosR.status === 'rejected';
    if (coreFailed) {
      toast('Error cargando datos', 'er');
      setDbStatus(false);
    } else {
      setDbStatus(true);
      if (errores.length) toast('No se cargaron: ' + errores.join(', '), 'er');
    }
    badge(state.pedidos.length + ' pedidos');
  } finally {
    setLoader(false);
  }
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
    applyRolePreflight();
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
    // Si falla, degradar a rol sin permisos en lugar de escalar a admin.
    state.userProfile = { role: 'gestor', permissions: { ver_metricas: false, ver_dashboard: false, crear_tecnicos: false, ver_porcentajes: false, ver_almacen: false, ver_calendario: false, ver_mapa: false } };
    toast('No se cargó el perfil de usuario; acceso limitado', 'er');
  }
}

async function doLogout() {
  const ok = await confirmDialog('¿Cerrar sesión? Tendrás que volver a iniciar sesión para acceder a la app.', {
    title: 'Cerrar sesión',
    confirmLabel: 'Cerrar sesión',
    cancelLabel: 'Cancelar',
    variant: 'info',
  });
  if (!ok) return;
  await logout();
  location.reload();
}

/* ── THEME TOGGLE ── */
function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effective = current || (systemDark ? 'dark' : 'light');
  const next = effective === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (_) {}
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const iconName = theme === 'dark' ? 'sun' : 'moon';
  btn.innerHTML = `<i data-lucide="${iconName}" aria-hidden="true"></i>`;
  if (window.lucide) try { window.lucide.createIcons({ nodes: btn.querySelectorAll('[data-lucide]') }); } catch (_) {}
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (_) {}
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effective = saved || (systemDark ? 'dark' : 'light');
  updateThemeIcon(effective);
}

/* ── OFFLINE INDICATOR ── */
function setOnlineStatus(online) {
  const pill = document.getElementById('offline-indicator');
  if (pill) pill.style.display = online ? 'none' : 'inline-flex';
}

function initOnlineStatus() {
  setOnlineStatus(navigator.onLine);
  window.addEventListener('online', () => {
    setOnlineStatus(true);
    toast('Conexión restaurada', 'ok');
  });
  window.addEventListener('offline', () => {
    setOnlineStatus(false);
    toast('Sin conexión — trabajando en modo local', 'warn', { duration: 5000 });
  });
}

/* ── KEYBOARD SHORTCUTS ── */
function initShortcuts() {
  document.addEventListener('keydown', e => {
    // Skip if user is typing in an input/textarea
    const tag = e.target.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
    if (isTyping) return;

    // "/" — focus first visible search input in active tab
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      const activeTab = document.querySelector('.tab.active');
      const search = activeTab?.querySelector('.si, input[type="search"], input[placeholder*="Buscar"]');
      if (search) { e.preventDefault(); search.focus(); search.select?.(); }
    }

    // "?" — show shortcuts hint
    if (e.key === '?' && e.shiftKey) {
      toast('Atajos: / buscar · Esc cerrar modal · g+d dashboard · g+c clientes · g+p pedidos', 'info', { duration: 5000 });
    }

    // "g" then letter — go to tab
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
      const onNext = ev => {
        const m = { d: 'dashboard', c: 'clientes', p: 'pedidos', a: 'almacen', k: 'cal', m: 'mapa', e: 'metricas' };
        const dest = m[ev.key];
        if (dest && document.getElementById('nav-' + dest)?.style.display !== 'none') showTab(dest);
        document.removeEventListener('keydown', onNext, true);
      };
      setTimeout(() => document.addEventListener('keydown', onNext, { once: true, capture: true }), 0);
      setTimeout(() => document.removeEventListener('keydown', onNext, true), 1200);
    }
  });
}

/* ── SERVICE WORKER ── */
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // avoid caching Vite HMR assets
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* noop */ });
  });
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
    applyRolePreflight();
    showApp();
    await loadAll();
    applyRoleRestrictions();
    _handleUrlTab();
  } else {
    showLogin();
  }
}

// Permite enlaces como /?tab=tecnico desde atajos del manifest
function _handleUrlTab() {
  const params = new URLSearchParams(location.search);
  const wanted = params.get('tab');
  if (!wanted) return;
  const nav = document.getElementById('nav-' + wanted);
  if (nav && nav.style.display !== 'none') showTab(wanted);
}

/* ── EXPOSE TO HTML ── */
window.showTab       = showTab;
window.toggleSidebar = toggleSidebar;
window.doLogout      = doLogout;
window.toggleTheme   = toggleTheme;

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
window.sortClientes        = sortClientes;
window.loadMoreClientes    = loadMoreClientes;

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
window.addLinea              = addLinea;
window.removeLinea           = removeLinea;
window.togglePedidoExpand    = togglePedidoExpand;
window.loadMorePedidos       = loadMorePedidos;

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

// Vista técnico
window.renderTecnicoView   = renderTecnicoView;

document.addEventListener('DOMContentLoaded', () => {
  initOverlayListeners();
  initTheme();
  initOnlineStatus();
  initShortcuts();
  initServiceWorker();
  if (window.lucide) try { window.lucide.createIcons(); } catch (_) {}
  init();
});
