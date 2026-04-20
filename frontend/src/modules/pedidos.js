import { state, cFromDb, pFromDb, pToDb, cToDb, smFromDb, pdFromDb, pdToDb } from '../state.js';
import { api } from '../api.js';
import { esc, money, fdateShort, tipoPill, pedidoDetalle, statusPill, todayStr, getDiaSemana, downloadCSV } from '../utils.js';
import { SUBTIPO_ABANICO, SUBTIPO_MANTENIMIENTO, estimatePedidoDurationMin, fmtDuracion } from '../durations.js';
import { toast, openOv, closeOv, badge, initMobileRows } from '../ui.js';
import { renderDash } from './dashboard.js';
import { refreshIcons } from '../icons.js';
import { zonaFromCP, MUNICIPIOS_LIST, parseGoogleMapsUrl } from '../zonas.js';
import { resolveLocation } from '../geocoding.js';
import { DEBOUNCE } from '../constants.js';
import { getPricing } from '../runtime-config.js';

let cliMode = 'ex';
let _showCancelled = false;

// Líneas del pedido en edición. Cada línea:
//   { modelo, cantidad, precioUnit, nDesins, ancho, alto, instalacion, tipoTela, notas, acIdx, stock }
let lineasForm = [];

// ── Geocoding preview + mini mapa para nuevo cliente ─────────────────────────
let _previewDebounce = null;
let _lastPreviewKey  = '';
let _ncGeoResult     = null; // resultado listo para submit (evita doble llamada)
let _ncMap           = null; // instancia Leaflet del mini mapa
let _ncMarker        = null; // pin del mini mapa

// triggerNcGeoPreview ya no es el camino principal — la URL es la fuente de verdad.
// Se mantiene como fallback si el usuario no tiene URL y llena los campos a mano.
export function triggerNcGeoPreview() {
  // Si ya hay una URL resuelta, no sobreescribir
  const url = document.getElementById('nc-url')?.value.trim();
  if (url) return;

  const calle     = document.getElementById('nc-calle')?.value.trim();
  const municipio = document.getElementById('nc-muni')?.value;
  if (!calle || !municipio) return;

  const key = `${calle}|${municipio}`;
  if (key === _lastPreviewKey) return;
  clearTimeout(_previewDebounce);
  _previewDebounce = setTimeout(() => _runGeoPreview(calle, municipio, null, key), DEBOUNCE.GEOCODE);
}

let _urlDebounce = null;
export function onNcUrlInput() {
  const url = document.getElementById('nc-url')?.value.trim();
  if (!url) {
    _ncGeoResult = null;
    _lastPreviewKey = '';
    _hideNcMap();
    const prev = document.getElementById('nc-geo-preview');
    if (prev) prev.style.display = 'none';
    return;
  }

  clearTimeout(_urlDebounce);
  _urlDebounce = setTimeout(() => _resolveUrlAndPreview(url), DEBOUNCE.MAP_RESOLVE);
}

async function _resolveUrlAndPreview(url) {
  _setGeoPreview('loading', null);
  _hideNcMap();
  _ncGeoResult = null;

  // 1) Intentar parsear directo (URL larga)
  let parsed = null;
  try { parsed = parseGoogleMapsUrl(url); } catch (_) {}

  // 2) Si es short link o no se parsearon coords, resolver en el servidor
  if (!parsed?.lat || parsed.error) {
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) {
      try {
        const r = await api.geocode.resolveShort(url);
        if (r?.url) {
          try { parsed = parseGoogleMapsUrl(r.url); } catch (_) {}
          // Actualizar el campo con la URL larga para que se vea qué se resolvió
          // (no forzar — solo guardar internamente)
        }
      } catch (_) {
        _setGeoPreview('miss', null);
        return;
      }
    }
  }

  if (!parsed?.lat || parsed.error === 'low_zoom_search') {
    _setGeoPreview('miss', null);
    return;
  }

  const { lat, lng } = parsed;

  // 3) Reverse geocode para obtener municipio + CP automáticamente
  let municipio = null, cp = null;
  try {
    const rev = await api.geocode.reverse(lat, lng);
    municipio = rev?.municipio || null;
    cp        = rev?.codigoPostal || null;
  } catch (_) {}

  // Auto-seleccionar municipio en el dropdown
  if (municipio) {
    const sel = document.getElementById('nc-muni');
    if (sel) {
      const opt = Array.from(sel.options).find(o => o.value === municipio);
      if (opt) sel.value = municipio;
    }
  }

  _ncGeoResult = {
    lat, lng,
    source: 'google_url',
    confidence: 'high',
    verified: true,
    googleMapsUrl: url,
    codigoPostal: cp,
    municipio,
  };
  _lastPreviewKey = '';

  const zona = cp && municipio ? zonaFromCP(municipio, cp) : null;
  const zonaLabel = zona ? ` · Zona <b>${zona}</b>` : '';
  const muniLabel = municipio || 'municipio detectado';
  _setGeoPreview('url', { displayName: muniLabel + zonaLabel, zona, municipio });
  _showNcMap(lat, lng, muniLabel, 'high');
}

async function _runGeoPreview(calle, municipio, _cp, key) {
  _lastPreviewKey = key;
  _ncGeoResult    = null;
  _hideNcMap();
  _setGeoPreview('loading', null);
  try {
    const g = await api.geocode.search({
      structured: { street: calle, city: municipio, state: 'Nuevo León' },
      q: `${calle}, ${municipio}, Nuevo León`,
    });
    if (_lastPreviewKey !== key) return;
    if (!g || g.lat == null) { _setGeoPreview('miss', null); return; }

    const quality = g.confidence === 'high' ? 'ok' : g.confidence === 'medium' ? 'warn' : 'bad';
    _ncGeoResult = {
      lat: g.lat, lng: g.lng,
      source: g.source === 'cache' ? 'cache:nominatim' : 'nominatim_structured',
      confidence: g.confidence || 'medium',
      verified: false,
      codigoPostal: g.codigoPostal || null,
      municipio: g.municipio || municipio,
    };
    _setGeoPreview(quality, g);
    _showNcMap(g.lat, g.lng, g.displayName || municipio, quality);
  } catch (_) {
    if (_lastPreviewKey !== key) return;
    _setGeoPreview('miss', null);
  }
}

// ── Mini mapa ─────────────────────────────────────────────────────────────────
function _showNcMap(lat, lng, label, quality) {
  const wrap = document.getElementById('nc-map-wrap');
  const container = document.getElementById('nc-map');
  if (!wrap || !container || typeof L === 'undefined') return;

  const pinColor = quality === 'ok' || quality === 'high' ? '#22c55e'
    : quality === 'warn' || quality === 'medium' ? '#f59e0b'
    : '#ef4444';

  const icon = L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${pinColor};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });

  wrap.style.display = '';

  if (!_ncMap) {
    _ncMap = L.map(container, { zoomControl: true, attributionControl: false }).setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(_ncMap);
    _ncMarker = L.marker([lat, lng], { icon, draggable: true, autoPan: true }).addTo(_ncMap);
    _ncMarker.on('dragend', () => {
      const pos = _ncMarker.getLatLng();
      _ncGeoResult = {
        lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6),
        source: 'manual_drag', confidence: 'high', verified: true,
        googleMapsUrl: `https://www.google.com/maps?q=${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`,
      };
      _updateNcMarkerIcon('#22c55e');
      _setGeoPreview('url', null); // reusar mensaje "se usarán coords de URL"
    });
  } else {
    _ncMap.setView([lat, lng], 16);
    _ncMarker.setLatLng([lat, lng]);
    _ncMarker.setIcon(icon);
  }

  _ncMarker.bindTooltip(label, { permanent: false, direction: 'top' });
  // Leaflet necesita que el contenedor sea visible para calcular tamaño
  setTimeout(() => _ncMap?.invalidateSize(), DEBOUNCE.LEAFLET_INVALIDATE);
}

function _hideNcMap() {
  const wrap = document.getElementById('nc-map-wrap');
  if (wrap) wrap.style.display = 'none';
}

function _updateNcMarkerIcon(color) {
  if (!_ncMarker) return;
  _ncMarker.setIcon(L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  }));
}

function _setGeoPreview(state, g) {
  const el = document.getElementById('nc-geo-preview');
  if (!el) return;
  const STYLES = {
    loading: { bg: '#f1f5f9', fg: '#64748b', icon: 'loader-2', spin: true  },
    ok:      { bg: '#dcfce7', fg: '#166534', icon: 'check-circle-2', spin: false },
    warn:    { bg: '#fef3c7', fg: '#92400e', icon: 'alert-triangle',  spin: false },
    bad:     { bg: '#fee2e2', fg: '#991b1b', icon: 'alert-triangle',  spin: false },
    miss:    { bg: '#fee2e2', fg: '#991b1b', icon: 'x-circle',        spin: false },
    url:     { bg: '#dbeafe', fg: '#1e40af', icon: 'check-circle-2',  spin: false },
  };
  const s = STYLES[state] || STYLES.warn;
  let msg = '';
  if (state === 'loading') {
    msg = 'Verificando ubicación…';
  } else if (state === 'url') {
    msg = g?.displayName
      ? `Ubicación confirmada — ${g.displayName}`
      : 'Coordenadas obtenidas de Google Maps.';
  } else if (state === 'ok') {
    msg = `Ubicación encontrada: <b>${esc(g.displayName || g.municipio || '')}</b>`;
  } else if (state === 'warn') {
    msg = `Ubicación aproximada: <b>${esc(g.displayName || g.municipio || '')}</b><br>
      <span style="font-size:10.5px">El geocoder ubica la calle pero con precisión media. Si el pin en el mapa sale mal, agrega la URL de Google Maps abajo.</span>`;
  } else if (state === 'bad') {
    msg = `El geocoder encontró una ubicación diferente: <b>${esc(g.displayName || '')}</b><br>
      <span style="font-size:10.5px;font-weight:600">El CP no coincide — es probable que la dirección esté mal ubicada. Agrega la URL de Google Maps para asegurar la ubicación.</span>`;
  } else if (state === 'miss') {
    msg = `No se encontró esta dirección en el mapa.<br>
      <span style="font-size:10.5px;font-weight:600">Agrega una URL de Google Maps para que quede bien ubicado. Sin ella el pin quedará sin coordenadas.</span>`;
  }
  const spinStyle = s.spin ? 'animation:spn 1s linear infinite;' : '';
  el.style.display = '';
  el.innerHTML = `<div style="background:${s.bg};color:${s.fg};border-radius:8px;padding:8px 11px;font-size:12px;line-height:1.5;display:flex;align-items:flex-start;gap:7px">
    <i data-lucide="${s.icon}" style="width:14px;height:14px;flex-shrink:0;margin-top:1px;${spinStyle}"></i>
    <div>${msg}</div>
  </div>`;
  if (typeof refreshIcons === 'function') refreshIcons(el);
}

export function toggleShowCancelled() {
  _showCancelled = !_showCancelled;
  const btn = document.getElementById('btn-toggle-cancelled');
  if (btn) {
    btn.classList.toggle('on', _showCancelled);
    btn.title = _showCancelled ? 'Ocultar cancelados' : 'Mostrar cancelados';
  }
  renderPedidos();
}

// Costos leídos de pricing_config (tabla Supabase). Si runtime-config no
// resolvió todavía, se usan los fallbacks de PRICING_FALLBACK en constants.js.
const getCostoDesinstalacion = () => getPricing('costo_desinstalacion_por_ud');
const getCostoTrasladoDefault = () => getPricing('costo_traslado_default');

// ── CLIENT DROPDOWN ──────────────────────────────────────────────────────────
// Repuebla #p-ce leyendo state.clientes (ordenado por nombre). Seguro de llamar
// aunque el modal no esté abierto — retorna silenciosamente si el elemento no existe.
export function refreshClientesDropdown() {
  const sel = document.getElementById('p-ce');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">— Sin cliente —</option>';
  [...state.clientes]
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    .forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = `${c.nombre} (#${c.id})`;
      sel.appendChild(o);
    });
  if (currentVal) sel.value = currentVal;
}

// ── CLIENT MODE ──────────────────────────────────────────────────────────────
export function setCliMode(m) {
  cliMode = m;
  document.getElementById('cli-ex').style.display = m === 'ex' ? '' : 'none';
  document.getElementById('cli-nw').style.display = m === 'nw' ? '' : 'none';
  document.getElementById('btn-ex').className = 'mode-btn' + (m === 'ex' ? ' on' : '');
  document.getElementById('btn-nw').className = 'mode-btn' + (m === 'nw' ? ' on' : '');
  ['nc-n', 'nc-t', 'nc-d'].forEach(id => { const el = document.getElementById(id); if (el) el.required = m === 'nw'; });
}

// ── LÍNEAS DEL PEDIDO ────────────────────────────────────────────────────────
function blankLinea() {
  return {
    modelo: '', cantidad: 1, precioUnit: 0, stock: null,
    nDesins: 0, ancho: '', alto: '',
    instalacion: 'interior', tipoTela: '', notas: '',
    subTipo: '',
    acIdx: -1,
  };
}

// Lee el DOM y vuelca los valores a lineasForm (fuente de verdad)
function syncDomToLineas() {
  lineasForm.forEach((l, i) => {
    const get = (id) => document.getElementById(id + '-' + i);
    if (get('p-modelo'))  l.modelo      = get('p-modelo').value.trim();
    if (get('p-qty'))     l.cantidad    = Math.max(1, parseInt(get('p-qty').value) || 1);
    if (get('p-ndesins')) l.nDesins     = parseInt(get('p-ndesins').value) || 0;
    if (get('p-ancho'))   l.ancho       = parseFloat(get('p-ancho').value)  || 0;
    if (get('p-alto'))    l.alto        = parseFloat(get('p-alto').value)   || 0;
    if (get('p-inst'))    l.instalacion = get('p-inst').value;
    if (get('p-tela'))    l.tipoTela    = get('p-tela').value.trim();
    if (get('p-notas'))   l.notas       = get('p-notas').value.trim();
    if (get('p-precio'))  l.precioUnit  = parseFloat(get('p-precio').value) || 0;
    if (get('p-subtipo')) l.subTipo     = get('p-subtipo').value;
  });
}

function subtotalLinea(tipo, l) {
  if (tipo === 'Abanico')  return l.cantidad * l.precioUnit + l.nDesins * getCostoDesinstalacion();
  if (tipo === 'Persiana') {
    const m2 = (l.ancho / 100) * (l.alto / 100);
    return l.cantidad * m2 * l.precioUnit;
  }
  return l.cantidad * l.precioUnit;
}

function lineaCardHtml(tipo, l, i, solo) {
  const removeBtn = solo
    ? ''
    : `<button type="button" class="btn bd bsm" onclick="removeLinea(${i})" title="Quitar" style="padding:4px 8px">
         <i data-lucide="trash-2" style="width:12px;height:12px"></i>
       </button>`;

  const header = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-weight:600;font-size:12px;color:var(--mu)">Ítem ${i + 1}</span>
      ${removeBtn}
    </div>`;

  let body = '';
  if (tipo === 'Abanico') {
    const subOpts = SUBTIPO_ABANICO.map(s =>
      `<option value="${s}"${l.subTipo === s ? ' selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('');
    body = `
      <div class="fi full">
        <label>Modelo *</label>
        <div class="ac-wrap">
          <input id="p-modelo-${i}" type="text" autocomplete="off" required value="${esc(l.modelo)}"
                 placeholder="Escribe para buscar modelo…"
                 oninput="onModeloInput(${i})" onkeydown="onModeloKey(event,${i})" onblur="onModeloBlur(${i})"/>
          <div class="ac-list" id="ac-modelo-${i}"></div>
        </div>
        <div id="modelo-info-${i}" style="display:flex;align-items:center;gap:8px;margin-top:4px"></div>
      </div>
      <div class="fi"><label>Instalación</label>
        <select id="p-subtipo-${i}" onchange="calcPedidoTotal()">
          <option value=""${!l.subTipo ? ' selected' : ''}>— Plafón —</option>
          ${subOpts}
        </select>
      </div>
      <div class="fi"><label>Cant. *</label>
        <input id="p-qty-${i}" type="number" min="1" value="${l.cantidad}" required oninput="calcPedidoTotal()"/>
      </div>
      <div class="fi"><label>Desinstalar</label>
        <input id="p-ndesins-${i}" type="number" min="0" value="${l.nDesins}" oninput="calcExtra(${i})"/>
        <span id="desins-hint-${i}" style="font-size:11px;color:var(--wa)"></span>
      </div>`;
  } else if (tipo === 'Persiana') {
    body = `
      <div class="fi full">
        <label>Tela</label>
        <div class="ac-wrap">
          <input id="p-tela-${i}" type="text" autocomplete="off" value="${esc(l.tipoTela)}"
                 placeholder="Escribe para buscar tela…"
                 oninput="onTelaInput(${i})" onkeydown="onTelaKey(event,${i})" onblur="onTelaBlur(${i})"/>
          <div class="ac-list" id="ac-tela-${i}"></div>
        </div>
        <div id="tela-info-${i}" style="display:flex;align-items:center;gap:8px;margin-top:4px"></div>
      </div>
      <div class="fi"><label>Ancho (cm)</label>
        <input id="p-ancho-${i}" type="number" value="${l.ancho || ''}" required oninput="calcPedidoTotal()"/>
      </div>
      <div class="fi"><label>Alto (cm)</label>
        <input id="p-alto-${i}" type="number" value="${l.alto || ''}" required oninput="calcPedidoTotal()"/>
      </div>
      <div class="fi"><label>Instalación</label>
        <select id="p-inst-${i}" onchange="calcPedidoTotal()">
          <option value="interior"${l.instalacion === 'interior' ? ' selected' : ''}>Interior</option>
          <option value="exterior"${l.instalacion === 'exterior' ? ' selected' : ''}>Exterior</option>
        </select>
      </div>
      <div class="fi"><label>Cant. *</label>
        <input id="p-qty-${i}" type="number" min="1" value="${l.cantidad}" required oninput="calcPedidoTotal()"/>
      </div>`;
  } else {
    // Limpieza / Levantamiento / Mantenimiento
    const modeloLabel = tipo === 'Limpieza' ? 'Modelo' : 'Descripción';
    const mantSubtipoHtml = tipo === 'Mantenimiento'
      ? `<div class="fi"><label>Tipo</label>
          <select id="p-subtipo-${i}" onchange="calcPedidoTotal()">
            <option value=""${!l.subTipo ? ' selected' : ''}>— Abanico plafón —</option>
            ${SUBTIPO_MANTENIMIENTO.map(s =>
              `<option value="${s}"${l.subTipo === s ? ' selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
        </div>`
      : '';
    body = `
      <div class="fi full">
        <label>${modeloLabel}</label>
        <input id="p-modelo-${i}" type="text" value="${esc(l.modelo)}" oninput="calcPedidoTotal()"/>
      </div>
      <div class="fi full"><label>Notas</label>
        <textarea id="p-notas-${i}" rows="2" oninput="calcPedidoTotal()">${esc(l.notas)}</textarea>
      </div>
      ${mantSubtipoHtml}
      <div class="fi"><label>Cant. *</label>
        <input id="p-qty-${i}" type="number" min="1" value="${l.cantidad}" required oninput="calcPedidoTotal()"/>
      </div>
      <div class="fi"><label>Precio unit. ($)</label>
        <input id="p-precio-${i}" type="number" min="0" step="0.01" value="${l.precioUnit || 0}" oninput="calcPedidoTotal()"/>
      </div>`;
  }

  const sub = subtotalLinea(tipo, l);
  const footer = `
    <div style="display:flex;justify-content:flex-end;margin-top:4px;font-size:12px;color:var(--mu)">
      Subtotal: <b class="grn" style="margin-left:6px">${money(sub)}</b>
    </div>`;

  return `<div class="linea-card" data-idx="${i}" style="border:1px solid var(--bo);border-radius:10px;padding:10px;margin-bottom:10px;background:var(--bg)">
    ${header}
    <div class="fg" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">${body}</div>
    ${footer}
  </div>`;
}

function renderLineas() {
  const tipo = document.getElementById('p-tipo').value;
  const cont = document.getElementById('p-lineas');
  if (!cont) return;
  if (!tipo) { cont.innerHTML = ''; return; }
  if (!lineasForm.length) lineasForm = [blankLinea()];
  const solo = lineasForm.length === 1;
  cont.innerHTML = lineasForm.map((l, i) => lineaCardHtml(tipo, l, i, solo)).join('');
  refreshIcons(cont);

  // Si hay precios auto-detectados (modelo/tela con match en catálogo), poblar el info-badge
  lineasForm.forEach((l, i) => {
    if (tipo === 'Abanico' && l.precioUnit > 0 && l.modelo) {
      _updateModeloInfo(i, l.modelo, l.precioUnit, l.stock);
    } else if (tipo === 'Persiana' && l.precioUnit > 0 && l.tipoTela) {
      _updateTelaInfo(i, l.precioUnit, l.stock);
    }
  });
}

export function addLinea() {
  syncDomToLineas();
  lineasForm.push(blankLinea());
  renderLineas();
  calcPedidoTotal();
}

export function removeLinea(idx) {
  syncDomToLineas();
  if (lineasForm.length <= 1) return;
  lineasForm.splice(idx, 1);
  renderLineas();
  calcPedidoTotal();
}

// ── FORM VISIBILITY ──────────────────────────────────────────────────────────
export function updatePF() {
  const tipo = document.getElementById('p-tipo').value;
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };
  const hasTipo = !!tipo;
  show('r-lineas-hd', hasTipo);
  show('r-lineas',    hasTipo);
  // Al cambiar de tipo, vaciar líneas (los campos no son compatibles entre tipos)
  lineasForm = [blankLinea()];
  renderLineas();
  calcPedidoTotal();
}

// ── DESINSTALACIÓN HINT (por línea) ──────────────────────────────────────────
export function calcExtra(idx) {
  const n = parseInt(document.getElementById('p-ndesins-' + idx)?.value) || 0;
  const el = document.getElementById('desins-hint-' + idx);
  if (el) el.textContent = n > 0 ? `+$${n * getCostoDesinstalacion()} por desinstalación` : '';
  calcPedidoTotal();
}

// ── TOTAL AUTO-CALCULATION ───────────────────────────────────────────────────
export function calcPedidoTotal() {
  syncDomToLineas();
  const tipo     = document.getElementById('p-tipo').value;
  const traslado = parseFloat(document.getElementById('p-traslado')?.value) || 0;
  const totalLineas = lineasForm.reduce((s, l) => s + subtotalLinea(tipo, l), 0);
  const total = totalLineas + traslado;

  // Actualizar subtotales visibles en cada card (sin re-renderizar para no perder foco)
  lineasForm.forEach((l, i) => {
    const card = document.querySelector(`.linea-card[data-idx="${i}"]`);
    if (!card) return;
    const sub = card.querySelector('.grn');
    if (sub) sub.textContent = money(subtotalLinea(tipo, l));
  });

  const totalEl = document.getElementById('p-total');
  if (totalEl) totalEl.value = total.toFixed(2);

  // Duración estimada según tipo de servicio + instalación + cantidad
  const durWrap = document.getElementById('p-duracion-wrap');
  const durTxt  = document.getElementById('p-duracion-txt');
  if (durWrap && durTxt) {
    if (tipo) {
      const minutos = estimatePedidoDurationMin(tipo, lineasForm);
      durTxt.textContent = fmtDuracion(minutos);
      durWrap.style.display = '';
    } else {
      durWrap.style.display = 'none';
    }
  }
}

// ── AUTOCOMPLETE HELPERS ─────────────────────────────────────────────────────
function highlight(text, q) {
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx)) +
    '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>' +
    esc(text.slice(idx + q.length));
}

function stockClass(n) {
  return n > 3 ? 'ac-stock-ok' : n > 0 ? 'ac-stock-lo' : 'ac-stock-no';
}

function getAggregated(categoria) {
  const map = {};
  state.almacenamiento
    .filter(a => a.categoria === categoria)
    .forEach(a => {
      if (!map[a.modelo]) map[a.modelo] = { modelo: a.modelo, precio: a.precio, cantidad: 0 };
      map[a.modelo].cantidad += a.cantidad;
    });
  return Object.values(map).sort((a, b) => a.modelo.localeCompare(b.modelo));
}

// ── MODELO AUTOCOMPLETE (ABANICO) ────────────────────────────────────────────
export function onModeloInput(idx) {
  const inp = document.getElementById('p-modelo-' + idx);
  if (!inp) return;
  const q    = inp.value.trim();
  const list = getAggregated('abanico').filter(m =>
    !q || m.modelo.toLowerCase().includes(q.toLowerCase())
  );
  const ac = document.getElementById('ac-modelo-' + idx);
  if (lineasForm[idx]) lineasForm[idx].acIdx = -1;
  if (!list.length) { ac?.classList.remove('open'); return; }
  ac.innerHTML = list.map((m, i) =>
    `<div class="ac-item" data-idx="${i}"
         onmousedown="selectModelo(${idx},'${esc(m.modelo).replace(/'/g, "\\'")}',${m.precio},${m.cantidad})">
       <span class="ac-item-name">${highlight(m.modelo, q)}</span>
       <span class="ac-item-stock ${stockClass(m.cantidad)}">Disp: ${m.cantidad}</span>
       <span class="ac-item-meta">${money(m.precio)}/ud</span>
     </div>`
  ).join('');
  ac.classList.add('open');
}

export function onModeloKey(e, idx) {
  const ac    = document.getElementById('ac-modelo-' + idx);
  const items = ac ? ac.querySelectorAll('.ac-item') : [];
  if (!items.length) return;
  const l = lineasForm[idx] || {};
  if      (e.key === 'ArrowDown')                { e.preventDefault(); l.acIdx = Math.min((l.acIdx ?? -1) + 1, items.length - 1); }
  else if (e.key === 'ArrowUp')                  { e.preventDefault(); l.acIdx = Math.max((l.acIdx ?? 0) - 1, 0); }
  else if (e.key === 'Enter' && l.acIdx >= 0)    { e.preventDefault(); items[l.acIdx].dispatchEvent(new MouseEvent('mousedown')); return; }
  else if (e.key === 'Escape')                   { ac.classList.remove('open'); return; }
  items.forEach((el, i) => el.classList.toggle('focused', i === l.acIdx));
  if (l.acIdx >= 0) items[l.acIdx].scrollIntoView({ block: 'nearest' });
}

export function onModeloBlur(idx) {
  setTimeout(() => document.getElementById('ac-modelo-' + idx)?.classList.remove('open'), DEBOUNCE.AUTOCOMPLETE);
}

export function selectModelo(idx, nombre, precio, stock) {
  const inp = document.getElementById('p-modelo-' + idx);
  if (inp) inp.value = nombre;
  document.getElementById('ac-modelo-' + idx)?.classList.remove('open');
  if (lineasForm[idx]) {
    lineasForm[idx].modelo     = nombre;
    lineasForm[idx].precioUnit = precio;
    lineasForm[idx].stock      = stock;
    lineasForm[idx].acIdx      = -1;
  }
  _updateModeloInfo(idx, nombre, precio, stock);
  calcPedidoTotal();
}

function _updateModeloInfo(idx, nombre, precio, stock) {
  const el = document.getElementById('modelo-info-' + idx);
  if (!el) return;
  if (precio > 0) {
    const qty = typeof stock !== 'undefined' && stock !== null ? stock : (() => {
      const agg = getAggregated('abanico').find(m => m.modelo === nombre);
      return agg ? agg.cantidad : null;
    })();
    const stockHtml = qty !== null
      ? `<span class="ac-item-stock ${stockClass(qty)}" style="border-radius:10px;padding:1px 8px">Disp: ${qty} ud</span>`
      : '';
    el.innerHTML = `<span style="font-size:11px;color:var(--mu)">${money(precio)}/ud</span>${stockHtml ? '&nbsp;&nbsp;' + stockHtml : ''}`;
  } else {
    el.innerHTML = '';
  }
}

// ── TELA AUTOCOMPLETE (PERSIANA) ─────────────────────────────────────────────
export function onTelaInput(idx) {
  const inp = document.getElementById('p-tela-' + idx);
  if (!inp) return;
  const q    = inp.value.trim();
  const list = getAggregated('persiana').filter(m =>
    !q || m.modelo.toLowerCase().includes(q.toLowerCase())
  );
  const ac = document.getElementById('ac-tela-' + idx);
  if (lineasForm[idx]) lineasForm[idx].acIdx = -1;
  if (!list.length) { ac?.classList.remove('open'); return; }
  ac.innerHTML = list.map((m, i) =>
    `<div class="ac-item" data-idx="${i}"
         onmousedown="selectTela(${idx},'${esc(m.modelo).replace(/'/g, "\\'")}',${m.precio},${m.cantidad})">
       <span class="ac-item-name">${highlight(m.modelo, q)}</span>
       <span class="ac-item-stock ${stockClass(m.cantidad)}">Disp: ${m.cantidad} m</span>
       <span class="ac-item-meta">${money(m.precio)}/m²</span>
     </div>`
  ).join('');
  ac.classList.add('open');
}

export function onTelaKey(e, idx) {
  const ac    = document.getElementById('ac-tela-' + idx);
  const items = ac ? ac.querySelectorAll('.ac-item') : [];
  if (!items.length) return;
  const l = lineasForm[idx] || {};
  if      (e.key === 'ArrowDown')                { e.preventDefault(); l.acIdx = Math.min((l.acIdx ?? -1) + 1, items.length - 1); }
  else if (e.key === 'ArrowUp')                  { e.preventDefault(); l.acIdx = Math.max((l.acIdx ?? 0) - 1, 0); }
  else if (e.key === 'Enter' && l.acIdx >= 0)    { e.preventDefault(); items[l.acIdx].dispatchEvent(new MouseEvent('mousedown')); return; }
  else if (e.key === 'Escape')                   { ac.classList.remove('open'); return; }
  items.forEach((el, i) => el.classList.toggle('focused', i === l.acIdx));
  if (l.acIdx >= 0) items[l.acIdx].scrollIntoView({ block: 'nearest' });
}

export function onTelaBlur(idx) {
  setTimeout(() => document.getElementById('ac-tela-' + idx)?.classList.remove('open'), DEBOUNCE.AUTOCOMPLETE);
}

export function selectTela(idx, nombre, precio, stock) {
  const inp = document.getElementById('p-tela-' + idx);
  if (inp) inp.value = nombre;
  document.getElementById('ac-tela-' + idx)?.classList.remove('open');
  if (lineasForm[idx]) {
    lineasForm[idx].tipoTela   = nombre;
    lineasForm[idx].precioUnit = precio;
    lineasForm[idx].stock      = stock;
    lineasForm[idx].acIdx      = -1;
  }
  _updateTelaInfo(idx, precio, stock);
  calcPedidoTotal();
}

function _updateTelaInfo(idx, precio, stock) {
  const el = document.getElementById('tela-info-' + idx);
  if (!el) return;
  const stockHtml = stock !== null && stock !== undefined
    ? `&nbsp;&nbsp;<span class="ac-item-stock ${stockClass(stock)}" style="border-radius:10px;padding:1px 8px">Disp: ${stock} m</span>`
    : '';
  el.innerHTML = `<span style="font-size:11px;color:var(--mu)">${money(precio)}/m²</span>${stockHtml}`;
}

// ── OPEN MODAL ───────────────────────────────────────────────────────────────
function _populateMuniSelect() {
  const sel = document.getElementById('nc-muni');
  if (!sel || sel.dataset.populated) return;
  MUNICIPIOS_LIST.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  });
  sel.dataset.populated = '1';
}

export async function openPedidoModal(id = null) {
  document.getElementById('fp').reset();
  document.getElementById('p-eid').value = '';
  _populateMuniSelect();
  // Resetear estado del geocoder preview
  _ncGeoResult = null;
  _lastPreviewKey = '';
  clearTimeout(_previewDebounce);
  _hideNcMap();
  const prev = document.getElementById('nc-geo-preview');
  if (prev) prev.style.display = 'none';
  // Destruir mapa anterior para evitar conflictos al reabrir el modal
  if (_ncMap) { _ncMap.remove(); _ncMap = null; _ncMarker = null; }
  document.getElementById('mp-t').textContent = id ? 'Editar Pedido' : 'Nuevo Pedido';
  document.getElementById('p-fecha').value = todayStr();
  lineasForm = [];
  setCliMode('ex');
  refreshClientesDropdown();
  // Populate technicians from DB (with fallback to constants)
  const tecSel = document.getElementById('p-tecnico');
  tecSel.innerHTML = '<option value="">— Ninguno —</option>';
  const tecList = state.tecnicos && state.tecnicos.length ? state.tecnicos : [];
  tecList.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.nombre;
    opt.textContent = t.nombre;
    tecSel.appendChild(opt);
  });

  // Set default traslado
  const trasladoEl = document.getElementById('p-traslado');
  if (trasladoEl) trasladoEl.value = getCostoTrasladoDefault();

  if (!id) {
    document.getElementById('p-tipo').value = 'Abanico';
    lineasForm = [blankLinea()];
    updatePF();
  }
  if (id !== null) {
    const p = state.pedidos.find(x => x.id === id); if (!p) return;
    document.getElementById('p-eid').value   = id;
    document.getElementById('p-ce').value    = p.clienteId || '';
    document.getElementById('p-tipo').value  = p.tipoServicio;
    document.getElementById('p-fecha').value = p.fecha || todayStr();
    if (trasladoEl) trasladoEl.value = p.detalles?.traslado ?? getCostoTrasladoDefault();

    // Cargar líneas: prefer pedido_detalle (nuevo), fallback al JSONB legacy
    let dets = [];
    try {
      const rows = await api.pedidos.detalle(id);
      dets = (rows || []).map(pdFromDb);
    } catch (_) { /* sigue con legacy */ }

    if (dets.length) {
      lineasForm = dets.map(d => _lineaFromDetalle(d, p.tipoServicio));
    } else {
      lineasForm = [_lineaFromLegacy(p)];
    }

    // Mostrar sección de líneas sin pasar por updatePF (que resetea lineasForm).
    document.getElementById('r-lineas-hd').style.display = '';
    document.getElementById('r-lineas').style.display    = '';
    renderLineas();
    calcPedidoTotal();

    const cli = p.clienteId ? state.clientes.find(c => c.id === +p.clienteId) : null;
    if (cli) document.getElementById('p-pago').value = cli.metodoPago;
    const sm = state.servicios_metricas.find(s => s.pedido_id === id);
    if (sm) {
      if (sm.hora_programada) document.getElementById('p-hora-prog').value = sm.hora_programada;
      if (sm.tecnico)         document.getElementById('p-tecnico').value    = sm.tecnico;
      if (sm.orden_ruta)      document.getElementById('p-orden-ruta').value = sm.orden_ruta;
    }
  }
  openOv('ov-ped');
}

function _lineaFromDetalle(d, tipo) {
  const l = blankLinea();
  l.cantidad   = d.cantidad || 1;
  l.precioUnit = d.precioUnitario || 0;
  if (tipo === 'Abanico') {
    l.modelo  = d.modeloAbanico || d.descripcion || '';
    l.nDesins = d.desinstalarCantidad || 0;
    l.subTipo = d.sistemaInstalacion || '';
    const agg = getAggregated('abanico').find(m => m.modelo === l.modelo);
    if (agg) l.stock = agg.cantidad;
  } else if (tipo === 'Persiana') {
    l.tipoTela    = d.telaColor || '';
    l.ancho       = d.anchoM ? d.anchoM * 100 : '';
    l.alto        = d.altoM  ? d.altoM  * 100 : '';
    l.instalacion = d.sistemaInstalacion || 'interior';
    const agg = getAggregated('persiana').find(m => m.modelo === l.tipoTela);
    if (agg) l.stock = agg.cantidad;
  } else {
    l.modelo = d.descripcion || '';
    l.notas  = d.notas || '';
    if (tipo === 'Mantenimiento') l.subTipo = d.sistemaInstalacion || '';
  }
  return l;
}

function _lineaToDetalle(tipo, l) {
  const base = {
    tipoLinea: 'item',
    cantidad: l.cantidad || 1,
    precioUnitario: l.precioUnit || 0,
    requiereServicio: true,
  };
  if (tipo === 'Abanico') {
    return {
      ...base,
      descripcion: l.modelo || 'Abanico',
      unidadMedida: 'pieza',
      modeloAbanico: l.modelo || null,
      desinstalarCantidad: l.nDesins || null,
      sistemaInstalacion: l.subTipo || null,
    };
  }
  if (tipo === 'Persiana') {
    return {
      ...base,
      descripcion: l.tipoTela || 'Persiana',
      unidadMedida: 'm2',
      telaColor: l.tipoTela || null,
      anchoM: l.ancho ? l.ancho / 100 : null,
      altoM:  l.alto  ? l.alto  / 100 : null,
      sistemaInstalacion: l.instalacion || null,
    };
  }
  return {
    ...base,
    descripcion: l.modelo || tipo || 'Servicio',
    unidadMedida: 'pieza',
    notas: l.notas || null,
    sistemaInstalacion: tipo === 'Mantenimiento' ? (l.subTipo || null) : null,
  };
}

function _lineaFromLegacy(p) {
  const d = p.detalles || {};
  const l = blankLinea();
  l.cantidad   = p.cantidad || 1;
  l.precioUnit = l.cantidad > 0 ? (p.total || 0) / l.cantidad : 0;
  if (p.tipoServicio === 'Abanico') {
    l.modelo  = d.modelo  || '';
    l.nDesins = d.nDesins || 0;
    const agg = getAggregated('abanico').find(m => m.modelo === l.modelo);
    if (agg) { l.precioUnit = agg.precio; l.stock = agg.cantidad; }
  } else if (p.tipoServicio === 'Persiana') {
    l.ancho       = d.ancho || '';
    l.alto        = d.alto  || '';
    l.instalacion = d.instalacion || 'interior';
    l.tipoTela    = d.tipoTela || '';
    const agg = getAggregated('persiana').find(m => m.modelo === l.tipoTela);
    if (agg) { l.precioUnit = agg.precio; l.stock = agg.cantidad; }
  } else {
    l.modelo = d.modelo || '';
    l.notas  = d.notas  || '';
  }
  return l;
}

// ── SUBMIT ───────────────────────────────────────────────────────────────────
export async function submitPedido(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-sp');
  btn.innerHTML = '<span class="sp"></span> Guardando…'; btn.disabled = true;
  const eid       = document.getElementById('p-eid').value;
  const tipo      = document.getElementById('p-tipo').value;
  const fecha     = document.getElementById('p-fecha').value;
  const pago      = document.getElementById('p-pago').value;
  const horaProg  = document.getElementById('p-hora-prog').value || null;
  const tecnico   = document.getElementById('p-tecnico').value || null;
  const ordenRuta = document.getElementById('p-orden-ruta').value ? parseInt(document.getElementById('p-orden-ruta').value) : null;
  let clienteId = null;
  try {
    if (cliMode === 'nw') {
      const nombre    = document.getElementById('nc-n').value.trim();
      const numero    = document.getElementById('nc-t').value.trim();
      const calle     = document.getElementById('nc-calle').value.trim();
      const colonia   = document.getElementById('nc-col')?.value.trim() || '';
      const municipio = document.getElementById('nc-muni').value || _ncGeoResult?.municipio || '';
      const url       = document.getElementById('nc-url')?.value.trim() || '';

      if (!calle)     { alert('Ingresa la calle y número.'); throw new Error('Falta calle'); }
      if (!municipio) { alert('Selecciona el municipio (o pega una URL de Google Maps para detectarlo automáticamente).'); throw new Error('Falta municipio'); }

      // CP y zona vienen del reverse geocode del pin — no del formulario
      const cp   = _ncGeoResult?.codigoPostal || null;
      const zona = cp ? zonaFromCP(municipio, cp) : null;

      // Dirección para display y para Outlook
      const dir = [calle, colonia, cp ? `${cp} ${municipio}` : municipio, 'N.L.'].filter(Boolean).join(', ');

      // Coordenadas: reusar _ncGeoResult del preview en vivo (URL o geocoder)
      btn.innerHTML = '<span class="sp"></span> Guardando…';
      let loc = _ncGeoResult?.lat != null ? _ncGeoResult : null;

      // Si el preview no corrió (usuario no pegó URL ni hizo blur), intentar ahora
      if (!loc && url) {
        const r = await resolveLocation({ url });
        if (r?.error === 'low_zoom_search') {
          alert(`La URL tiene zoom muy alejado. Abre el pin del lugar en Google Maps y copia esa URL.`);
          throw new Error('URL imprecisa');
        }
        loc = r?.lat != null ? r : null;
      }

      const row = await api.clientes.create({
        nombre, numero,
        direccion: dir,
        metodo_pago: pago,
        num_pedido: null,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        municipio,
        google_maps_url: loc?.googleMapsUrl || url || null,
        codigo_postal: cp,
        zona,
        geocode_source: loc?.source || null,
        geocode_confidence: loc?.confidence || null,
        ubicacion_verificada: !!loc?.verified,
        verified_at: loc?.verified ? new Date().toISOString() : null,
      });
      const nc = cFromDb(row);
      state.clientes.push(nc);
      refreshClientesDropdown();
      clienteId = nc.id;
      toast(`Cliente creado: ${nombre} · ${municipio} ${zona}`);
    } else {
      clienteId = document.getElementById('p-ce').value ? +document.getElementById('p-ce').value : null;
      if (clienteId) {
        const ci = state.clientes.findIndex(c => c.id === clienteId);
        if (ci !== -1 && state.clientes[ci].metodoPago !== pago) {
          const updated = { ...state.clientes[ci], metodoPago: pago };
          await api.clientes.update(clienteId, cToDb(updated));
          state.clientes[ci] = updated;
        }
      }
    }
    syncDomToLineas();
    if (!lineasForm.length) throw new Error('Agrega al menos un ítem');

    const traslado = parseFloat(document.getElementById('p-traslado')?.value) || 0;
    const totalLineas = lineasForm.reduce((s, l) => s + subtotalLinea(tipo, l), 0);
    const total = totalLineas + traslado;
    const qty = lineasForm.reduce((s, l) => s + (l.cantidad || 1), 0);

    // Detalles legacy JSONB — persistimos la primera línea para compatibilidad con
    // pedidoDetalle(p) si por alguna razón las líneas no están cargadas aún, y traslado.
    const primera = lineasForm[0];
    let detalles = { traslado };
    if (tipo === 'Abanico')       Object.assign(detalles, { modelo: primera.modelo, nDesins: primera.nDesins });
    else if (tipo === 'Persiana') Object.assign(detalles, { ancho: primera.ancho, alto: primera.alto, instalacion: primera.instalacion, tipoTela: primera.tipoTela });
    else if (tipo === 'Limpieza') Object.assign(detalles, { modelo: primera.modelo, notas: primera.notas });
    else                          Object.assign(detalles, { notas: primera.notas });

    const lineasPayload = lineasForm.map(l => pdToDb(_lineaToDetalle(tipo, l)));

    btn.innerHTML = '<span class="sp"></span> Guardando…';
    const cli = clienteId ? state.clientes.find(c => c.id === clienteId) : null;

    if (eid) {
      const p = state.pedidos.find(x => x.id === +eid);
      if (p) {
        await api.pedidos.update(+eid, pToDb({ ...p, clienteId, tipoServicio: tipo, fecha, cantidad: qty, total, detalles }));
        await api.pedidos.replaceDetalle(+eid, lineasPayload);
        const i = state.pedidos.findIndex(x => x.id === +eid);
        if (i !== -1) state.pedidos[i] = { ...state.pedidos[i], clienteId, tipoServicio: tipo, fecha, cantidad: qty, total, detalles };
        // refrescar pedido_detalle local
        state.pedidoDetalle = (state.pedidoDetalle || []).filter(d => d.pedidoId !== +eid)
          .concat(lineasForm.map(l => ({ ..._lineaToDetalle(tipo, l), pedidoId: +eid })));
        toast('Pedido actualizado');
      }
      const existingSM = state.servicios_metricas.find(s => s.pedido_id === +eid);
      if (existingSM) {
        await api.metricas.update(existingSM.id, { tecnico: tecnico || '', hora_programada: horaProg, zona: cli?.municipio || '', orden_ruta: ordenRuta });
        const si = state.servicios_metricas.findIndex(s => s.id === existingSM.id);
        if (si !== -1) state.servicios_metricas[si] = { ...state.servicios_metricas[si], tecnico: tecnico || '', hora_programada: horaProg, zona: cli?.municipio || '', orden_ruta: ordenRuta };
      } else if (horaProg || tecnico) {
        const row = await api.metricas.create({ pedido_id: +eid, tecnico: tecnico || '', hora_programada: horaProg, zona: cli?.municipio || '', orden_ruta: ordenRuta, estado: 'programado', dia_semana: getDiaSemana(fecha) });
        state.servicios_metricas.push(smFromDb(row));
      }
    } else {
      const row = await api.pedidos.create(pToDb({ clienteId, tipoServicio: tipo, fecha, cantidad: qty, total, detalles }));
      const np = pFromDb(row);
      state.pedidos.push(np);
      await api.pedidos.replaceDetalle(np.id, lineasPayload);
      state.pedidoDetalle = (state.pedidoDetalle || [])
        .concat(lineasForm.map(l => ({ ..._lineaToDetalle(tipo, l), pedidoId: np.id })));
      if (clienteId) {
        const ci = state.clientes.findIndex(c => c.id === clienteId);
        if (ci !== -1 && !state.clientes[ci].numPedido) {
          const numPedido = 'PED-' + String(np.id).padStart(3, '0');
          await api.clientes.update(clienteId, cToDb({ ...state.clientes[ci], numPedido }));
          state.clientes[ci] = { ...state.clientes[ci], numPedido };
        }
      }
      if (horaProg || tecnico) {
        const smRow = await api.metricas.create({ pedido_id: np.id, tecnico: tecnico || '', hora_programada: horaProg, zona: cli?.municipio || '', orden_ruta: ordenRuta, estado: 'programado', dia_semana: getDiaSemana(fecha) });
        state.servicios_metricas.push(smFromDb(smRow));
      }
      toast('Pedido creado');
    }
    renderPedidos(); renderDash(); closeOv('ov-ped');
    if (document.getElementById('tab-cal').classList.contains('active')) window.renderCal?.();
  } catch (err) { toast('Error: ' + err.message, 'er'); }
  btn.innerHTML = 'Guardar'; btn.disabled = false;
}


export async function deletePedido(id) {
  if (!confirm('¿Cancelar este pedido? Quedará marcado como cancelado.')) return;
  try {
    await api.pedidos.delete(id);
    // Marcar como cancelado en estado local (soft delete)
    const pi = state.pedidos.findIndex(x => x.id === id);
    if (pi !== -1) state.pedidos[pi] = { ...state.pedidos[pi], estado: 'cancelado' };
    renderPedidos(); renderDash(); toast('Pedido cancelado');
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}

export function renderPedidos() {
  const q = (document.getElementById('qp')?.value || '').toLowerCase();
  const tbody = document.getElementById('tbp'), empty = document.getElementById('ep');

  // Sincronizar botón de toggle
  const btn = document.getElementById('btn-toggle-cancelled');
  if (btn) {
    btn.classList.toggle('on', _showCancelled);
    btn.title = _showCancelled ? 'Ocultar cancelados' : 'Mostrar cancelados';
  }

  const isCancelled = p => (p.estado || '').toLowerCase() === 'cancelado';
  const tecnicoFilter = state._tecnicoNombre || null;

  const list = state.pedidos.filter(p => {
    if (!_showCancelled && isCancelled(p)) return false;
    if (tecnicoFilter) {
      const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
      if (!sm || sm.tecnico !== tecnicoFilter) return false;
    }
    const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    return String(p.id).includes(q) || (p.tipoServicio || '').toLowerCase().includes(q) ||
      (p.detalles?.modelo || '').toLowerCase().includes(q) ||
      (p.detalles?.tipoTela || '').toLowerCase().includes(q) ||
      (c?.nombre || '').toLowerCase().includes(q) ||
      (p.fecha || '').includes(q);
  });

  if (!list.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = list.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).map(p => {
    const c       = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    const sm      = state.servicios_metricas.find(s => s.pedido_id === p.id);
    const cancelled = isCancelled(p);
    const lineas = (state.pedidoDetalle || []).filter(d => d.pedidoId === p.id);
    const cantTotal = lineas.length ? lineas.reduce((s, l) => s + (l.cantidad || 0), 0) : p.cantidad;
    const hasExpand = lineas.length > 1;
    const expandBtn = hasExpand
      ? `<button class="btn bw bsm expand-btn" onclick="togglePedidoExpand(${p.id})" title="Ver ítems" style="padding:2px 6px;margin-right:4px">
           <i data-lucide="chevron-right" style="width:12px;height:12px" id="exp-ico-${p.id}"></i>
         </button>`
      : '';
    const row = `<tr${cancelled ? ' style="opacity:0.5"' : ''} data-pedido-id="${p.id}">
      <td data-label="ID" class="mob-det"><span class="pill pi">#${p.id}</span></td>
      <td data-label="Fecha" class="nw mob-det">${fdateShort(p.fecha)}</td>
      <td data-label="Cliente">${c ? `<span class="bold">${esc(c.nombre)}</span>` : '<span class="mu">Sin cliente</span>'}</td>
      <td data-label="Servicio">${tipoPill(p.tipoServicio)}</td>
      <td data-label="Detalle" class="mob-det">${expandBtn}${pedidoDetalle(p)}</td>
      <td data-label="Cant." class="tr mob-det">${cantTotal}</td>
      <td data-label="Total" class="bold grn nw">${money(p.total)}</td>
      <td data-label="Estado">${cancelled ? '<span style="font-size:11px;background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:20px;font-weight:600">Cancelado</span>' : sm ? statusPill(sm.estado) : '<span class="mu" style="font-size:11px">Sin tracking</span>'}</td>
      <td class="td-act nw">
        ${!cancelled ? `
        <button class="btn bsm" style="background:#dbeafe;color:#1d4ed8" onclick="openTrackModal(${p.id})" title="Seguimiento">
          <i data-lucide="map-pin" style="width:12px;height:12px"></i>
        </button>
        <button class="btn bw bsm" onclick="openPedidoModal(${p.id})" title="Editar">
          <i data-lucide="pencil" style="width:12px;height:12px"></i>
        </button>
        <button class="btn bd bsm" onclick="deletePedido(${p.id})" title="Cancelar">
          <i data-lucide="trash-2" style="width:12px;height:12px"></i>
        </button>` : '—'}
      </td></tr>`;
    const expandRow = hasExpand
      ? `<tr class="pedido-expand" id="exp-${p.id}" style="display:none;background:var(--bg)">
          <td colspan="9" style="padding:8px 16px">
            <table style="width:100%;font-size:12.5px">
              <thead><tr style="color:var(--mu);font-weight:600">
                <th style="text-align:left;padding:4px 6px">Ítem</th>
                <th style="text-align:right;padding:4px 6px">Cant.</th>
                <th style="text-align:right;padding:4px 6px">Precio unit.</th>
                <th style="text-align:right;padding:4px 6px">Subtotal</th>
              </tr></thead>
              <tbody>
                ${lineas.map(l => `<tr>
                  <td style="padding:4px 6px">${esc(l.modeloAbanico || l.telaColor || l.descripcion || '—')}</td>
                  <td style="text-align:right;padding:4px 6px">${l.cantidad}</td>
                  <td style="text-align:right;padding:4px 6px">${money(l.precioUnitario)}</td>
                  <td style="text-align:right;padding:4px 6px" class="bold">${money(l.subtotal || (l.cantidad * l.precioUnitario))}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </td>
         </tr>`
      : '';
    return row + expandRow;
  }).join('');

  const activeCount = state.pedidos.filter(p => !isCancelled(p)).length;
  badge(activeCount + ' pedidos');
  refreshIcons(tbody);
  initMobileRows(tbody);
}

export function togglePedidoExpand(id) {
  const row = document.getElementById('exp-' + id);
  const ico = document.getElementById('exp-ico-' + id);
  if (!row) return;
  const open = row.style.display !== 'none';
  row.style.display = open ? 'none' : '';
  if (ico) {
    ico.setAttribute('data-lucide', open ? 'chevron-right' : 'chevron-down');
    refreshIcons(ico.parentElement);
  }
}

export function exportPedidos() {
  if (!state.pedidos.length) return toast('No hay pedidos para exportar', 'er');
  const headers = ['ID', 'Fecha', 'Cliente', 'Servicio', 'Modelo', 'Cantidad', 'PrecioUnit', 'Subtotal', 'TotalPedido', 'Estado'];
  const rows = [];
  state.pedidos.forEach(p => {
    const c  = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
    const cliente = `"${(c?.nombre || 'Sin cliente').replace(/"/g, '""')}"`;
    const estado = sm ? sm.estado : 'N/A';
    const lineas = (state.pedidoDetalle || []).filter(d => d.pedidoId === p.id);
    if (lineas.length) {
      lineas.forEach(l => {
        const modelo = `"${(l.modeloAbanico || l.telaColor || l.descripcion || '').replace(/"/g, '""')}"`;
        rows.push([p.id, p.fecha, cliente, p.tipoServicio, modelo, l.cantidad, l.precioUnitario, l.subtotal || (l.cantidad * l.precioUnitario), p.total, estado]);
      });
    } else {
      const modelo = `"${(p.detalles?.modelo || p.detalles?.tipoTela || '').replace(/"/g, '""')}"`;
      const unit = p.cantidad > 0 ? p.total / p.cantidad : 0;
      rows.push([p.id, p.fecha, cliente, p.tipoServicio, modelo, p.cantidad, unit, p.total, p.total, estado]);
    }
  });
  downloadCSV([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), `pedidos_moonlighting_${todayStr()}.csv`);
  toast('Listado de pedidos exportado');
}
