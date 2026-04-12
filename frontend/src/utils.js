import { PAGO_CLS, PAGO_IC, TIPO_BG, TIPO_CO, TIPO_IC, STATUS_COLORS, STATUS_BG, STATUS_LABELS, MUNIS } from './constants.js';

export function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
export function money(n) { return '$' + parseFloat(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function fdate(s) { if (!s) return '—'; const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }); }
export function fdateShort(s) { if (!s) return '—'; const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('es', { day: '2-digit', month: 'short' }); }
export function todayStr() { return new Date().toISOString().split('T')[0]; }

export function getDiaSemana(fechaStr) {
  if (!fechaStr) return '';
  const d = new Date(fechaStr + 'T12:00:00');
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()];
}
export function calcRetrasoMin(programada, llegada) {
  if (!programada || !llegada) return null;
  const [ph, pm] = programada.split(':').map(Number);
  const [lh, lm] = llegada.split(':').map(Number);
  return (lh * 60 + lm) - (ph * 60 + pm);
}
export function calcDuracionMin(inicio, fin) {
  if (!inicio || !fin) return null;
  const [ih, im] = inicio.split(':').map(Number);
  const [fh, fm] = fin.split(':').map(Number);
  return (fh * 60 + fm) - (ih * 60 + im);
}

export function muniColor(m) { return (MUNIS[m] || {}).color || '#94a3b8'; }
export function pillPago(p) { const cl = PAGO_CLS[p] || 'pi', ic = PAGO_IC[p] || ''; return `<span class="pill ${cl}">${ic} ${esc(p)}</span>`; }
export function tipoPill(t) { const bg = TIPO_BG[t] || '#f1f5f9', co = TIPO_CO[t] || '#475569', ic = TIPO_IC[t] || '📦'; return `<span class="pill" style="background:${bg};color:${co}">${ic} ${t}</span>`; }
export function statusPill(estado) {
  const col = STATUS_COLORS[estado] || '#94a3b8', bg = STATUS_BG[estado] || '#f1f5f9', label = STATUS_LABELS[estado] || estado;
  const icons = { programado: '🕐', en_curso: '🔄', completado: '✅', cancelado: '❌', atrasado: '⚠️' };
  return `<span class="pill" style="background:${bg};color:${col}">${icons[estado] || '•'} ${label}</span>`;
}
export function pedidoDetalle(p) {
  const d = p.detalles || {};
  if (p.tipoServicio === 'Abanico') { let h = `<span class="bold">${esc(d.modelo || '')}</span>`; if (d.nDesins > 0) h += ` <span class="pill" style="background:#fef3c7;color:#92400e;font-size:10px">⬇ ×${d.nDesins}</span>`; return h; }
  if (p.tipoServicio === 'Persiana') return `<span class="bold">${esc(d.tipoTela || '')}</span> <span class="mu">${d.ancho}×${d.alto}cm · ${d.instalacion}</span>`;
  if (p.tipoServicio === 'Limpieza') return `<span class="bold">${esc(d.modelo || '')}</span>${d.notas ? ` <span class="mu">${esc(d.notas)}</span>` : ''}`;
  return `<span class="mu">${esc(d.notas || '—')}</span>`;
}

export function downloadCSV(csv, filename) {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.download = filename;
  a.href = URL.createObjectURL(blob);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function mdToHtml(text) {
  // Escape HTML first so LLM output can never inject tags
  return esc(text)
    .replace(/^## (.*?)$/gm, '<h3 style="font-size:13.5px;font-weight:700;margin:16px 0 6px;color:var(--text)">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^(\d+)\. (.*?)$/gm, '<div style="padding:4px 0 4px 12px;border-left:3px solid var(--p);margin:4px 0;font-size:13px"><b>$1.</b> $2</div>')
    .replace(/^- (.*?)$/gm, '<div style="padding:2px 0 2px 10px;font-size:13px">• $1</div>')
    .replace(/\n\n/g, '<br/>')
    .replace(/\n(?!<)/g, '<br/>');
}
