import { state, smFromDb } from '../state.js';
import { api } from '../api.js';
import { esc, fdate, tipoPill, statusPill, calcRetrasoMin, calcDuracionMin, money } from '../utils.js';
import { toast, openOv, closeOv } from '../ui.js';
import { renderPedidos } from './pedidos.js';
import { STATUS_COLORS } from '../constants.js';
import { refreshIcons } from '../icons.js';

export async function openTrackModal(pedidoId) {
  const p = state.pedidos.find(x => x.id === pedidoId); if (!p) return;
  const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
  let sm = state.servicios_metricas.find(s => s.pedido_id === pedidoId);
  if (!sm) {
    try {
      const row = await api.metricas.create({ pedido_id: pedidoId, tecnico: '', hora_programada: null, zona: c?.municipio || '', orden_ruta: null, estado: 'programado', dia_semana: getDiaSemana(p.fecha) });
      sm = smFromDb(row);
      state.servicios_metricas.push(sm);
    } catch (err) { toast('Error: ' + err.message, 'er'); return; }
  }
  document.getElementById('track-title').textContent = `Seguimiento — Pedido #${pedidoId}`;
  renderTrackBody(sm, p, c);
  openOv('ov-track');
}

function getDiaSemana(fechaStr) {
  if (!fechaStr) return '';
  const d = new Date(fechaStr + 'T12:00:00');
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()];
}

export function renderTrackBody(sm, p, c) {
  const body = document.getElementById('track-body');
  const estado = sm.estado;
  const retraso = calcRetrasoMin(sm.hora_programada, sm.hora_llegada);
  const duracion = calcDuracionMin(sm.hora_inicio, sm.hora_fin);
  let html = `<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;padding:12px;background:var(--bg);border-radius:10px">
    <div style="flex:1">
      <div style="font-size:13px;font-weight:600">${c ? esc(c.nombre) : 'Sin cliente'}</div>
      <div style="font-size:11.5px;color:var(--mu)">${tipoPill(p.tipoServicio)} · ${fdate(p.fecha)} · ${esc(sm.zona || 'Sin zona')}</div>
      ${sm.tecnico ? `<div style="font-size:11.5px;color:var(--mu);margin-top:2px;display:flex;align-items:center;gap:4px"><i data-lucide="hard-hat" style="width:11px;height:11px"></i> ${esc(sm.tecnico)}${sm.orden_ruta ? ` · Ruta #${sm.orden_ruta}` : ''}</div>` : ''}
    </div>
    ${statusPill(estado)}
  </div>`;
  if (retraso !== null) {
    const isLate = retraso > 0;
    html += `<div style="padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:8px;background:${isLate ? '#fee2e2' : '#dcfce7'};color:${isLate ? '#dc2626' : '#15803d'}">
      <i data-lucide="${isLate ? 'alert-triangle' : 'check-circle'}" style="width:14px;height:14px;flex-shrink:0"></i> ${isLate ? `Retraso de ${retraso} minutos` : `Llegada puntual (${Math.abs(retraso)} min antes)`}
    </div>`;
  }
  const steps = [
    { key: 'programada', icon: 'clipboard',    label: 'Hora programada',    time: sm.hora_programada, done: !!sm.hora_programada },
    { key: 'llegada',    icon: 'car',           label: 'Llegada real',        time: sm.hora_llegada,    done: !!sm.hora_llegada },
    { key: 'inicio',     icon: 'wrench',        label: 'Inicio del servicio', time: sm.hora_inicio,     done: !!sm.hora_inicio },
    { key: 'fin',        icon: 'check-circle',  label: 'Fin del servicio',    time: sm.hora_fin,        done: !!sm.hora_fin },
  ];
  let activeFound = false;
  html += '<div class="track-timeline">';
  steps.forEach(step => {
    const isDone = step.done;
    let dotClass = 'done';
    if (!isDone && !activeFound) { dotClass = 'active'; activeFound = true; }
    else if (!isDone) { dotClass = 'pending'; }
    html += `<div class="track-step">
      <div class="track-dot ${dotClass}"><i data-lucide="${isDone ? 'check' : step.icon}" style="width:12px;height:12px"></i></div>
      <div class="track-info">
        <h4>${step.label}</h4>
        ${isDone ? `<div class="track-time">${step.time}</div>` : '<p>Pendiente</p>'}
        ${!isDone && dotClass === 'active' ? `<div class="track-actions"><button class="btn bp bsm" onclick="trackAction(${sm.id},'${step.key}')"><i data-lucide="timer" style="width:11px;height:11px"></i> Registrar ahora</button></div>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';
  if (duracion !== null) html += `<div style="padding:10px 14px;border-radius:8px;background:#dbeafe;color:#1d4ed8;font-size:12.5px;font-weight:600;margin-top:4px;display:flex;align-items:center;gap:6px"><i data-lucide="timer" style="width:14px;height:14px"></i> Duración total: ${duracion} minutos</div>`;
  if (estado === 'atrasado' || (retraso && retraso > 0)) {
    html += `<div style="margin-top:14px"><div style="font-size:10.5px;font-weight:600;color:var(--mu);text-transform:uppercase;margin-bottom:4px">Motivo del retraso</div>
      <select onchange="saveMotivo(${sm.id},'retraso',this.value)" style="width:100%;padding:7px 10px;border:1px solid var(--bo);border-radius:7px;font-size:13px">
        <option value="" ${!sm.motivo_retraso ? 'selected' : ''}>— Sin especificar —</option>
        ${['Tráfico','Cliente no disponible','Servicio anterior extendido','Problema con material','Error de programación','Clima','Otro'].map(m => `<option value="${m}" ${sm.motivo_retraso === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select></div>`;
  }
  if (estado !== 'completado' && estado !== 'cancelado') {
    html += `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--bo);display:flex;gap:8px">
      <button class="btn bd bsm" onclick="cancelService(${sm.id})"><i data-lucide="x-circle" style="width:12px;height:12px"></i> Cancelar servicio</button>
    </div>`;
  }
  body.innerHTML = html;
  refreshIcons(body);
}

export async function trackAction(smId, key) {
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5);
  const sm = state.servicios_metricas.find(s => s.id === smId); if (!sm) return;
  const updates = { id: smId };
  if (key === 'programada') { updates.hora_programada = timeStr; }
  else if (key === 'llegada') {
    updates.hora_llegada = timeStr;
    if (sm.hora_programada) {
      const retraso = calcRetrasoMin(sm.hora_programada, timeStr);
      updates.retraso_min = retraso;
      updates.estado = retraso > 5 ? 'atrasado' : 'en_curso';
    } else { updates.estado = 'en_curso'; }
  } else if (key === 'inicio') { updates.hora_inicio = timeStr; updates.estado = 'en_curso'; }
  else if (key === 'fin')   { updates.hora_fin = timeStr; updates.estado = 'completado'; }
  try {
    const { id, ...payload } = updates;
    await api.metricas.update(smId, payload);
    const i = state.servicios_metricas.findIndex(s => s.id === smId);
    if (i !== -1) state.servicios_metricas[i] = { ...state.servicios_metricas[i], ...payload };
    const updatedSM = state.servicios_metricas[i];
    const p = state.pedidos.find(x => x.id === updatedSM?.pedido_id);
    const c = p?.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    if (updatedSM && p) renderTrackBody(updatedSM, p, c);
    toast('Registro guardado: ' + timeStr);
    renderPedidos();
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}

export async function saveMotivo(smId, tipo, val) {
  try {
    const payload = tipo === 'retraso' ? { motivo_retraso: val } : { motivo_cancelacion: val };
    await api.metricas.update(smId, payload);
    const i = state.servicios_metricas.findIndex(s => s.id === smId);
    if (i !== -1) state.servicios_metricas[i] = { ...state.servicios_metricas[i], ...payload };
    toast('Motivo guardado');
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}

export async function cancelService(smId) {
  const motivo = prompt('Motivo de cancelación:'); if (motivo === null) return;
  try {
    const payload = { estado: 'cancelado', motivo_cancelacion: motivo || 'No especificado' };
    await api.metricas.update(smId, payload);
    const i = state.servicios_metricas.findIndex(s => s.id === smId);
    if (i !== -1) state.servicios_metricas[i] = { ...state.servicios_metricas[i], ...payload };
    const sm = state.servicios_metricas[i];
    const p = state.pedidos.find(x => x.id === sm?.pedido_id);
    const c = p?.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    if (sm && p) renderTrackBody(sm, p, c);
    toast('Servicio cancelado', 'er');
    renderPedidos();
  } catch (err) { toast('Error: ' + err.message, 'er'); }
}
