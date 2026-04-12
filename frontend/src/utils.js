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

export function pillPago(p) {
  const cl = PAGO_CLS[p] || 'pi';
  const ic = PAGO_IC[p] || '';
  return `<span class="pill ${cl}">${ic}${esc(p)}</span>`;
}

export function tipoPill(t) {
  const bg = TIPO_BG[t] || '#f1f5f9';
  const co = TIPO_CO[t] || '#475569';
  const ic = TIPO_IC[t] || '';
  return `<span class="pill" style="background:${bg};color:${co}">${ic}${t}</span>`;
}

const _statusIc = (d, sw = '1.75') =>
  `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const STATUS_IC = {
  programado: _statusIc(`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`),
  en_curso:   _statusIc(`<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>`),
  completado: _statusIc(`<polyline points="20 6 9 17 4 12"/>`, '2.5'),
  cancelado:  _statusIc(`<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`),
  atrasado:   _statusIc(`<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`),
};

export function statusPill(estado) {
  const col   = STATUS_COLORS[estado] || '#94a3b8';
  const bg    = STATUS_BG[estado]     || '#f1f5f9';
  const label = STATUS_LABELS[estado] || estado;
  const ic    = STATUS_IC[estado]     || '';
  return `<span class="pill" style="background:${bg};color:${col}">${ic}${label}</span>`;
}

export function pedidoDetalle(p) {
  const d = p.detalles || {};
  if (p.tipoServicio === 'Abanico') {
    let h = `<span class="bold">${esc(d.modelo || '')}</span>`;
    if (d.nDesins > 0) h += ` <span class="pill" style="background:#fef3c7;color:#92400e;font-size:10px">x${d.nDesins} desins.</span>`;
    return h;
  }
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
  return esc(text)
    .replace(/^## (.*?)$/gm, '<h3 style="font-size:13.5px;font-weight:700;margin:16px 0 6px;color:var(--text)">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^(\d+)\. (.*?)$/gm, '<div style="padding:4px 0 4px 12px;border-left:3px solid var(--p);margin:4px 0;font-size:13px"><b>$1.</b> $2</div>')
    .replace(/^- (.*?)$/gm, '<div style="padding:2px 0 2px 10px;font-size:13px">• $1</div>')
    .replace(/\n\n/g, '<br/>')
    .replace(/\n(?!<)/g, '<br/>');
}
