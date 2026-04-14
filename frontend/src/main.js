import { login, logout, checkSession } from './auth.js';
import { api } from './api.js';
import { state, cFromDb, pFromDb, smFromDb, aFromDb } from './state.js';
import { toast, setLoader, setDbStatus, openOv, closeOv, badge, toggleSidebar, initOverlayListeners } from './ui.js';

import { renderDash } from './modules/dashboard.js';
import { renderClientes, openClienteModal, submitCliente, editPago, savePago, deleteCliente, exportClientes } from './modules/clientes.js';
import { renderPedidos, openPedidoModal, submitPedido, deletePedido, exportPedidos, updatePF, calcExtra, setCliMode,
         calcPedidoTotal, onModeloInput, onModeloKey, onModeloBlur, selectModelo,
         onTelaInput, onTelaKey, onTelaBlur, selectTela } from './modules/pedidos.js';
import { renderCal, calNav, calToday, setCalMode, goToDay } from './modules/calendar.js';
import { openTrackModal, trackAction, saveMotivo, cancelService } from './modules/tracking.js';
import { initMap, toggleMuni, onMfInput, onMfFocus, onMfBlur, onMfKey, selectAcItem, toggleMapTipo, resetMapFilter } from './modules/mapa.js';
import { renderMetricas, generateFeedback } from './modules/metricas.js';
import { renderAlmacenamiento, openAlmacenModal, submitAlmacen, deleteAlmacen } from './modules/almacenamiento.js';

/* ── TAB TITLES ── */
const TAB_TITLES = {
  dashboard: 'Dashboard',
  clientes:  'Clientes',
  pedidos:   'Pedidos',
  almacen:   'Almacén',
  cal:       'Calendario',
  mapa:      'Mapa',
  metricas:  'Métricas',
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

  if      (name === 'dashboard') renderDash();
  else if (name === 'clientes')  renderClientes();
  else if (name === 'pedidos')   renderPedidos();
  else if (name === 'almacen')   renderAlmacenamiento();
  else if (name === 'cal')       renderCal();
  else if (name === 'mapa')      initMap();
  else if (name === 'metricas')  renderMetricas();

  // Close sidebar on mobile
  const sidebar = document.querySelector('.sidebar');
  if (sidebar?.classList.contains('open')) toggleSidebar();
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
    renderDash();
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
}

/* ── OUTLOOK SYNC ── */
async function syncOutlook(pedidoId) {
  try {
    setLoader(true, 'Sincronizando con Outlook…');
    await api.calendar.sync(pedidoId);
    await loadAll();
    renderCal();
    toast('Sincronizado con Outlook ✓', 'ok');
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
    showApp();
    await loadAll();
  } catch (err) {
    errEl.textContent = err.message || 'Credenciales incorrectas';
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Entrar';
    btn.disabled = false;
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
    showApp();
    await loadAll();
    showTab('dashboard');
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
window.deleteCliente    = deleteCliente;
window.exportClientes   = exportClientes;
window.renderClientes   = renderClientes;

// Pedidos
window.openPedidoModal  = openPedidoModal;
window.submitPedido     = submitPedido;
window.deletePedido     = deletePedido;
window.exportPedidos    = exportPedidos;
window.updatePF         = updatePF;
window.calcExtra        = calcExtra;
window.setCliMode       = setCliMode;
window.renderPedidos    = renderPedidos;
window.calcPedidoTotal  = calcPedidoTotal;
window.onModeloInput    = onModeloInput;
window.onModeloKey      = onModeloKey;
window.onModeloBlur     = onModeloBlur;
window.selectModelo     = selectModelo;
window.onTelaInput      = onTelaInput;
window.onTelaKey        = onTelaKey;
window.onTelaBlur       = onTelaBlur;
window.selectTela       = selectTela;

// Calendar
window.renderCal    = renderCal;
window.calNav       = calNav;
window.calToday     = calToday;
window.setCalMode   = setCalMode;
window.goToDay      = goToDay;
window.syncOutlook  = syncOutlook;

// Tracking
window.openTrackModal  = openTrackModal;
window.trackAction     = trackAction;
window.saveMotivo      = saveMotivo;
window.cancelService   = cancelService;

// Map
window.toggleMuni      = toggleMuni;
window.onMfInput       = onMfInput;
window.onMfFocus       = onMfFocus;
window.onMfBlur        = onMfBlur;
window.onMfKey         = onMfKey;
window.selectAcItem    = selectAcItem;
window.toggleMapTipo   = toggleMapTipo;
window.resetMapFilter  = resetMapFilter;

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

document.addEventListener('DOMContentLoaded', () => {
  initOverlayListeners();
  init();
});
