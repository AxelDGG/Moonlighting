// Estimación de duración de servicio, basada en promedios del negocio.
//
// Tiempos promedio acordados:
//   Instalación abanico plafón / retráctil ... 20–30 min por unidad → 25 min
//   Instalación abanico candil ............... 45–70 min por unidad → 57 min
//   Instalación de persiana .................. 30–45 min por pieza  → 37 min
//   Toma de medidas (Levantamiento) .......... 15–25 min por domicilio → 20 min
//   Mantenimiento abanico plafón ............. 35–45 min → 40 min
//   Mantenimiento abanico candil ............. 60–90 min → 75 min
//   Arreglos (módulo, LED, detalles) ......... 20–40 min → 30 min
//   Limpieza abanico (por unidad) ............ estimado 30 min

export const SUBTIPO_ABANICO       = ['plafón', 'retráctil', 'candil'];
export const SUBTIPO_MANTENIMIENTO = ['plafón', 'candil', 'persiana', 'arreglos'];

export const DURACION_CONFIG = {
  Abanico: {
    perUnit: true,
    bySubtipo: { 'plafón': 25, 'retráctil': 25, 'candil': 57 },
    default: 25,
    desinstalacionPerUd: 10,
  },
  Persiana: {
    perUnit: true,
    default: 37,
  },
  Levantamiento: {
    perUnit: false,
    default: 20,
  },
  Mantenimiento: {
    perUnit: true,
    bySubtipo: { 'plafón': 40, 'candil': 75, 'persiana': 35, 'arreglos': 30 },
    default: 40,
  },
  Limpieza: {
    perUnit: true,
    default: 30,
  },
};

export function estimateLineaDurationMin(tipoServicio, linea) {
  const cfg = DURACION_CONFIG[tipoServicio];
  if (!cfg) return 30;
  const subtipo = linea?.subTipo || linea?.sistemaInstalacion || linea?.instalacion || null;
  let base = cfg.default;
  if (cfg.bySubtipo && subtipo && cfg.bySubtipo[subtipo] != null) {
    base = cfg.bySubtipo[subtipo];
  }
  const cant = cfg.perUnit ? Math.max(1, parseFloat(linea?.cantidad) || 1) : 1;
  let total = base * cant;
  if (tipoServicio === 'Abanico' && linea?.nDesins) {
    total += (cfg.desinstalacionPerUd || 0) * linea.nDesins;
  }
  return Math.round(total);
}

export function estimatePedidoDurationMin(tipoServicio, lineas) {
  const cfg = DURACION_CONFIG[tipoServicio];
  if (!cfg) return 30;
  if (cfg.perUnit === false) return cfg.default;
  if (!Array.isArray(lineas) || !lineas.length) return cfg.default;
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
