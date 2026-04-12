import { state } from '../state.js';
import { esc, money, fdate, todayStr, tipoPill, statusPill, pillPago, pedidoDetalle, muniColor } from '../utils.js';
import { TIPO_IC, TIPO_BG, TIPO_CO, STATUS_COLORS } from '../constants.js';

let calMode = 'week';
let calDate = new Date();

const DIAS  = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
    const ds = day.toISOString().split('T')[0], isT = ds === todayS;
    const dps = state.pedidos.filter(p => p.fecha === ds);
    html += `<div class="cal-day-col"><div class="cal-day-hd${isT ? ' today' : ''}"><div class="cal-dn">${DIAS[i]}</div><div class="cal-dd" onclick="goToDay('${ds}')">${day.getDate()}</div>${dps.length ? `<div style="font-size:10px;margin-top:1px;opacity:.75">${dps.length} pedido${dps.length > 1 ? 's' : ''}</div>` : ''}</div>
      <div class="cal-day-bd">${dps.map(p => {
        const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
        const bg = TIPO_BG[p.tipoServicio] || '#f1f5f9', co = TIPO_CO[p.tipoServicio] || '#475569', ic = TIPO_IC[p.tipoServicio] || '📦';
        const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
        const dot = sm ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${STATUS_COLORS[sm.estado] || '#94a3b8'};margin-right:3px"></span>` : '';
        return `<div class="cal-chip" style="background:${bg};color:${co}" onclick="openPedidoModal(${p.id})"><b>${dot}${ic} ${c ? esc(c.nombre) : 'Sin cliente'}</b><span>${esc(p.tipoServicio)} ${money(p.total)}</span></div>`;
      }).join('')}${!dps.length ? '<div style="font-size:11px;color:var(--mu);padding:5px 3px;text-align:center">—</div>' : ''}</div></div>`;
  });
  html += '</div>';
  document.getElementById('cal-body').innerHTML = html;
}

function renderCalDay() {
  const ds = calDate.toISOString().split('T')[0];
  const wd = calDate.toLocaleDateString('es', { weekday: 'long' });
  document.getElementById('cal-title').textContent = `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${calDate.getDate()} de ${MESES[calDate.getMonth()]} ${calDate.getFullYear()}`;
  const dps = state.pedidos.filter(p => p.fecha === ds);
  const body = document.getElementById('cal-body');
  if (!dps.length) { body.innerHTML = `<div class="empty"><div class="ei">📅</div><p>Sin pedidos este día.<br/><button class="btn bp bsm" onclick="openPedidoModal()" style="margin-top:10px">＋ Agregar pedido</button></p></div>`; return; }
  body.innerHTML = dps.map(p => {
    const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    const bg = TIPO_BG[p.tipoServicio] || '#f1f5f9', col = c ? muniColor(c.municipio) : '#94a3b8';
    const sm = state.servicios_metricas.find(s => s.pedido_id === p.id);
    return `<div class="day-card"><div class="day-ico" style="background:${bg}">${TIPO_IC[p.tipoServicio] || '📦'}</div>
      <div style="flex:1"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">${tipoPill(p.tipoServicio)}<span class="bold" style="font-size:13.5px">${c ? esc(c.nombre) : 'Sin cliente'}</span>${c ? `<span style="font-size:11px;color:var(--mu);display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></span>${esc(c.municipio || '')}</span>` : ''} ${sm ? statusPill(sm.estado) : ''}</div>
      <div style="font-size:13px;color:var(--mu);margin-bottom:5px">${pedidoDetalle(p)}</div>
      <div style="display:flex;gap:12px;font-size:12px">${c ? `<span>📞 ${esc(c.numero)}</span><span>${pillPago(c.metodoPago)}</span>` : ''}<span style="font-weight:700;color:var(--ok)">${money(p.total)}</span><span class="mu">Qty: ${p.cantidad}</span>${sm?.hora_programada ? `<span class="mu">🕐 ${sm.hora_programada}</span>` : ''}</div></div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <button class="btn bsm" style="background:#dbeafe;color:#1d4ed8" onclick="openTrackModal(${p.id})">📍</button>
        <button class="btn bw bsm" onclick="openPedidoModal(${p.id})">✏️</button>
      </div></div>`;
  }).join('');
}
