import { state } from '../state.js';
import { esc, money, fdate, todayStr, tipoPill, statusPill, pillPago, pedidoDetalle, muniColor } from '../utils.js';
import { TIPO_IC, TIPO_BG, TIPO_CO, STATUS_COLORS } from '../constants.js';
import { refreshIcons } from '../icons.js';
import { estimatePedidoDurationMin, fmtDuracion, addMinutesHHMM } from '../durations.js';

let calMode = 'week';
let calDate = new Date();

const DIAS  = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ── Filtros ───────────────────────────────────────────────────────────────────
let calFilter = {
  tipos:      new Set(),   // vacío = todos
  tecnico:    '',
  estado:     '',
  cancelados: false,
};
let _filterReady = false;

function isCancelled(p) { return (p.estado || '').toLowerCase() === 'cancelado'; }

function pedidoPassFilter(p) {
  if (!calFilter.cancelados && isCancelled(p)) return false;
  if (calFilter.tipos.size > 0 && !calFilter.tipos.has(p.tipoServicio)) return false;
  if (calFilter.estado) {
    const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
    if ((sm?.estado || 'none') !== calFilter.estado) return false;
  }
  if (calFilter.tecnico) {
    const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
    if (!sm || sm.tecnico !== calFilter.tecnico) return false;
  }
  return true;
}

export function calSetTipo(tipo) {
  if (calFilter.tipos.size === 0) {
    calFilter.tipos.add(tipo);
  } else if (calFilter.tipos.has(tipo) && calFilter.tipos.size === 1) {
    calFilter.tipos.clear();
  } else if (calFilter.tipos.has(tipo)) {
    calFilter.tipos.delete(tipo);
  } else {
    calFilter.tipos.add(tipo);
  }
  const empty = calFilter.tipos.size === 0;
  document.querySelectorAll('.cal-chip-tipo[data-tipo]').forEach(c =>
    c.classList.toggle('on', empty || calFilter.tipos.has(c.dataset.tipo))
  );
  _updateResetBtn();
  renderCal();
}

export function calSetFilter(field) {
  const idMap = { tecnico: 'cal-f-tecnico', estado: 'cal-f-estado' };
  calFilter[field] = document.getElementById(idMap[field])?.value || '';
  _updateResetBtn();
  renderCal();
}

export function calToggleCancelados() {
  calFilter.cancelados = !calFilter.cancelados;
  const btn = document.getElementById('cal-f-cancelados');
  if (btn) btn.classList.toggle('on', calFilter.cancelados);
  _updateResetBtn();
  renderCal();
}

export function calResetFilter() {
  calFilter.tipos.clear();
  calFilter.tecnico = '';
  calFilter.estado = '';
  calFilter.cancelados = false;
  const tecEl = document.getElementById('cal-f-tecnico');
  const estEl = document.getElementById('cal-f-estado');
  if (tecEl) tecEl.value = '';
  if (estEl) estEl.value = '';
  const btn = document.getElementById('cal-f-cancelados');
  if (btn) btn.classList.remove('on');
  document.querySelectorAll('.cal-chip-tipo[data-tipo]').forEach(c => c.classList.add('on'));
  _updateResetBtn();
  renderCal();
}

function _updateResetBtn() {
  const active = calFilter.tipos.size > 0 || calFilter.tecnico || calFilter.estado || calFilter.cancelados;
  const btn = document.getElementById('cal-f-reset');
  if (btn) btn.style.display = active ? '' : 'none';
}

function _initFilter() {
  if (_filterReady) return;
  _filterReady = true;

  // Chips de tipo
  const chipsEl = document.getElementById('cal-f-chips');
  if (chipsEl) {
    chipsEl.innerHTML = Object.entries(TIPO_IC).map(([t, iconName]) => {
      const bg = TIPO_BG[t] || '#f1f5f9', co = TIPO_CO[t] || '#475569';
      return `<span class="cal-chip-tipo mf-chip on" data-tipo="${t}" style="background:${bg};color:${co}" onclick="calSetTipo('${t}')">
        <i data-lucide="${iconName}" style="width:11px;height:11px;vertical-align:middle"></i> ${t}
      </span>`;
    }).join('');
    refreshIcons(chipsEl);
  }

  // Select de técnico
  const tecEl = document.getElementById('cal-f-tecnico');
  if (tecEl && tecEl.options.length <= 1) {
    state.tecnicos.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.nombre;
      opt.textContent = t.nombre;
      tecEl.appendChild(opt);
    });
  }
}

// ── Navegación ────────────────────────────────────────────────────────────────
export function calNav(dir) { calDate = new Date(calDate.getTime() + (calMode === 'week' ? dir * 7 : dir) * 86400000); renderCal(); }
export function calToday()  { calDate = new Date(); renderCal(); }
export function setCalMode(m) { calMode = m; renderCal(); }
export function goToDay(ds) { calDate = new Date(ds + 'T12:00:00'); setCalMode('day'); }

export function renderCal() {
  _initFilter();
  if (calMode === 'week') renderCalWeek(); else renderCalDay();
  const bcw = document.getElementById('btn-cw');
  const bcd = document.getElementById('btn-cd');
  if (bcw) bcw.className = `btn bsm ${calMode === 'week' ? 'bp' : 'bg'}`;
  if (bcd) bcd.className = `btn bsm ${calMode === 'day'  ? 'bp' : 'bg'}`;
}

// Convierte un Date a "YYYY-MM-DD" local (evita desfase UTC en México)
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDays(d) {
  const dow = d.getDay(), diff = dow === 0 ? -6 : 1 - dow, mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x; });
}

function renderCalWeek() {
  const days = getWeekDays(calDate), todayS = todayStr();
  const d0 = days[0], d6 = days[6];
  document.getElementById('cal-title').textContent = `${d0.getDate()} ${MESES[d0.getMonth()].slice(0, 3)} — ${d6.getDate()} ${MESES[d6.getMonth()].slice(0, 3)} ${d6.getFullYear()}`;
  let html = '<div class="cal-week">';
  days.forEach((day, i) => {
    const ds = localDateStr(day), isT = ds === todayS;
    const dps = state.pedidos.filter(p => p.fecha === ds && pedidoPassFilter(p));
    const totalDia = state.pedidos.filter(p => p.fecha === ds && !isCancelled(p)).length;
    const filteredLabel = calFilter.tipos.size > 0 || calFilter.tecnico || calFilter.estado
      ? ` (${dps.length}/${totalDia})`
      : totalDia ? ` · ${totalDia}` : '';
    html += `<div class="cal-day-col">
      <div class="cal-day-hd${isT ? ' today' : ''}">
        <div class="cal-dn">${DIAS[i]}</div>
        <div class="cal-dd" onclick="goToDay('${ds}')">${day.getDate()}</div>
        ${totalDia ? `<div style="font-size:10px;margin-top:1px;opacity:.75">${totalDia} pedido${totalDia > 1 ? 's' : ''}${filteredLabel !== ` · ${totalDia}` ? filteredLabel : ''}</div>` : ''}
      </div>
      <div class="cal-day-bd">${dps.map(p => _chipHtml(p)).join('')}${!dps.length ? '<div style="font-size:11px;color:var(--mu);padding:5px 3px;text-align:center">—</div>' : ''}</div>
    </div>`;
  });
  html += '</div>';
  const calBody = document.getElementById('cal-body');
  calBody.innerHTML = html;
  refreshIcons(calBody);
}

function renderCalDay() {
  const ds = localDateStr(calDate);
  const wd = calDate.toLocaleDateString('es', { weekday: 'long' });
  document.getElementById('cal-title').textContent = `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${calDate.getDate()} de ${MESES[calDate.getMonth()]} ${calDate.getFullYear()}`;
  const all  = state.pedidos.filter(p => p.fecha === ds && !isCancelled(p));
  const dps  = state.pedidos.filter(p => p.fecha === ds && pedidoPassFilter(p));
  const body = document.getElementById('cal-body');

  const isFiltered = calFilter.tipos.size > 0 || calFilter.tecnico || calFilter.estado || calFilter.cancelados;
  const filterNote = isFiltered && dps.length !== all.length
    ? `<div style="font-size:11px;color:var(--mu);margin-bottom:10px;display:flex;align-items:center;gap:5px"><i data-lucide="filter" style="width:11px;height:11px"></i> Mostrando ${dps.length} de ${all.length} pedidos</div>`
    : '';

  if (!dps.length) {
    body.innerHTML = filterNote + `<div class="empty"><div class="ei"><i data-lucide="calendar" style="width:28px;height:28px;color:var(--mu)"></i></div><p>${isFiltered ? 'Sin pedidos con estos filtros.' : 'Sin pedidos este día.'}<br/><button class="btn bp bsm" onclick="openPedidoModal()" style="margin-top:10px">+ Agregar pedido</button></p></div>`;
    refreshIcons(body);
    return;
  }

  body.innerHTML = filterNote + dps.map(p => {
    const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    const bg = TIPO_BG[p.tipoServicio] || '#f1f5f9', col = c ? muniColor(c.municipio) : '#94a3b8';
    const co = TIPO_CO[p.tipoServicio] || '#475569', iconName = TIPO_IC[p.tipoServicio] || 'package';
    const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
    const cancelled = isCancelled(p);
    return `<div class="day-card"${cancelled ? ' style="opacity:.5"' : ''}>
      <div class="day-ico" style="background:${bg};color:${co}"><i data-lucide="${iconName}" style="width:18px;height:18px"></i></div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
          ${tipoPill(p.tipoServicio)}
          <span class="bold" style="font-size:13.5px">${c ? esc(c.nombre) : 'Sin cliente'}</span>
          ${c ? `<span style="font-size:11px;color:var(--mu);display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></span>${esc(c.municipio || '')}</span>` : ''}
          ${cancelled ? '<span style="font-size:11px;background:#fee2e2;color:#dc2626;padding:1px 7px;border-radius:20px;font-weight:600">Cancelado</span>' : sm ? statusPill(sm.estado) : ''}
          ${sm?.tecnico ? `<span style="font-size:11px;color:var(--mu);display:flex;align-items:center;gap:3px"><i data-lucide="hard-hat" style="width:10px;height:10px"></i> ${esc(sm.tecnico)}</span>` : ''}
        </div>
        <div style="font-size:13px;color:var(--mu);margin-bottom:5px">${pedidoDetalle(p)}</div>
        <div style="display:flex;gap:12px;font-size:12px;align-items:center;flex-wrap:wrap">
          ${c ? `<span style="display:flex;align-items:center;gap:3px"><i data-lucide="phone" style="width:11px;height:11px"></i> ${esc(c.numero)}</span><span>${pillPago(c.metodoPago)}</span>` : ''}
          <span style="font-weight:700;color:var(--ok)">${money(p.total)}</span>
          <span class="mu">Qty: ${p.cantidad}</span>
          ${sm?.hora_programada ? `<span class="mu" style="display:flex;align-items:center;gap:3px"><i data-lucide="clock" style="width:11px;height:11px"></i> ${sm.hora_programada}${(() => {
            const lineas = (state.pedidoDetalle || []).filter(d => d.pedidoId === p.id);
            const lParaEst = lineas.length ? lineas : [{ cantidad: p.cantidad || 1, sistemaInstalacion: p.detalles?.instalacion || null, nDesins: p.detalles?.nDesins || 0 }];
            const dur = estimatePedidoDurationMin(p.tipoServicio, lParaEst);
            const fin = addMinutesHHMM(sm.hora_programada, dur);
            return fin ? `<span style="margin-left:3px;opacity:.75">→ ${fin} · ${fmtDuracion(dur)}</span>` : '';
          })()}</span>` : (() => {
            const lineas = (state.pedidoDetalle || []).filter(d => d.pedidoId === p.id);
            const lParaEst = lineas.length ? lineas : [{ cantidad: p.cantidad || 1, sistemaInstalacion: p.detalles?.instalacion || null, nDesins: p.detalles?.nDesins || 0 }];
            const dur = estimatePedidoDurationMin(p.tipoServicio, lParaEst);
            return `<span class="mu" style="display:flex;align-items:center;gap:3px"><i data-lucide="hourglass" style="width:11px;height:11px"></i> ${fmtDuracion(dur)}</span>`;
          })()}
        </div>
      </div>
      ${!cancelled ? `<div style="display:flex;flex-direction:column;gap:4px">
        <button class="btn bsm" style="background:#dbeafe;color:#1d4ed8" onclick="openTrackModal(${p.id})" title="Seguimiento"><i data-lucide="map-pin" style="width:12px;height:12px"></i></button>
        <button class="btn bw bsm" onclick="openPedidoModal(${p.id})" title="Editar"><i data-lucide="pencil" style="width:12px;height:12px"></i></button>
        <button class="btn bsm" style="background:${p.detalles?.outlook_event_id ? '#dcfce7' : '#eff6ff'};color:${p.detalles?.outlook_event_id ? '#15803d' : '#1d4ed8'}" title="${p.detalles?.outlook_event_id ? 'Actualizar en Outlook' : 'Sincronizar con Outlook'}" onclick="syncOutlook(${p.id})"><i data-lucide="calendar" style="width:12px;height:12px"></i></button>
      </div>` : ''}
    </div>`;
  }).join('');
  refreshIcons(body);
}

function _chipHtml(p) {
  const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
  const bg = TIPO_BG[p.tipoServicio] || '#f1f5f9', co = TIPO_CO[p.tipoServicio] || '#475569';
  const iconName = TIPO_IC[p.tipoServicio] || 'package';
  const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
  const dot = sm ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${STATUS_COLORS[sm.estado] || '#94a3b8'};margin-right:3px;vertical-align:middle"></span>` : '';
  const outlookBadge = p.detalles?.outlook_event_id
    ? `<span title="Sincronizado con Outlook" style="font-size:9px;background:#dbeafe;color:#1e40af;border-radius:3px;padding:1px 4px;margin-left:3px;vertical-align:middle"><i data-lucide="calendar" style="width:9px;height:9px"></i></span>`
    : '';
  const cancelled = isCancelled(p);
  return `<div class="cal-chip" style="background:${bg};color:${co};${cancelled ? 'opacity:.45;' : ''}" onclick="openPedidoModal(${p.id})">
    <b>${dot}<i data-lucide="${iconName}" style="width:11px;height:11px;vertical-align:middle"></i> ${c ? esc(c.nombre) : 'Sin cliente'}${outlookBadge}</b>
    <span>${esc(p.tipoServicio)} ${money(p.total)}${sm?.tecnico ? ` · ${esc(sm.tecnico)}` : ''}</span>
  </div>`;
}
