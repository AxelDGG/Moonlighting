import { state } from '../state.js';
import { api } from '../api.js';
import { esc, muniColor, pillPago, tipoPill, statusPill, pedidoDetalle, money, todayStr } from '../utils.js';
import { toast } from '../ui.js';
import { MUNIS, TIPO_IC, TIPO_BG, TIPO_CO } from '../constants.js';
import { refreshIcons } from '../icons.js';
import { MUNICIPIOS_LIST, ZONAS_POR_MUNICIPIO, zonaFromCP, zonasDeMunicipio } from '../zonas.js';

let map = null;
let mapMarkers = [];
let muniZones = [];
let activeLayers = {};
let routePolyline = null;

// ── ROUTE PLANNER CONSTANTS ───────────────────────────────────────────────────
const DEFAULT_LAT = 25.6866, DEFAULT_LNG = -100.3161; // Bodega base – Monterrey
const VEL_KMH           = 30;
const TIEMPO_SERVICIO   = 90;
const MAX_PEDIDOS_AVISO = 6;
const MAX_TRASLADO_AVISO = 120;

let _mapFilterReady = false;
let mapFilter = { nombre: '', tel: '', dir: '', tipos: new Set(), estado: '', zona: '', subzona: '', tecnico: '' };

// Colores por zona (distintos al color del municipio para distinguir)
const ZONA_COLORS = {
  'Norte':    '#0ea5e9',
  'Sur':      '#f97316',
  'Centro':   '#a855f7',
  'Oriente':  '#10b981',
  'Poniente': '#ef4444',
};

function clientZona(c) {
  if (c.zona) return c.zona;
  if (c.codigoPostal && c.municipio) return zonaFromCP(c.municipio, c.codigoPostal);
  return null;
}
let _mfFocused = { nombre: -1, tel: -1, dir: -1 };

// Config de ruta activa (persistida en Supabase)
let _activeRouteConfig = null; // { id?, tecnico_id, start_lat, start_lng, start_address, end_lat, end_lng, end_address }

function getBaseLat() { return _activeRouteConfig?.start_lat ?? DEFAULT_LAT; }
function getBaseLng() { return _activeRouteConfig?.start_lng ?? DEFAULT_LNG; }
function getEndLat()  { return _activeRouteConfig?.end_lat   ?? DEFAULT_LAT; }
function getEndLng()  { return _activeRouteConfig?.end_lng   ?? DEFAULT_LNG; }
function getBaseAddr(){ return _activeRouteConfig?.start_address || 'Base Monterrey'; }
function getEndAddr() { return _activeRouteConfig?.end_address   || 'Base Monterrey'; }

export function initMap() {
  initMapFilter();
  if (map) { updateMapMarkers(); return; }
  map = L.map('map').setView([DEFAULT_LAT, DEFAULT_LNG], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);
  map.on('popupopen', e => { try { if (e.popup._contentNode) refreshIcons(e.popup._contentNode); } catch (_) {} });
  updateMapMarkers();
  _loadRouteConfigs();
}

// Cargar config de ruta al abrir el mapa
async function _loadRouteConfigs() {
  try {
    state.routeConfigs = await api.routeConfigs.getAll();
    _renderTecnicoSelect();
    _renderRouteConfigSelect();
    renderRoutesList();
  } catch (_) {}
}

async function geocode(address) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(address)}&limit=1`,
    { headers: { 'Accept-Language': 'es', 'User-Agent': 'Moonlighting/4.0' } }
  );
  const data = await res.json();
  if (data && data.length) {
    const item = data[0];
    return { lat: +item.lat, lng: +item.lon, municipio: item.address ? normMuni(item.address) : 'Desconocido' };
  }
  return null;
}

function normMuni(a) {
  let raw = '';
  for (const k of ['city', 'town', 'municipality', 'county', 'state_district']) {
    if (a[k]) { raw = a[k]; break; }
  }
  if (!raw) return 'Desconocido';
  raw = raw.replace(/^Municipio\s+(de\s+)?/i, '').trim();
  const known = Object.keys(MUNIS);
  return known.find(k => k.toLowerCase() === raw.toLowerCase())
    || known.find(k => raw.toLowerCase().includes(k.toLowerCase().split(' ')[0]))
    || raw;
}

function markerIcon(color, size = 17) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);transition:all .2s"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 3]
  });
}

function markerIconStatus(color, pulse = false, size = 20) {
  const pulseStyle = pulse ? 'animation:pulse-marker 1.5s infinite;' : '';
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${size}px;height:${size}px">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.4);${pulseStyle}"></div>
      ${pulse ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${color};opacity:.4;animation:pulse-ring 1.5s infinite"></div>` : ''}
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 3]
  });
}

function getClientServiceStatus(clienteId) {
  const clientPedidos = state.pedidos.filter(p => p.clienteId === clienteId && !isCancelled(p));
  if (!clientPedidos.length) return 'none';
  const today = todayStr();
  const todayPedidos = clientPedidos.filter(p => p.fecha === today);
  const relevantPedidos = todayPedidos.length ? todayPedidos : clientPedidos;
  let hasCompleted = false, hasInProgress = false, hasDelayed = false, hasProgramado = false;
  for (const p of relevantPedidos) {
    const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
    if (!sm) continue;
    if (sm.estado === 'completado') hasCompleted = true;
    else if (sm.estado === 'en_curso') hasInProgress = true;
    else if (sm.estado === 'atrasado') hasDelayed = true;
    else if (sm.estado === 'programado') hasProgramado = true;
  }
  if (hasDelayed) return 'atrasado';
  if (hasInProgress) return 'en_curso';
  if (hasCompleted) return 'completado';
  if (hasProgramado) return 'programado';
  return 'none';
}

function isCancelled(p) {
  return (p.estado || '').toLowerCase() === 'cancelado';
}

export async function updateMapMarkers() {
  if (!map) return;
  mapMarkers.forEach(m => map.removeLayer(m));
  muniZones.forEach(z => map.removeLayer(z));
  mapMarkers = [];
  muniZones = [];

  const activeMunis = new Set();
  const bounds = [];
  const toSave = [];

  // Solo mostrar clientes activos
  const activeClientes = state.clientes.filter(c => c.activo !== false);

  for (let i = 0; i < activeClientes.length; i++) {
    const c = activeClientes[i];
    // Hallar índice real en state.clientes
    const si = state.clientes.findIndex(x => x.id === c.id);

    if (!c.lat || !c.lng) {
      if (i > 0) await new Promise(r => setTimeout(r, 1100));
      try {
        const g = await geocode(c.direccion);
        if (g) {
          state.clientes[si] = { ...c, lat: g.lat, lng: g.lng, municipio: g.municipio };
          toSave.push(state.clientes[si]);
        }
      } catch (_) {}
    }
    const client = state.clientes[si];
    if (!client.lat || !client.lng) continue;
    const muni = client.municipio || 'Desconocido';
    if (activeLayers[muni] === false) continue;
    if (!clientPassFilter(client)) continue;
    activeMunis.add(muni);

    const serviceStatus = getClientServiceStatus(client.id);
    let markerColor, isPulse = false, markerSize = 17;
    if (serviceStatus === 'completado') { markerColor = '#22c55e'; markerSize = 18; }
    else if (serviceStatus === 'en_curso') { markerColor = '#3b82f6'; isPulse = true; markerSize = 20; }
    else if (serviceStatus === 'atrasado') { markerColor = '#ef4444'; isPulse = true; markerSize = 20; }
    else if (serviceStatus === 'programado') { markerColor = '#f59e0b'; markerSize = 17; }
    else { markerColor = muniColor(muni); markerSize = 17; }

    const icon = (serviceStatus !== 'none')
      ? markerIconStatus(markerColor, isPulse, markerSize)
      : markerIcon(markerColor);

    const marker = L.marker([client.lat, client.lng], { icon }).addTo(map);
    const pedCli = state.pedidos.filter(p => p.clienteId === client.id && !isCancelled(p));
    const pedHtml = pedCli.length
      ? pedCli.map(p => {
          const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
          const iconName = TIPO_IC[p.tipoServicio] || 'package';
          return `<div style="margin-top:3px;font-size:11px;color:#475569;display:flex;align-items:center;gap:4px"><i data-lucide="${iconName}" style="width:11px;height:11px;flex-shrink:0"></i> ${pedidoDetalle(p)} — <b>${money(p.total)}</b>${sm ? ` ${statusPill(sm.estado)}` : ''}</div>`;
        }).join('')
      : '<div style="font-size:11px;color:#94a3b8;margin-top:3px">Sin pedidos</div>';

    const statusLabel = serviceStatus !== 'none' ? `<div style="margin:4px 0">${statusPill(serviceStatus)}</div>` : '';
    marker.bindPopup(
      `<div style="min-width:195px;font-size:12.5px;line-height:1.6">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:2px">${esc(client.nombre)}</div>
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px">
          <span style="width:8px;height:8px;border-radius:50%;background:${muniColor(muni)};display:inline-block"></span>
          <span style="font-size:11px;color:#64748b">${esc(muni)}</span>
        </div>
        ${statusLabel}
        <span style="display:flex;align-items:center;gap:4px"><i data-lucide="phone" style="width:11px;height:11px"></i> ${esc(client.numero)}</span>
        <span style="display:flex;align-items:center;gap:4px"><i data-lucide="map-pin" style="width:11px;height:11px"></i> <span style="font-size:11.5px">${esc(client.direccion)}</span></span>
        ${pillPago(client.metodoPago)}<br/>
        ${pedHtml}
      </div>`,
      { maxWidth: 285 }
    );
    mapMarkers.push(marker);
    bounds.push([client.lat, client.lng]);
  }

  for (const c of toSave) {
    try { await api.clientes.update(c.id, { lat: c.lat, lng: c.lng, municipio: c.municipio }); } catch (_) {}
  }

  _drawZonePolygons(activeClientes, activeMunis);

  if (bounds.length === 1) map.setView(bounds[0], 14);
  else if (bounds.length > 1) map.fitBounds(bounds, { padding: [50, 50] });

  renderMapLegend();
  updateMapCount();
}

function renderMapLegend() {
  const container = document.getElementById('legend-items');
  if (!container) return;
  const counts = {};
  state.clientes.filter(c => c.activo !== false).forEach(c => {
    const m = c.municipio || 'Desconocido';
    counts[m] = (counts[m] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    container.innerHTML = '<div style="color:var(--mu);font-size:12px;padding:4px 0">Sin clientes</div>';
    return;
  }
  container.innerHTML = entries.map(([muni, cnt]) => {
    const col = muniColor(muni);
    const isOn = activeLayers[muni] !== false;
    return `<div class="li ${isOn ? '' : 'off'}" onclick="toggleMuni('${muni.replace(/'/g, "\\'")}')"><div class="ld" style="background:${col}"></div><span class="ll">${esc(muni)}</span><span class="lc" style="background:${col}22;color:${col}">${cnt}</span></div>`;
  }).join('');
}

export function toggleMuni(m) {
  activeLayers[m] = activeLayers[m] === false ? true : false;
  updateMapMarkers();
}

function _renderTecnicoSelect() {
  const sel = document.getElementById('mf-tecnico');
  if (!sel || sel.dataset.populated) return;
  state.tecnicos.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.nombre;
    opt.textContent = t.nombre;
    sel.appendChild(opt);
  });
  sel.dataset.populated = '1';
}

function _renderRouteConfigSelect() {
  const sel = document.getElementById('route-config-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Configuración predeterminada —</option>';
  state.routeConfigs.forEach(rc => {
    const opt = document.createElement('option');
    opt.value = rc.id;
    opt.textContent = `${rc.tecnicos?.nombre || 'Sin técnico'} — ${rc.nombre || rc.start_address || 'Config'}`;
    sel.appendChild(opt);
  });
}

function initMapFilter() {
  if (_mapFilterReady) return;
  _mapFilterReady = true;
  const filterBody = document.getElementById('mf-chips');
  if (filterBody) {
    filterBody.innerHTML = Object.entries(TIPO_IC).map(([t, iconName]) => {
      const bg = TIPO_BG[t] || '#f1f5f9', co = TIPO_CO[t] || '#475569';
      return `<span class="mf-chip on" data-tipo="${t}" style="background:${bg};color:${co}" onclick="toggleMapTipo('${t}')"><i data-lucide="${iconName}" style="width:11px;height:11px;vertical-align:middle"></i> ${t}</span>`;
    }).join('');
    refreshIcons(filterBody);
  }
  const zonaSelect = document.getElementById('mf-zona');
  if (zonaSelect && zonaSelect.options.length <= 1) {
    // Poblar con municipios de la tabla de zonas (fuente canónica)
    MUNICIPIOS_LIST.forEach(muni => {
      const opt = document.createElement('option');
      opt.value = muni;
      opt.textContent = muni;
      zonaSelect.appendChild(opt);
    });
  }
  updateMapCount();
  document.addEventListener('click', e => {
    if (!e.target.closest('.mf-field')) {
      document.querySelectorAll('.mf-ac').forEach(d => d.classList.remove('open'));
    }
  });
}

function highlightMatch(text, query) {
  if (!query) return esc(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + query.length)) + '</mark>' + esc(text.slice(idx + query.length));
}

function getAcItems(field) {
  const inputEl = document.getElementById(field === 'nombre' ? 'mf-nombre' : field === 'tel' ? 'mf-tel' : 'mf-dir');
  if (!inputEl) return [];
  const q = (inputEl.value || '').toLowerCase().trim();
  if (!q) return [];
  const unique = new Map();
  state.clientes.filter(c => c.activo !== false).forEach(c => {
    let val = '', sub = '';
    if (field === 'nombre') { val = c.nombre || ''; sub = c.municipio || ''; }
    else if (field === 'tel') { val = c.numero || ''; sub = c.nombre || ''; }
    else { val = c.direccion || ''; sub = c.municipio || ''; }
    if (val.toLowerCase().includes(q) && !unique.has(val)) {
      unique.set(val, { val, sub, id: c.id });
    }
  });
  return [...unique.values()].slice(0, 8);
}

function renderAc(field) {
  const input = document.getElementById(field === 'nombre' ? 'mf-nombre' : field === 'tel' ? 'mf-tel' : 'mf-dir');
  if (!input) return;
  const q = input.value.trim();
  const items = getAcItems(field);
  const dd = document.getElementById('mf-ac-' + field);
  if (!items.length || !q) {
    dd?.classList.remove('open');
    if (dd) dd.innerHTML = '';
    return;
  }
  _mfFocused[field] = -1;
  if (dd) {
    dd.innerHTML = items.map((it, i) =>
      `<div class="mf-ac-item" data-idx="${i}" onmousedown="selectAcItem('${field}',${i})">
        <span>${highlightMatch(it.val, q)}</span>
        <span class="mf-ac-sub">${esc(it.sub)}</span>
      </div>`
    ).join('');
    dd.classList.add('open');
  }
}

export function selectAcItem(field, idx) {
  const items = getAcItems(field);
  if (!items[idx]) return;
  const inputId = field === 'nombre' ? 'mf-nombre' : field === 'tel' ? 'mf-tel' : 'mf-dir';
  document.getElementById(inputId).value = items[idx].val;
  document.getElementById('mf-ac-' + field).classList.remove('open');
  mapFilter[field] = items[idx].val.toLowerCase();
  applyMapFilter();
}

export function onMfInput(field) {
  const inputId = field === 'nombre' ? 'mf-nombre' : field === 'tel' ? 'mf-tel' : 'mf-dir';
  mapFilter[field] = document.getElementById(inputId).value.toLowerCase().trim();
  renderAc(field);
  applyMapFilter();
}

export function onMfFocus(field) { renderAc(field); }
export function onMfBlur(field) {
  setTimeout(() => document.getElementById('mf-ac-' + field)?.classList.remove('open'), 150);
}

export function onMfKey(e, field) {
  const dd = document.getElementById('mf-ac-' + field);
  if (!dd) return;
  const items = dd.querySelectorAll('.mf-ac-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _mfFocused[field] = Math.min(_mfFocused[field] + 1, items.length - 1);
    items.forEach((it, i) => it.classList.toggle('focused', i === _mfFocused[field]));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _mfFocused[field] = Math.max(_mfFocused[field] - 1, 0);
    items.forEach((it, i) => it.classList.toggle('focused', i === _mfFocused[field]));
  } else if (e.key === 'Enter' && _mfFocused[field] >= 0) {
    e.preventDefault();
    selectAcItem(field, _mfFocused[field]);
  } else if (e.key === 'Escape') {
    dd.classList.remove('open');
  }
}

function applyMapFilter() {
  updateMapFilterUI();
  updateMapMarkers();
}

function clientPassFilter(c) {
  if (mapFilter.nombre && !c.nombre.toLowerCase().includes(mapFilter.nombre)) return false;
  if (mapFilter.tel && !(c.numero || '').toLowerCase().includes(mapFilter.tel)) return false;
  if (mapFilter.dir && !(c.direccion || '').toLowerCase().includes(mapFilter.dir) && !(c.municipio || '').toLowerCase().includes(mapFilter.dir)) return false;
  if (mapFilter.zona && (c.municipio || '') !== mapFilter.zona) return false;
  if (mapFilter.subzona) {
    const z = clientZona(c);
    if (z !== mapFilter.subzona) return false;
  }
  if (mapFilter.tipos.size > 0) {
    const cp = state.pedidos.filter(p => +p.clienteId === c.id && !isCancelled(p));
    if (!cp.some(p => mapFilter.tipos.has(p.tipoServicio))) return false;
  }
  if (mapFilter.estado) {
    const serviceStatus = getClientServiceStatus(c.id);
    if (serviceStatus !== mapFilter.estado) return false;
  }
  if (mapFilter.tecnico) {
    const cp = state.pedidos.filter(p => +p.clienteId === c.id && !isCancelled(p));
    const tecnicoIds = cp.map(p => {
      const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
      return sm?.tecnico || null;
    }).filter(Boolean);
    if (!tecnicoIds.some(t => t.toLowerCase().includes(mapFilter.tecnico.toLowerCase()))) return false;
  }
  return true;
}

export function toggleMapTipo(tipo) {
  if (mapFilter.tipos.size === 0) { mapFilter.tipos.add(tipo); }
  else if (mapFilter.tipos.has(tipo) && mapFilter.tipos.size === 1) { mapFilter.tipos.clear(); }
  else if (mapFilter.tipos.has(tipo)) { mapFilter.tipos.delete(tipo); }
  else { mapFilter.tipos.add(tipo); }
  const empty = mapFilter.tipos.size === 0;
  document.querySelectorAll('.mf-chip[data-tipo]').forEach(c => c.classList.toggle('on', empty || mapFilter.tipos.has(c.dataset.tipo)));
  applyMapFilter();
}

export function onMfSelect(field) {
  const idMap = { estado: 'mf-estado', zona: 'mf-zona', subzona: 'mf-subzona', tecnico: 'mf-tecnico' };
  mapFilter[field] = document.getElementById(idMap[field])?.value || '';
  if (field === 'zona') {
    // Cascada: al cambiar municipio, repoblar la zona (subzona)
    mapFilter.subzona = '';
    _populateSubzonaSelect(mapFilter.zona);
  }
  applyMapFilter();
}

function _populateSubzonaSelect(municipio) {
  const wrap = document.getElementById('mf-subzona-wrap');
  const sel  = document.getElementById('mf-subzona');
  if (!sel || !wrap) return;
  sel.innerHTML = '<option value="">Todas</option>';
  const zonas = municipio ? zonasDeMunicipio(municipio) : [];
  if (!zonas.length) {
    wrap.style.display = 'none';
    return;
  }
  zonas.forEach(z => {
    const opt = document.createElement('option');
    opt.value = z;
    opt.textContent = z;
    sel.appendChild(opt);
  });
  wrap.style.display = '';
}

export function resetMapFilter() {
  document.getElementById('mf-nombre').value = '';
  document.getElementById('mf-tel').value = '';
  document.getElementById('mf-dir').value = '';
  const estadoEl   = document.getElementById('mf-estado');
  const zonaEl     = document.getElementById('mf-zona');
  const subzonaEl  = document.getElementById('mf-subzona');
  const subzonaWrap = document.getElementById('mf-subzona-wrap');
  const tecnicoEl  = document.getElementById('mf-tecnico');
  if (estadoEl)    estadoEl.value    = '';
  if (zonaEl)      zonaEl.value      = '';
  if (subzonaEl)   subzonaEl.value   = '';
  if (subzonaWrap) subzonaWrap.style.display = 'none';
  if (tecnicoEl)   tecnicoEl.value   = '';
  mapFilter.nombre = '';
  mapFilter.tel = '';
  mapFilter.dir = '';
  mapFilter.estado = '';
  mapFilter.zona = '';
  mapFilter.subzona = '';
  mapFilter.tecnico = '';
  mapFilter.tipos.clear();
  document.querySelectorAll('.mf-ac').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.mf-chip[data-tipo]').forEach(c => c.classList.add('on'));
  applyMapFilter();
}

function updateMapFilterUI() {
  const active = mapFilter.nombre || mapFilter.tel || mapFilter.dir || mapFilter.tipos.size > 0 || mapFilter.estado || mapFilter.zona || mapFilter.subzona || mapFilter.tecnico;
  document.getElementById('mf-reset')?.classList.toggle('show', active);
}

function updateMapCount() {
  const el = document.getElementById('mf-count');
  if (!el) return;
  const total = state.clientes.filter(c => c.activo !== false && c.lat && c.lng).length;
  const shown = mapMarkers.length;
  const isFiltered = mapFilter.nombre || mapFilter.tel || mapFilter.dir || mapFilter.tipos.size > 0 || mapFilter.estado || mapFilter.zona || mapFilter.subzona || mapFilter.tecnico;

  // Si hay municipio seleccionado (pero aún no zona), mostrar desglose por zona
  if (mapFilter.zona && !mapFilter.subzona) {
    const breakdown = {};
    state.clientes.filter(c => c.activo !== false && c.lat && c.lng && c.municipio === mapFilter.zona)
      .forEach(c => {
        const z = clientZona(c) || 'Sin zona';
        breakdown[z] = (breakdown[z] || 0) + 1;
      });
    const parts = Object.entries(breakdown).sort((a, b) => b[1] - a[1])
      .map(([z, n]) => `<span style="color:${ZONA_COLORS[z] || '#64748b'}">${esc(z)} <b>${n}</b></span>`);
    el.innerHTML = parts.length
      ? `<b>${shown}</b> de ${total} · ${parts.join(' · ')}`
      : `<b>${shown}</b> de ${total} clientes`;
    return;
  }
  el.innerHTML = isFiltered
    ? `<b>${shown}</b> de ${total} clientes`
    : `<b>${total}</b> cliente${total !== 1 ? 's' : ''}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTE PLANNER
// ══════════════════════════════════════════════════════════════════════════════

let _lastRouteData = null;

// ── Route config modal ────────────────────────────────────────────────────────
export function openRouteConfig() {
  const ov = document.getElementById('ov-route-config');
  if (!ov) return;
  // Populate técnico select
  const tecSel = document.getElementById('rc-tecnico');
  if (tecSel) {
    tecSel.innerHTML = '<option value="">— Sin técnico asignado —</option>';
    state.tecnicos.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.nombre;
      if (_activeRouteConfig?.tecnico_id === t.id) opt.selected = true;
      tecSel.appendChild(opt);
    });
  }
  // Rellenar campos con config activa
  if (_activeRouteConfig) {
    _setVal('rc-start-addr', _activeRouteConfig.start_address || '');
    _setVal('rc-end-addr', _activeRouteConfig.end_address || '');
    _setVal('rc-nombre', _activeRouteConfig.nombre || '');
  }
  ov.classList.add('open');
}

export function closeRouteConfig() {
  document.getElementById('ov-route-config')?.classList.remove('open');
}

export async function saveRouteConfig() {
  const nombre    = _getVal('rc-nombre') || 'Config ruta';
  const tecnicoId = parseInt(_getVal('rc-tecnico')) || null;
  const startAddr = _getVal('rc-start-addr');
  const endAddr   = _getVal('rc-end-addr');

  const btn = document.getElementById('btn-rc-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    let startLat = _activeRouteConfig?.start_lat ?? DEFAULT_LAT;
    let startLng = _activeRouteConfig?.start_lng ?? DEFAULT_LNG;
    let endLat   = _activeRouteConfig?.end_lat   ?? DEFAULT_LAT;
    let endLng   = _activeRouteConfig?.end_lng   ?? DEFAULT_LNG;

    if (startAddr) {
      const g = await geocode(startAddr);
      if (g) { startLat = g.lat; startLng = g.lng; }
    }
    if (endAddr) {
      const g = await geocode(endAddr);
      if (g) { endLat = g.lat; endLng = g.lng; }
    }

    const payload = { tecnico_id: tecnicoId, nombre, start_address: startAddr, start_lat: startLat, start_lng: startLng, end_address: endAddr, end_lat: endLat, end_lng: endLng };

    let result;
    if (_activeRouteConfig?.id) {
      await api.routeConfigs.update(_activeRouteConfig.id, payload);
      _activeRouteConfig = { ..._activeRouteConfig, ...payload, id: _activeRouteConfig.id };
      // Update in state
      const idx = state.routeConfigs.findIndex(r => r.id === _activeRouteConfig.id);
      if (idx !== -1) state.routeConfigs[idx] = { ...state.routeConfigs[idx], ...payload };
    } else {
      result = await api.routeConfigs.create(payload);
      _activeRouteConfig = result;
      state.routeConfigs.push(result);
    }

    _renderRouteConfigSelect();
    // Select the saved config
    const sel = document.getElementById('route-config-sel');
    if (sel && _activeRouteConfig?.id) sel.value = _activeRouteConfig.id;

    closeRouteConfig();
    toast('Configuración guardada');
  } catch (err) {
    toast('Error: ' + err.message, 'er');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

export function onRouteConfigChange() {
  const sel = document.getElementById('route-config-sel');
  const id = parseInt(sel?.value);
  if (id) {
    _activeRouteConfig = state.routeConfigs.find(r => r.id === id) || null;
  } else {
    _activeRouteConfig = null;
  }
  // Update the selector in the route panel
  const tecLabel = document.getElementById('route-tecnico-label');
  if (tecLabel) {
    tecLabel.textContent = _activeRouteConfig?.tecnicos?.nombre
      ? `Técnico: ${_activeRouteConfig.tecnicos.nombre}`
      : '';
  }
}

// ── Saved-routes chip list ────────────────────────────────────────────────────
const LS_KEY = 'ml_routes';
function _getStoredRoutes() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function _setStoredRoutes(routes) {
  localStorage.setItem(LS_KEY, JSON.stringify(routes.slice(0, 30)));
}

export function renderRoutesList() {
  const container = document.getElementById('routes-list');
  if (!container) return;
  const routes = _getStoredRoutes();
  if (!routes.length) {
    container.innerHTML = '<span style="color:var(--mu);font-size:11px;font-style:italic">Sin rutas guardadas</span>';
    return;
  }
  container.innerHTML = routes.map(r => {
    const d = r.fecha ? new Date(r.fecha + 'T12:00:00') : null;
    const dateLabel = d ? d.toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '';
    return `<div class="route-chip" onclick="viewRoute('${r.id}')">
      <div class="route-chip-name">${esc(r.nombre)}</div>
      <div class="route-chip-meta">${dateLabel}${r.stopsCount ? ` · ${r.stopsCount} parada${r.stopsCount !== 1 ? 's' : ''}` : ''}${r.tecnico ? ` · ${esc(r.tecnico)}` : ''}</div>
      <button class="route-chip-del" onclick="event.stopPropagation();deleteRoute('${r.id}')" title="Eliminar">
        <i data-lucide="x" style="width:10px;height:10px"></i>
      </button>
    </div>`;
  }).join('');
  refreshIcons(container);
}

export function viewRoute(id) {
  const route = _getStoredRoutes().find(r => r.id === id);
  if (!route) return;
  _lastRouteData = route;
  _renderRouteResult(route);
  const startPt = { lat: route.startLat ?? DEFAULT_LAT, lng: route.startLng ?? DEFAULT_LNG };
  const endPt   = { lat: route.endLat   ?? DEFAULT_LAT, lng: route.endLng   ?? DEFAULT_LNG };
  _drawRoutePolyline([startPt, ...route.legs, endPt]);
}

export function deleteRoute(id) {
  _setStoredRoutes(_getStoredRoutes().filter(r => r.id !== id));
  renderRoutesList();
}

export function saveCurrentRoute() {
  if (!_lastRouteData) return;
  const input = document.getElementById('route-save-name');
  const nombre = input?.value.trim();
  if (!nombre) { input?.focus(); input?.classList.add('shake'); setTimeout(() => input?.classList.remove('shake'), 400); return; }
  const tecnicoNombre = _activeRouteConfig?.tecnicos?.nombre || null;
  const route = {
    id:         'r' + Date.now(),
    nombre,
    fecha:      _lastRouteData.ds || _lastRouteData.fecha || '',
    tecnico:    _lastRouteData.tecnico || tecnicoNombre,
    legs:       _lastRouteData.legs,
    stopsCount: _lastRouteData.legs?.length || 0,
    totalTravelMin: _lastRouteData.totalTravelMin,
    retorno:    _lastRouteData.retorno,
    sinCoords:  _lastRouteData.sinCoords || 0,
    startLat:   getBaseLat(),
    startLng:   getBaseLng(),
    endLat:     getEndLat(),
    endLng:     getEndLng(),
    createdAt:  new Date().toISOString(),
  };
  _setStoredRoutes([route, ..._getStoredRoutes()]);
  renderRoutesList();
  if (input) input.value = '';
  window.dispatchEvent(new CustomEvent('ml-toast', { detail: { msg: 'Ruta guardada: ' + nombre } }));
}

// ── Math helpers ──────────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
function travelMin(lat1, lng1, lat2, lng2) {
  return Math.round(haversineKm(lat1, lng1, lat2, lng2) / VEL_KMH * 60);
}

// ── Nearest-neighbor TSP ──────────────────────────────────────────────────────
function nearestNeighbor(stops, startLat, startLng) {
  if (!stops.length) return [];
  const pinned    = stops.filter(s => s.hora).sort((a, b) => a.hora.localeCompare(b.hora));
  const remaining = stops.filter(s => !s.hora);
  const ordered   = [];
  const allPinned = [...pinned];
  let curLat = startLat, curLng = startLng;

  while (remaining.length || allPinned.length) {
    if (!remaining.length) { const p = allPinned.shift(); ordered.push(p); curLat = p.lat; curLng = p.lng; continue; }
    if (!allPinned.length) {
      let best = 0, bestDist = Infinity;
      remaining.forEach((s, i) => { const d = haversineKm(curLat, curLng, s.lat, s.lng); if (d < bestDist) { bestDist = d; best = i; } });
      const s = remaining.splice(best, 1)[0]; ordered.push(s); curLat = s.lat; curLng = s.lng; continue;
    }
    const nextPinned = allPinned[0];
    let best = 0, bestDist = Infinity;
    remaining.forEach((s, i) => { const d = haversineKm(curLat, curLng, s.lat, s.lng); if (d < bestDist) { bestDist = d; best = i; } });
    const distPinned = haversineKm(curLat, curLng, nextPinned.lat, nextPinned.lng);
    if (distPinned <= bestDist) {
      const p = allPinned.shift(); ordered.push(p); curLat = p.lat; curLng = p.lng;
    } else {
      const s = remaining.splice(best, 1)[0]; ordered.push(s); curLat = s.lat; curLng = s.lng;
    }
  }
  return ordered;
}

// ── Generate route for a day ──────────────────────────────────────────────────
export function onRouteDayChange() {
  const sel = document.getElementById('route-day');
  const customWrap = document.getElementById('route-date-wrap');
  if (customWrap) customWrap.style.display = sel?.value === 'custom' ? '' : 'none';
}

export function generateDayRoute() {
  const body = document.getElementById('route-body');
  if (!body) return;

  const sel = document.getElementById('route-day')?.value || 'today';
  let targetDate;
  if (sel === 'today')    { targetDate = new Date(); }
  else if (sel === 'tomorrow') { targetDate = new Date(); targetDate.setDate(targetDate.getDate() + 1); }
  else {
    const v = document.getElementById('route-date-input')?.value;
    if (!v) { body.innerHTML = '<p style="color:var(--wa);font-size:12px">Selecciona una fecha.</p>'; return; }
    targetDate = new Date(v + 'T12:00:00');
  }
  const ds = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,'0')}-${String(targetDate.getDate()).padStart(2,'0')}`;

  // Filtro de técnico seleccionado en la ruta
  const filterTecnico = _activeRouteConfig?.tecnicos?.nombre || null;

  // Solo pedidos no cancelados del día
  const dayPedidos = state.pedidos.filter(p => p.fecha === ds && !isCancelled(p));
  if (!dayPedidos.length) {
    body.innerHTML = `<div style="color:var(--mu);font-size:12px;text-align:center;padding:12px">Sin pedidos para este día.</div>`;
    _clearRoutePolyline(); return;
  }

  const stops = [];
  for (const p of dayPedidos) {
    const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    if (!c || !c.lat || !c.lng || c.activo === false) continue;
    const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
    // Filtrar por técnico si hay config activa
    if (filterTecnico && sm?.tecnico && sm.tecnico !== filterTecnico) continue;
    stops.push({ id: p.id, lat: c.lat, lng: c.lng, nombre: c.nombre, dir: c.direccion || '', tipo: p.tipoServicio, total: p.total, hora: sm?.hora_programada || null, tecnico: sm?.tecnico || null, estado: sm?.estado || null });
  }

  const sinCoords = dayPedidos.length - stops.length;
  if (!stops.length) {
    body.innerHTML = `<div style="color:var(--wa);font-size:12px;text-align:center;padding:12px">Ningún pedido tiene coordenadas guardadas.</div>`;
    return;
  }

  const startLat = getBaseLat(), startLng = getBaseLng();
  const endLat   = getEndLat(),   endLng   = getEndLng();

  const ordered = nearestNeighbor(stops, startLat, startLng);
  let curLat = startLat, curLng = startLng, totalTravelMin = 0;
  const legs = ordered.map(s => {
    const t = travelMin(curLat, curLng, s.lat, s.lng);
    totalTravelMin += t; curLat = s.lat; curLng = s.lng;
    return { ...s, travelMin: t };
  });
  const retorno = travelMin(curLat, curLng, endLat, endLng);
  totalTravelMin += retorno;

  _lastRouteData = { ds, legs, totalTravelMin, retorno, sinCoords, tecnico: filterTecnico };
  _drawRoutePolyline([{ lat: startLat, lng: startLng }, ...legs, { lat: endLat, lng: endLng }]);
  _renderRouteResult(_lastRouteData);
}

// ── Shared render ─────────────────────────────────────────────────────────────
function _renderRouteResult({ legs, totalTravelMin, retorno, sinCoords = 0, ds, fecha, tecnico }) {
  const body = document.getElementById('route-body');
  if (!body || !legs) return;
  const dateStr = ds || fecha || '';
  const totalMin = totalTravelMin + legs.length * TIEMPO_SERVICIO;
  const hrs = Math.floor(totalMin / 60), mins = totalMin % 60;
  const overloadPedidos  = legs.length >= MAX_PEDIDOS_AVISO;
  const overloadTraslado = totalTravelMin >= MAX_TRASLADO_AVISO;
  const statusColors = { programado: '#f59e0b', en_curso: '#3b82f6', completado: '#22c55e', atrasado: '#ef4444' };

  const startAddr = getBaseAddr(), endAddr = getEndAddr();

  let html = '';
  if (overloadPedidos || overloadTraslado) {
    const reasons = [];
    if (overloadPedidos)  reasons.push(`<b>${legs.length} pedidos</b> (máx. recomendado: ${MAX_PEDIDOS_AVISO})`);
    if (overloadTraslado) reasons.push(`<b>${totalTravelMin} min</b> de traslado (máx.: ${MAX_TRASLADO_AVISO} min)`);
    html += `<div class="route-overload"><i data-lucide="alert-triangle" style="width:14px;height:14px;flex-shrink:0"></i><div><b>Sobrecarga detectada:</b> ${reasons.join(' · ')}</div></div>`;
  }

  html += `<div class="route-summary">
    ${tecnico ? `<span><i data-lucide="user" style="width:12px;height:12px"></i> <b>${esc(tecnico)}</b></span>` : ''}
    <span><i data-lucide="map-pin" style="width:12px;height:12px"></i> <b>${legs.length}</b> parada${legs.length !== 1 ? 's' : ''}</span>
    <span><i data-lucide="clock" style="width:12px;height:12px"></i> Traslados: <b>${totalTravelMin} min</b></span>
    <span><i data-lucide="timer" style="width:12px;height:12px"></i> Jornada estimada: <b>${hrs}h ${mins}m</b></span>
    ${sinCoords ? `<span style="color:var(--wa)"><i data-lucide="alert-circle" style="width:12px;height:12px"></i> ${sinCoords} sin coords</span>` : ''}
  </div>`;

  html += '<div class="route-list">';
  html += `<div class="route-stop route-base"><span class="route-num">⌂</span><div class="route-info"><b>Salida — ${esc(startAddr)}</b></div></div>`;
  legs.forEach((s, i) => {
    const dot = s.estado ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${statusColors[s.estado]||'#94a3b8'};margin-right:4px;vertical-align:middle"></span>` : '';
    const prevLat = i === 0 ? getBaseLat() : legs[i-1].lat;
    const prevLng = i === 0 ? getBaseLng() : legs[i-1].lng;
    html += `
      <div class="route-travel"><i data-lucide="arrow-down" style="width:11px;height:11px"></i> ${s.travelMin} min (~${haversineKm(prevLat,prevLng,s.lat,s.lng).toFixed(1)} km)</div>
      <div class="route-stop">
        <span class="route-num">${i + 1}</span>
        <div class="route-info">
          <div style="font-weight:700;font-size:13px">${dot}${esc(s.nombre)}</div>
          <div style="font-size:11px;color:var(--mu)">${esc(s.tipo)}${s.hora ? ` · <i data-lucide="clock" style="width:10px;height:10px;vertical-align:middle"></i> ${s.hora}` : ''}${s.tecnico ? ` · ${esc(s.tecnico)}` : ''}</div>
          <div style="font-size:11px;color:var(--mu)">${esc(s.dir)}</div>
        </div>
        <span style="font-size:12px;font-weight:700;color:var(--ok);white-space:nowrap">$${parseFloat(s.total||0).toLocaleString('es')}</span>
      </div>`;
  });
  html += `<div class="route-travel"><i data-lucide="arrow-down" style="width:11px;height:11px"></i> ${retorno} min (llegada)</div>
    <div class="route-stop route-base"><span class="route-num">⌂</span><div class="route-info"><b>Destino — ${esc(endAddr)}</b></div></div>`;
  html += '</div>';

  html += `<div class="route-save-bar">
    <i data-lucide="save" style="width:13px;height:13px;color:var(--mu);flex-shrink:0"></i>
    <input id="route-save-name" type="text" placeholder="Nombre para guardar esta ruta…" style="flex:1;padding:6px 10px;border:1px solid var(--bo);border-radius:7px;font-size:12px;font-family:inherit;background:var(--card);color:var(--text);outline:none"/>
    <button class="btn bp bsm" onclick="saveCurrentRoute()">Guardar</button>
  </div>`;

  body.innerHTML = html;
  refreshIcons(body);
}

function _drawRoutePolyline(points) {
  if (!map) return;
  _clearRoutePolyline();
  routePolyline = L.polyline(points.map(p => [p.lat, p.lng]), { color: '#3b82f6', weight: 3, opacity: 0.75, dashArray: '8,5' }).addTo(map);
}
function _clearRoutePolyline() {
  if (routePolyline && map) { map.removeLayer(routePolyline); routePolyline = null; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _getVal(id) { return document.getElementById(id)?.value?.trim() || ''; }
function _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

// ── Zone polygons (convex hull + expand) ──────────────────────────────────────
// Construye polígonos con forma de envolvente convexa alrededor de los puntos
// de cada (municipio, zona). Mucho más preciso que círculos y refleja la
// distribución real de clientes.
function _drawZonePolygons(activeClientes, activeMunis) {
  // Agrupar puntos por (municipio, zona)
  const groups = {}; // key "muni||zona" → { muni, zona, points:[[lat,lng]...] }
  for (const c of activeClientes) {
    const muni = c.municipio || 'Desconocido';
    if (!activeMunis.has(muni)) continue;
    if (!c.lat || !c.lng) continue;
    const z = clientZona(c) || '—';
    const key = muni + '||' + z;
    if (!groups[key]) groups[key] = { muni, zona: z, points: [] };
    groups[key].points.push([c.lat, c.lng]);
  }

  Object.values(groups).forEach(g => {
    if (g.points.length < 1) return;
    const color = ZONA_COLORS[g.zona] || muniColor(g.muni);
    const label = g.zona === '—' ? g.muni : `${g.muni} — ${g.zona}`;

    let layer;
    if (g.points.length === 1) {
      // Un único punto: círculo pequeño
      layer = L.circle(g.points[0], {
        radius: 350, color, weight: 2, opacity: 0.55,
        fillColor: color, fillOpacity: 0.08, dashArray: '6,4', interactive: false,
      });
    } else if (g.points.length === 2) {
      // Dos puntos: línea gruesa con buffer
      layer = L.polyline(g.points, { color, weight: 4, opacity: 0.45, dashArray: '8,5', interactive: false });
    } else {
      // 3+ puntos: envolvente convexa expandida
      const hull = _convexHull(g.points);
      const expanded = _expandPolygon(hull, 0.003); // ~300m
      layer = L.polygon(expanded, {
        color, weight: 2, opacity: 0.6,
        fillColor: color, fillOpacity: 0.08,
        dashArray: '7,4', interactive: false, smoothFactor: 0.5,
      });
    }
    layer.addTo(map);
    layer.bindTooltip(label, { sticky: true, className: 'muni-tt' });
    muniZones.push(layer);
  });
}

// Andrew's monotone chain convex hull
function _convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const n = pts.length;
  if (n <= 2) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// Expande un polígono alejando cada vértice del centroide una distancia dada
// (en grados aprox). Más simple que un buffer geodésico exacto, suficiente
// para delimitar visualmente una zona.
function _expandPolygon(points, offsetDeg) {
  if (!points.length) return points;
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([lat, lng]) => {
    const dx = lat - cx, dy = lng - cy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return [lat, lng];
    return [lat + (dx / d) * offsetDeg, lng + (dy / d) * offsetDeg];
  });
}
