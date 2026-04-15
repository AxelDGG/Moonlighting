import { state } from '../state.js';
import { esc, money, fdate, todayStr, tipoPill, statusPill, pillPago, pedidoDetalle, muniColor } from '../utils.js';
import { TIPO_IC, TIPO_BG, TIPO_CO, STATUS_COLORS } from '../constants.js';
import { refreshIcons } from '../icons.js';

let calMode = 'week';
let calDate = new Date();

const DIAS  = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Convierte un Date a "YYYY-MM-DD" usando hora LOCAL (no UTC) para evitar
// el desfase de zona horaria que produce toISOString() en México (UTC-6).
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDays(d) {
  const dow = d.getDay(), diff = dow === 0 ? -6 : 1 - dow, mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x; });
}

export function calNav(dir) { calDate = new Date(calDate.getTime() + (calMode === 'week' ? dir * 7 : dir) * 86400000); renderCal(); }
export function calToday()  { calDate = new Date(); renderCal(); }
export function setCalMode(m) { calMode = m; renderCal(); }
export function goToDay(ds) { calDate = new Date(ds + 'T12:00:00'); setCalMode('day'); }

export function renderCal() {
  if (calMode === 'week') renderCalWeek(); else renderCalDay();
  const bcw = document.getElementById('btn-cw');
  const bcd = document.getElementById('btn-cd');
  if (bcw) bcw.className = `btn bsm ${calMode === 'week' ? 'bp' : 'bg'}`;
  if (bcd) bcd.className = `btn bsm ${calMode === 'day'  ? 'bp' : 'bg'}`;
}

function renderCalWeek() {
  const days = getWeekDays(calDate), todayS = todayStr();
  const d0 = days[0], d6 = days[6];
  document.getElementById('cal-title').textContent = `${d0.getDate()} ${MESES[d0.getMonth()].slice(0, 3)} — ${d6.getDate()} ${MESES[d6.getMonth()].slice(0, 3)} ${d6.getFullYear()}`;
  let html = '<div class="cal-week">';
  days.forEach((day, i) => {
    const ds = localDateStr(day), isT = ds === todayS;
    const dps = state.pedidos.filter(p => p.fecha === ds);
    html += `<div class="cal-day-col"><div class="cal-day-hd${isT ? ' today' : ''}"><div class="cal-dn">${DIAS[i]}</div><div class="cal-dd" onclick="goToDay('${ds}')">${day.getDate()}</div>${dps.length ? `<div style="font-size:10px;margin-top:1px;opacity:.75">${dps.length} pedido${dps.length > 1 ? 's' : ''}</div>` : ''}</div>
      <div class="cal-day-bd">${dps.map(p => {
        const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
        const bg = TIPO_BG[p.tipoServicio] || '#f1f5f9', co = TIPO_CO[p.tipoServicio] || '#475569', iconName = TIPO_IC[p.tipoServicio] || 'package';
        const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
        const dot = sm ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${STATUS_COLORS[sm.estado] || '#94a3b8'};margin-right:3px;vertical-align:middle"></span>` : '';
        const outlookBadge = p.detalles?.outlook_event_id
          ? `<span title="Sincronizado con Outlook" style="font-size:9px;background:#dbeafe;color:#1e40af;border-radius:3px;padding:1px 4px;margin-left:3px;vertical-align:middle"><i data-lucide="calendar" style="width:9px;height:9px"></i></span>`
          : '';
        return `<div class="cal-chip" style="background:${bg};color:${co}" onclick="openPedidoModal(${p.id})"><b>${dot}<i data-lucide="${iconName}" style="width:11px;height:11px;vertical-align:middle"></i> ${c ? esc(c.nombre) : 'Sin cliente'}${outlookBadge}</b><span>${esc(p.tipoServicio)} ${money(p.total)}</span></div>`;
      }).join('')}${!dps.length ? '<div style="font-size:11px;color:var(--mu);padding:5px 3px;text-align:center">—</div>' : ''}</div></div>`;
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
  const dps = state.pedidos.filter(p => p.fecha === ds);
  const body = document.getElementById('cal-body');
  if (!dps.length) {
    body.innerHTML = `<div class="empty"><div class="ei"><i data-lucide="calendar" style="width:28px;height:28px;color:var(--mu)"></i></div><p>Sin pedidos este día.<br/><button class="btn bp bsm" onclick="openPedidoModal()" style="margin-top:10px">+ Agregar pedido</button></p></div>`;
    refreshIcons(body);
    return;
  }
  body.innerHTML = dps.map(p => {
    const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    const bg = TIPO_BG[p.tipoServicio] || '#f1f5f9', col = c ? muniColor(c.municipio) : '#94a3b8';
    const co = TIPO_CO[p.tipoServicio] || '#475569', iconName = TIPO_IC[p.tipoServicio] || 'package';
    const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
    return `<div class="day-card"><div class="day-ico" style="background:${bg};color:${co}"><i data-lucide="${iconName}" style="width:18px;height:18px"></i></div>
      <div style="flex:1"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">${tipoPill(p.tipoServicio)}<span class="bold" style="font-size:13.5px">${c ? esc(c.nombre) : 'Sin cliente'}</span>${c ? `<span style="font-size:11px;color:var(--mu);display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></span>${esc(c.municipio || '')}</span>` : ''} ${sm ? statusPill(sm.estado) : ''}</div>
      <div style="font-size:13px;color:var(--mu);margin-bottom:5px">${pedidoDetalle(p)}</div>
      <div style="display:flex;gap:12px;font-size:12px;align-items:center">${c ? `<span style="display:flex;align-items:center;gap:3px"><i data-lucide="phone" style="width:11px;height:11px"></i> ${esc(c.numero)}</span><span>${pillPago(c.metodoPago)}</span>` : ''}<span style="font-weight:700;color:var(--ok)">${money(p.total)}</span><span class="mu">Qty: ${p.cantidad}</span>${sm?.hora_programada ? `<span class="mu" style="display:flex;align-items:center;gap:3px"><i data-lucide="clock" style="width:11px;height:11px"></i> ${sm.hora_programada}</span>` : ''}</div></div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <button class="btn bsm" style="background:#dbeafe;color:#1d4ed8" onclick="openTrackModal(${p.id})" title="Seguimiento"><i data-lucide="map-pin" style="width:12px;height:12px"></i></button>
        <button class="btn bw bsm" onclick="openPedidoModal(${p.id})" title="Editar"><i data-lucide="pencil" style="width:12px;height:12px"></i></button>
        <button class="btn bsm" style="background:${p.detalles?.outlook_event_id ? '#dcfce7' : '#eff6ff'};color:${p.detalles?.outlook_event_id ? '#15803d' : '#1d4ed8'}" title="${p.detalles?.outlook_event_id ? 'Actualizar en Outlook' : 'Sincronizar con Outlook'}" onclick="syncOutlook(${p.id})"><i data-lucide="calendar" style="width:12px;height:12px"></i></button>
      </div></div>`;
  }).join('');
  refreshIcons(body);
}
