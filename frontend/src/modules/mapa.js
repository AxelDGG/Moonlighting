import { state } from '../state.js';
import { api } from '../api.js';
import { esc, muniColor, pillPago, tipoPill, statusPill, pedidoDetalle, money, todayStr } from '../utils.js';
import { toast } from '../ui.js';
import { MUNIS, TIPO_IC, TIPO_BG, TIPO_CO } from '../constants.js';
import { refreshIcons } from '../icons.js';

let map = null;
let mapMarkers = [];
let muniZones = [];
let activeLayers = {};

let _mapFilterReady = false;
let mapFilter = { nombre: '', tel: '', dir: '', tipos: new Set(), estado: '', zona: '' };
let _mfFocused = { nombre: -1, tel: -1, dir: -1 };

export function initMap() {
  initMapFilter();
  if (map) { updateMapMarkers(); return; }
  map = L.map('map').setView([25.6866, -100.3161], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);
  map.on('popupopen', e => { try { if (e.popup._contentNode) refreshIcons(e.popup._contentNode); } catch (_) {} });
  updateMapMarkers();
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
  const clientPedidos = state.pedidos.filter(p => p.clienteId === clienteId);
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

export async function updateMapMarkers() {
  if (!map) return;
  mapMarkers.forEach(m => map.removeLayer(m));
  muniZones.forEach(z => map.removeLayer(z));
  mapMarkers = [];
  muniZones = [];

  const activeMunis = new Set();
  const bounds = [];
  const toSave = [];

  for (let i = 0; i < state.clientes.length; i++) {
    const c = state.clientes[i];
    if (!c.lat || !c.lng) {
      if (i > 0) await new Promise(r => setTimeout(r, 1100));
      try {
        const g = await geocode(c.direccion);
        if (g) {
          state.clientes[i] = { ...c, lat: g.lat, lng: g.lng, municipio: g.municipio };
          toSave.push(state.clientes[i]);
        }
      } catch (_) {}
    }
    const client = state.clientes[i];
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
    const pedCli = state.pedidos.filter(p => p.clienteId === client.id);
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

  activeMunis.forEach(muni => {
    const cfg = MUNIS[muni];
    if (!cfg) return;
    const z = L.circle(cfg.center, {
      radius: cfg.radius,
      color: cfg.color,
      weight: 2,
      opacity: 0.5,
      fillColor: cfg.color,
      fillOpacity: 0.05,
      dashArray: '9,5',
      interactive: false
    }).addTo(map);
    z.bindTooltip(muni, { sticky: true, className: 'muni-tt' });
    muniZones.push(z);
  });

  if (bounds.length === 1) map.setView(bounds[0], 14);
  else if (bounds.length > 1) map.fitBounds(bounds, { padding: [50, 50] });

  renderMapLegend();
  updateMapCount();
}

function renderMapLegend() {
  const container = document.getElementById('legend-items');
  if (!container) return;
  const counts = {};
  state.clientes.forEach(c => {
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
  // Populate zona select with MUNIS
  const zonaSelect = document.getElementById('mf-zona');
  if (zonaSelect && zonaSelect.options.length <= 1) {
    Object.keys(MUNIS).forEach(muni => {
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
  state.clientes.forEach(c => {
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
  if (mapFilter.tipos.size > 0) {
    const cp = state.pedidos.filter(p => +p.clienteId === c.id);
    if (!cp.some(p => mapFilter.tipos.has(p.tipoServicio))) return false;
  }
  if (mapFilter.estado) {
    const serviceStatus = getClientServiceStatus(c.id);
    if (serviceStatus !== mapFilter.estado) return false;
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
  const id = field === 'estado' ? 'mf-estado' : 'mf-zona';
  mapFilter[field] = document.getElementById(id)?.value || '';
  applyMapFilter();
}

export function resetMapFilter() {
  document.getElementById('mf-nombre').value = '';
  document.getElementById('mf-tel').value = '';
  document.getElementById('mf-dir').value = '';
  const estadoEl = document.getElementById('mf-estado');
  const zonaEl   = document.getElementById('mf-zona');
  if (estadoEl) estadoEl.value = '';
  if (zonaEl)   zonaEl.value   = '';
  mapFilter.nombre = '';
  mapFilter.tel = '';
  mapFilter.dir = '';
  mapFilter.estado = '';
  mapFilter.zona = '';
  mapFilter.tipos.clear();
  document.querySelectorAll('.mf-ac').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.mf-chip[data-tipo]').forEach(c => c.classList.add('on'));
  applyMapFilter();
}

function updateMapFilterUI() {
  const active = mapFilter.nombre || mapFilter.tel || mapFilter.dir || mapFilter.tipos.size > 0 || mapFilter.estado || mapFilter.zona;
  document.getElementById('mf-reset')?.classList.toggle('show', active);
}

function updateMapCount() {
  const el = document.getElementById('mf-count');
  if (!el) return;
  const total = state.clientes.filter(c => c.lat && c.lng).length;
  const shown = mapMarkers.length;
  const isFiltered = mapFilter.nombre || mapFilter.tel || mapFilter.dir || mapFilter.tipos.size > 0 || mapFilter.estado || mapFilter.zona;
  el.innerHTML = isFiltered
    ? `<b>${shown}</b> de ${total} clientes`
    : `<b>${total}</b> cliente${total !== 1 ? 's' : ''}`;
}
