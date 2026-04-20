import { state } from '../state.js';
import { api } from '../api.js';
import { esc, calcDuracionMin, tipoPill, statusPill, fdate, money, mdToHtml } from '../utils.js';
import { toast } from '../ui.js';
import { STATUS_LABELS, STATUS_COLORS, TIPO_CO } from '../constants.js';
import { refreshIcons } from '../icons.js';

export function renderMetricas() {
  renderMetKPIs(); renderMetDonut(); renderMetZona(); renderMetTipo();
  renderMetTecnico(); renderMetDia(); renderMetMotivos(); renderMetHistorial();
}

function renderMetKPIs() {
  const sm = state.servicios_metricas;
  const total = sm.length, completed = sm.filter(s => s.estado === 'completado').length;
  const delayed = sm.filter(s => s.estado === 'atrasado').length;
  const withDelay = sm.filter(s => s.retraso_min && s.retraso_min > 0);
  const avgDelay = withDelay.length ? Math.round(withDelay.reduce((s, d) => s + d.retraso_min, 0) / withDelay.length) : 0;
  const withTimes = sm.filter(s => s.hora_inicio && s.hora_fin);
  const avgDur = withTimes.length ? Math.round(withTimes.reduce((s, d) => s + calcDuracionMin(d.hora_inicio, d.hora_fin), 0) / withTimes.length) : 0;
  const pctOk = total ? Math.round((completed / total) * 100) : 0;
  document.getElementById('met-kpis').innerHTML = `
    <div class="met-card mc-blue"><div class="met-val">${total}</div><div class="met-label">Servicios</div></div>
    <div class="met-card mc-green"><div class="met-val">${completed}</div><div class="met-label">Completados</div><div class="met-trend up">${pctOk}%</div></div>
    <div class="met-card mc-red"><div class="met-val">${delayed}</div><div class="met-label">Retrasos</div></div>
    <div class="met-card mc-amber"><div class="met-val">${avgDelay}m</div><div class="met-label">Retraso Prom.</div></div>
    <div class="met-card mc-purple"><div class="met-val">${avgDur}m</div><div class="met-label">Duración Prom.</div></div>`;
}

function renderMetDonut() {
  const container = document.getElementById('met-donut'); if (!container) return;
  // Agregamos en_proceso y en_curso al mismo bucket (en_curso es legacy pre-
  // migración 20260420; el UPDATE de esa migración unifica a en_proceso).
  const counts = { completado: 0, en_proceso: 0, atrasado: 0, programado: 0, cancelado: 0 };
  state.servicios_metricas.forEach(s => {
    const estado = s.estado === 'en_curso' ? 'en_proceso' : s.estado;
    if (counts[estado] !== undefined) counts[estado]++;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) { container.innerHTML = '<div class="empty">Sin datos</div>'; return; }
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  const colors = STATUS_COLORS;
  let cumAngle = 0; const radius = 42, cx = 60, cy = 60; let paths = '';
  entries.forEach(([key, val]) => {
    const pct = val / total, angle = pct * 360, startAngle = cumAngle, endAngle = cumAngle + angle;
    const largeArc = angle > 180 ? 1 : 0, startRad = (startAngle - 90) * Math.PI / 180, endRad = (endAngle - 90) * Math.PI / 180;
    const x1 = cx + radius * Math.cos(startRad), y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad), y2 = cy + radius * Math.sin(endRad);
    if (pct >= 1) paths += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${colors[key]}" stroke-width="16"/>`;
    else paths += `<path d="M${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2}" fill="none" stroke="${colors[key]}" stroke-width="16" stroke-linecap="round"/>`;
    cumAngle = endAngle;
  });
  const legend = entries.map(([key, val]) => `<div class="donut-item"><span class="donut-swatch" style="background:${colors[key]}"></span>${STATUS_LABELS[key] || key}<b>${val}</b></div>`).join('');
  container.innerHTML = `<div class="donut-wrap"><svg class="donut-svg" viewBox="0 0 120 120">${paths}<text x="60" y="65" text-anchor="middle" font-size="18" font-weight="800">${total}</text></svg><div class="donut-legend">${legend}</div></div>`;
}

function renderBarChart(containerId, data, maxVal, colorFn) {
  const container = document.getElementById(containerId); if (!container) return;
  if (!data.length) { container.innerHTML = '<div class="empty">Sin datos</div>'; return; }
  const max = maxVal || Math.max(...data.map(d => d.value), 1);
  container.innerHTML = `<div class="chart-bar-wrap">${data.map(d => {
    const pct = Math.max(Math.round((d.value / max) * 100), 2);
    const color = typeof colorFn === 'function' ? colorFn(d) : (colorFn || 'var(--p)');
    return `<div class="chart-bar-row"><span class="chart-bar-label">${esc(d.label)}</span><div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%;background:${color}"></div></div><span class="chart-bar-val">${d.display || d.value}</span></div>`;
  }).join('')}</div>`;
}

function renderMetZona() {
  const m = {}; state.servicios_metricas.filter(s => s.zona && s.retraso_min != null).forEach(s => { if (!m[s.zona]) m[s.zona] = { sum: 0, n: 0 }; m[s.zona].sum += Math.max(s.retraso_min, 0); m[s.zona].n++; });
  renderBarChart('met-zona', Object.entries(m).map(([z, v]) => ({ label: z, value: Math.round(v.sum / v.n), display: Math.round(v.sum / v.n) + 'm' })).sort((a, b) => b.value - a.value), 0, d => d.value > 20 ? '#ef4444' : '#22c55e');
}
function renderMetTipo() {
  const m = {}; state.servicios_metricas.filter(s => s.retraso_min != null).forEach(s => { const p = state.pedidos.find(x => x.id === s.pedido_id); if (p) { if (!m[p.tipoServicio]) m[p.tipoServicio] = { sum: 0, n: 0 }; m[p.tipoServicio].sum += Math.max(s.retraso_min, 0); m[p.tipoServicio].n++; } });
  renderBarChart('met-tipo', Object.entries(m).map(([t, v]) => ({ label: t, value: Math.round(v.sum / v.n), display: Math.round(v.sum / v.n) + 'm' })).sort((a, b) => b.value - a.value), 0, d => TIPO_CO[d.label] || '#ccc');
}
function renderMetTecnico() {
  const m = {}; state.servicios_metricas.filter(s => s.tecnico).forEach(s => { if (!m[s.tecnico]) m[s.tecnico] = { ok: 0, n: 0 }; m[s.tecnico].n++; if (s.estado === 'completado') m[s.tecnico].ok++; });
  renderBarChart('met-tecnico', Object.entries(m).map(([t, v]) => ({ label: t, value: Math.round((v.ok / v.n) * 100), display: Math.round((v.ok / v.n) * 100) + '%' })).sort((a, b) => b.value - a.value), 100, d => d.value > 80 ? '#22c55e' : '#f59e0b');
}
function renderMetDia() {
  const order = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], m = {};
  state.servicios_metricas.filter(s => s.dia_semana && s.retraso_min != null).forEach(s => { if (!m[s.dia_semana]) m[s.dia_semana] = { sum: 0, n: 0 }; m[s.dia_semana].sum += Math.max(s.retraso_min, 0); m[s.dia_semana].n++; });
  renderBarChart('met-dia', order.filter(d => m[d]).map(dia => ({ label: dia, value: Math.round(m[dia].sum / m[dia].n), display: Math.round(m[dia].sum / m[dia].n) + 'm' })), 0, '#3b82f6');
}
function renderMetMotivos() {
  const m = {};
  state.servicios_metricas.filter(s => s.motivo_retraso).forEach(s => { m[s.motivo_retraso] = (m[s.motivo_retraso] || 0) + 1; });
  state.servicios_metricas.filter(s => s.motivo_cancelacion).forEach(s => { const k = '[Cancelado] ' + s.motivo_cancelacion; m[k] = (m[k] || 0) + 1; });
  renderBarChart('met-motivos', Object.entries(m).map(([l, v]) => ({ label: l, value: v, display: v + 'x' })).sort((a, b) => b.value - a.value), 0, '#7c3aed');
}
function renderMetHistorial() {
  const tbody = document.getElementById('tb-met-hist'); if (!tbody) return;
  const recent = [...state.servicios_metricas].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 20);
  if (!recent.length) { tbody.innerHTML = '<tr><td colspan="10">Sin registros</td></tr>'; return; }
  tbody.innerHTML = recent.map(sm => {
    const p = state.pedidos.find(x => x.id === sm.pedido_id);
    const c = p?.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
    const retraso = sm.retraso_min, dur = calcDuracionMin(sm.hora_inicio, sm.hora_fin);
    const reHtml = retraso != null ? (retraso > 0 ? `<span class="bold color-err">+${retraso}m</span>` : `<span class="bold color-ok">${retraso}m</span>`) : '—';
    return `<tr><td>#${sm.pedido_id}</td><td>${c ? esc(c.nombre) : '—'}</td><td>${p ? tipoPill(p.tipoServicio) : '—'}</td><td>${esc(sm.zona || '—')}</td><td>${esc(sm.tecnico || '—')}</td><td>${sm.hora_programada || '—'}</td><td>${sm.hora_llegada || '—'}</td><td>${reHtml}</td><td>${dur != null ? dur + 'm' : '—'}</td><td>${statusPill(sm.estado)}</td></tr>`;
  }).join('');
  refreshIcons(tbody);
}

function buildMetricsData() {
  const sm = state.servicios_metricas;
  const total = sm.length, completed = sm.filter(s => s.estado === 'completado').length;
  const delayed = sm.filter(s => s.estado === 'atrasado').length, cancelled = sm.filter(s => s.estado === 'cancelado').length;
  const withDelay = sm.filter(s => s.retraso_min != null && s.retraso_min > 0);
  const avgDelay = withDelay.length ? Math.round(withDelay.reduce((s, d) => s + d.retraso_min, 0) / withDelay.length) : 0;
  const withTimes = sm.filter(s => s.hora_inicio && s.hora_fin);
  const avgDur = withTimes.length ? Math.round(withTimes.reduce((s, d) => s + calcDuracionMin(d.hora_inicio, d.hora_fin), 0) / withTimes.length) : 0;
  const pctOk = total ? Math.round((completed / total) * 100) : 0;
  const zonaMap = {}; sm.filter(s => s.zona && s.retraso_min != null).forEach(s => { if (!zonaMap[s.zona]) zonaMap[s.zona] = { sum: 0, n: 0 }; zonaMap[s.zona].sum += Math.max(s.retraso_min, 0); zonaMap[s.zona].n++; });
  const zonas = Object.entries(zonaMap).map(([zona, v]) => ({ zona, avg: Math.round(v.sum / v.n) })).sort((a, b) => b.avg - a.avg);
  const tecMap = {}; sm.filter(s => s.tecnico).forEach(s => { if (!tecMap[s.tecnico]) tecMap[s.tecnico] = { ok: 0, n: 0 }; tecMap[s.tecnico].n++; if (s.estado === 'completado') tecMap[s.tecnico].ok++; });
  const tecnicos = Object.entries(tecMap).map(([tec, v]) => ({ tec, pct: Math.round((v.ok / v.n) * 100), n: v.n })).sort((a, b) => b.pct - a.pct);
  const tipoMap = {}; sm.filter(s => s.retraso_min != null).forEach(s => { const p = state.pedidos.find(x => x.id === s.pedido_id); if (p) { if (!tipoMap[p.tipoServicio]) tipoMap[p.tipoServicio] = { sum: 0, n: 0 }; tipoMap[p.tipoServicio].sum += Math.max(s.retraso_min, 0); tipoMap[p.tipoServicio].n++; } });
  const tipos = Object.entries(tipoMap).map(([tipo, v]) => ({ tipo, avg: Math.round(v.sum / v.n) })).sort((a, b) => b.avg - a.avg);
  const diaMap = {}; sm.filter(s => s.dia_semana && s.retraso_min != null).forEach(s => { if (!diaMap[s.dia_semana]) diaMap[s.dia_semana] = { sum: 0, n: 0 }; diaMap[s.dia_semana].sum += Math.max(s.retraso_min, 0); diaMap[s.dia_semana].n++; });
  const dias = Object.entries(diaMap).map(([dia, v]) => ({ dia, avg: Math.round(v.sum / v.n) })).sort((a, b) => b.avg - a.avg);
  const motivosMap = {}; sm.filter(s => s.motivo_retraso).forEach(s => { motivosMap[s.motivo_retraso] = (motivosMap[s.motivo_retraso] || 0) + 1; });
  const motivos = Object.entries(motivosMap).sort((a, b) => b[1] - a[1]).map(([m, c]) => `${m} (${c}x)`);
  const ingresos = state.pedidos.reduce((s, p) => s + parseFloat(p.total || 0), 0);
  return { total, completed, delayed, cancelled, pctOk, avgDelay, avgDur, zonas, tecnicos, tipos, dias, motivos, ingresos, nClientes: state.clientes.length, nPedidos: state.pedidos.length };
}

export async function generateFeedback() {
  if (!state.servicios_metricas.length && !state.pedidos.length) { toast('Sin datos suficientes para analizar', 'er'); return; }
  const btn = document.getElementById('btn-ai'), btnR = document.getElementById('btn-ai-regen');
  const card = document.getElementById('ai-card'), body = document.getElementById('ai-body');
  [btn, btnR].forEach(b => { if (b) { b.disabled = true; b.innerHTML = '<span class="sp"></span> Analizando…'; } });
  card.style.display = '';
  body.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:16px;color:var(--mu);font-size:13px"><span class="sp"></span> El modelo está procesando las métricas…</div>';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const data = buildMetricsData();
    const { text, model } = await api.ai.feedback(data);
    body.innerHTML = `<div style="padding:4px 0 8px">${mdToHtml(text)}</div>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--bo);font-size:11px;color:var(--mu)">Generado con ${esc(model)} · ${new Date().toLocaleString('es')}</div>`;
    toast('Análisis generado correctamente');
  } catch (err) {
    body.innerHTML = `<div style="color:var(--err);padding:12px;font-size:13px;display:flex;align-items:center;gap:8px"><i data-lucide="x-circle" style="width:14px;height:14px;flex-shrink:0"></i> ${esc(err.message)}</div>`;
    refreshIcons(body);
    toast('Error al generar análisis: ' + err.message, 'er');
  }
  [btn, btnR].forEach(b => {
    if (b) {
      b.disabled = false;
      b.innerHTML = b === btn
        ? '<i data-lucide="sparkles" style="width:13px;height:13px"></i> Generar retroalimentación IA'
        : '<i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Regenerar';
      refreshIcons(b);
    }
  });
}
