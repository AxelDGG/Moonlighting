/**
 * icons.js — helper de iconos Lucide para uso en innerHTML dinámico.
 * Llama a refreshIcons() después de cada render que use ic().
 */

/** Retorna un <i data-lucide> listo para ser procesado por lucide.createIcons() */
export function ic(name, { size = 16, cls = '', style = '' } = {}) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;${style}" class="svg-ic ${cls}"></i>`;
}

/** Llama a lucide.createIcons() sobre un scope opcional (por defecto todo el doc) */
export function refreshIcons(scope) {
  if (!window.lucide) return;
  try {
    if (scope) window.lucide.createIcons({ nameAttr: 'data-lucide', nodes: scope.querySelectorAll('[data-lucide]') });
    else       window.lucide.createIcons();
  } catch (_) { /* noop */ }
}

// ── Aliases semánticos ──────────────────────────────────────────────────────
export const IC = {
  // Navegación
  dashboard:   'layout-dashboard',
  clientes:    'users',
  pedidos:     'package',
  almacen:     'archive',
  calendario:  'calendar',
  mapa:        'map',
  metricas:    'bar-chart-2',
  // Acciones
  add:         'plus',
  edit:        'pencil',
  del:         'trash-2',
  export:      'download',
  search:      'search',
  track:       'map-pin',
  regen:       'refresh-cw',
  logout:      'log-out',
  menu:        'menu',
  close:       'x',
  // Servicios
  abanico:     'wind',
  persiana:    'layout-template',
  limpieza:    'sparkles',
  levantamiento: 'ruler',
  mantenimiento: 'wrench',
  // Pagos
  efectivo:    'banknote',
  tarjeta:     'credit-card',
  transferencia: 'building-2',
  credito:     'file-text',
  // Lugares
  bodega:      'warehouse',
  casa:        'home',
  camioneta:   'truck',
  // Tracking
  tecnico:     'hard-hat',
  alerta:      'alert-triangle',
  ok:          'check-circle',
  error:       'x-circle',
  tiempo:      'timer',
  // Misc
  phone:       'phone',
  location:    'map-pin',
  ai:          'bot',
  moon:        'moon',
  pago:        'wallet',
  stats:       'trending-up',
  nota:        'file-text',
};
