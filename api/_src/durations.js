// Estimación de duración basada en la config de BD (service_duration_subtipos).
// La config se provee por el llamador; este módulo solo implementa la lógica
// pura para facilitar testing y evitar acoplar a fastify.supabase.

const FALLBACK_DURATION_MIN = 30;

export function estimateLineaDurationMin(tipoServicio, linea, durationsByTipo) {
  const cfg = durationsByTipo && durationsByTipo[tipoServicio];
  if (!cfg) return FALLBACK_DURATION_MIN;
  const subtipo = linea?.sistema_instalacion || linea?.subtipo || null;
  let base = cfg.default;
  if (cfg.bySubtipo && subtipo && cfg.bySubtipo[subtipo] != null) {
    base = cfg.bySubtipo[subtipo];
  }
  if (base == null) base = FALLBACK_DURATION_MIN;
  const cant = cfg.perUnit ? Math.max(1, parseFloat(linea?.cantidad) || 1) : 1;
  let total = base * cant;
  if (tipoServicio === 'Abanico' && linea?.desinstalar_cantidad && cfg.desinstalacionPerUd) {
    total += cfg.desinstalacionPerUd * linea.desinstalar_cantidad;
  }
  return Math.round(total);
}

export function estimatePedidoDurationMin(tipoServicio, lineas, fallbackCantidad, durationsByTipo) {
  const cfg = durationsByTipo && durationsByTipo[tipoServicio];
  if (!cfg) return FALLBACK_DURATION_MIN;
  if (cfg.perUnit === false) return cfg.default ?? FALLBACK_DURATION_MIN;
  if (Array.isArray(lineas) && lineas.length) {
    return lineas.reduce((s, l) => s + estimateLineaDurationMin(tipoServicio, l, durationsByTipo), 0);
  }
  const cant = Math.max(1, parseFloat(fallbackCantidad) || 1);
  return Math.round((cfg.default ?? FALLBACK_DURATION_MIN) * cant);
}

export function addMinutesHHMM(hhmm, min) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date(2000, 0, 1, h, m + (min || 0));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
