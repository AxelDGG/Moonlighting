// Estimación de duración — la configuración ahora vive en BD
// (tabla service_duration_subtipos) y se carga vía runtime-config.js.
// Este módulo es lógica pura de cálculo sobre esa config.

import { getAllDurations, getDurationConfig } from './runtime-config.js';

const FALLBACK_DURATION_MIN = 30;

// Subtipos conocidos (para selects en UI). Si cambian, actualizar la BD y
// sincronizar esta lista con lo que devuelva getAllDurations().
export const SUBTIPO_ABANICO       = ['plafón', 'retráctil', 'candil'];
export const SUBTIPO_MANTENIMIENTO = ['plafón', 'candil', 'persiana', 'arreglos'];

export function estimateLineaDurationMin(tipoServicio, linea) {
  const cfg = getDurationConfig(tipoServicio);
  if (!cfg) return FALLBACK_DURATION_MIN;
  const subtipo = linea?.subTipo || linea?.sistemaInstalacion || linea?.instalacion || null;
  let base = cfg.default;
  if (cfg.bySubtipo && subtipo && cfg.bySubtipo[subtipo] != null) {
    base = cfg.bySubtipo[subtipo];
  }
  if (base == null) base = FALLBACK_DURATION_MIN;
  const cant = cfg.perUnit ? Math.max(1, parseFloat(linea?.cantidad) || 1) : 1;
  let total = base * cant;
  if (tipoServicio === 'Abanico' && linea?.nDesins && cfg.desinstalacionPerUd) {
    total += cfg.desinstalacionPerUd * linea.nDesins;
  }
  return Math.round(total);
}

export function estimatePedidoDurationMin(tipoServicio, lineas) {
  const cfg = getDurationConfig(tipoServicio);
  if (!cfg) return FALLBACK_DURATION_MIN;
  if (cfg.perUnit === false) return cfg.default ?? FALLBACK_DURATION_MIN;
  if (!Array.isArray(lineas) || !lineas.length) return cfg.default ?? FALLBACK_DURATION_MIN;
  return lineas.reduce((s, l) => s + estimateLineaDurationMin(tipoServicio, l), 0);
}

export function fmtDuracion(min) {
  if (min == null) return '—';
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

export function addMinutesHHMM(hhmm, min) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date(2000, 0, 1, h, m + (min || 0));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Back-compat: algunos módulos importan DURACION_CONFIG directamente. Exponer
// un getter que lee del runtime-config.
export function getDuracionConfig() {
  return getAllDurations();
}
