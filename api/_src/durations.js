// Estimación de duración en backend (mirror de frontend/src/durations.js).
// Se mantiene en sync manualmente — los valores son promedios del negocio.

const DURACION_CONFIG = {
  Abanico: {
    perUnit: true,
    bySubtipo: { 'plafón': 25, 'retráctil': 25, 'candil': 57 },
    default: 25,
    desinstalacionPerUd: 10,
  },
  Persiana:      { perUnit: true,  default: 37 },
  Levantamiento: { perUnit: false, default: 20 },
  Mantenimiento: {
    perUnit: true,
    bySubtipo: { 'plafón': 40, 'candil': 75, 'persiana': 35, 'arreglos': 30 },
    default: 40,
  },
  Limpieza: { perUnit: true, default: 30 },
};

function estimateLineaDurationMin(tipoServicio, linea) {
  const cfg = DURACION_CONFIG[tipoServicio];
  if (!cfg) return 30;
  const subtipo = linea?.sistema_instalacion || linea?.subtipo || null;
  let base = cfg.default;
  if (cfg.bySubtipo && subtipo && cfg.bySubtipo[subtipo] != null) {
    base = cfg.bySubtipo[subtipo];
  }
  const cant = cfg.perUnit ? Math.max(1, parseFloat(linea?.cantidad) || 1) : 1;
  let total = base * cant;
  if (tipoServicio === 'Abanico' && linea?.desinstalar_cantidad) {
    total += (cfg.desinstalacionPerUd || 0) * linea.desinstalar_cantidad;
  }
  return Math.round(total);
}

export function estimatePedidoDurationMin(tipoServicio, lineas, fallbackCantidad) {
  const cfg = DURACION_CONFIG[tipoServicio];
  if (!cfg) return 60;
  if (cfg.perUnit === false) return cfg.default;
  if (Array.isArray(lineas) && lineas.length) {
    return lineas.reduce((s, l) => s + estimateLineaDurationMin(tipoServicio, l), 0);
  }
  // Sin lineas disponibles → usar cantidad del pedido como estimación aproximada
  const cant = Math.max(1, parseFloat(fallbackCantidad) || 1);
  return Math.round(cfg.default * cant);
}

export function addMinutesHHMM(hhmm, min) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date(2000, 0, 1, h, m + (min || 0));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
