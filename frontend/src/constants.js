// ═══════════════════════════════════════════════════════════════════════════
// Constantes globales del frontend. Todos los valores que NO cambian sin un
// deploy viven aquí. Los valores operativos (pricing, duraciones, geo-data)
// se cargan desde `/api/config/runtime` vía runtime-config.js.
// ═══════════════════════════════════════════════════════════════════════════

// ── Roles y permisos ───────────────────────────────────────────────────────
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  GESTOR: 'gestor',
  TECNICO: 'tecnico',
});

export const PERMISSIONS = Object.freeze({
  VER_METRICAS:    'ver_metricas',
  VER_DASHBOARD:   'ver_dashboard',
  CREAR_TECNICOS:  'crear_tecnicos',
  VER_PORCENTAJES: 'ver_porcentajes',
  VER_ALMACEN:     'ver_almacen',
  VER_CALENDARIO:  'ver_calendario',
  VER_MAPA:        'ver_mapa',
});

// ── Seed de geo-data (usado si runtime-config aún no carga) ────────────────
// Se reemplaza con los datos de Supabase (tabla municipios) una vez que
// runtime-config.js resuelve. No editar este seed: editar la BD.
export const MUNIS_FALLBACK = Object.freeze({
  'Monterrey':               { color: '#3b82f6', center: [25.6694, -100.3097], radius: 7500 },
  'San Pedro Garza García':  { color: '#22c55e', center: [25.6519, -100.4042], radius: 4500 },
  'Guadalupe':               { color: '#ef4444', center: [25.6800, -100.2540], radius: 5000 },
  'San Nicolás de los Garza':{ color: '#a855f7', center: [25.7395, -100.3063], radius: 4500 },
  'Apodaca':                 { color: '#f59e0b', center: [25.7735, -100.1949], radius: 5500 },
  'General Escobedo':        { color: '#06b6d4', center: [25.7955, -100.3292], radius: 5500 },
  'Santa Catarina':          { color: '#ec4899', center: [25.6733, -100.4602], radius: 6000 },
  'García':                  { color: '#84cc16', center: [25.7972, -100.5877], radius: 8000 },
});

// ── Iconos / colores por tipo y estado ─────────────────────────────────────
export const PAGO_CLS = { Efectivo: 'pef', Tarjeta: 'pta', Transferencia: 'ptr', Credito: 'pcr' };
export const PAGO_IC  = { Efectivo: 'banknote', Tarjeta: 'credit-card', Transferencia: 'arrow-left-right', Credito: 'file-text' };

export const TIPO_IC = { Abanico: 'wind', Persiana: 'layout-template', Levantamiento: 'ruler', Limpieza: 'sparkles', Mantenimiento: 'wrench' };
export const TIPO_BG = { Abanico: '#dbeafe', Persiana: '#dcfce7', Levantamiento: '#f3e8ff', Limpieza: '#fef3c7', Mantenimiento: '#ffedd5' };
export const TIPO_CO = { Abanico: '#1e40af', Persiana: '#166534', Levantamiento: '#581c87', Limpieza: '#92400e', Mantenimiento: '#c2410c' };

// Estados de servicio — deben coincidir con ALL_SERVICE_STATES del backend.
export const SERVICE_STATES = Object.freeze({
  PROGRAMADO: 'programado',
  EN_RUTA:    'en_ruta',
  EN_PROCESO: 'en_proceso',
  COMPLETADO: 'completado',
  CANCELADO:  'cancelado',
  ATRASADO:   'atrasado',
});

export const STATUS_LABELS = {
  programado: 'Programado',
  en_ruta:    'En ruta',
  en_proceso: 'En proceso',
  completado: 'Completado',
  cancelado:  'Cancelado',
  atrasado:   'Atrasado',
  // Alias legacy (datos pre-migración 20260420)
  en_curso:   'En proceso',
};

export const STATUS_COLORS = {
  programado: '#f59e0b',
  en_ruta:    '#3b82f6',
  en_proceso: '#6366f1',
  completado: '#22c55e',
  cancelado:  '#94a3b8',
  atrasado:   '#ef4444',
  en_curso:   '#6366f1',
};

export const STATUS_BG = {
  programado: '#fef3c7',
  en_ruta:    '#dbeafe',
  en_proceso: '#e0e7ff',
  completado: '#dcfce7',
  cancelado:  '#f1f5f9',
  atrasado:   '#fee2e2',
  en_curso:   '#e0e7ff',
};

// ── UI: debounces y delays (ms) ────────────────────────────────────────────
export const DEBOUNCE = Object.freeze({
  AUTOCOMPLETE: 150,
  GEOCODE:      400,
  MAP_RESOLVE:  300,
  LEAFLET_INVALIDATE: 50,
  RENDER:       150,
  ANIMATION_SHAKE: 400,
  GEOCODE_PENDING: 1100, // respeta rate-limit del backend (20/min)
});

export const TOAST_DURATION_MS = 3500;

// ── Mapas ──────────────────────────────────────────────────────────────────
export const MAP_DEFAULTS = Object.freeze({
  TILE_URL:     'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  TILE_ATTRIB:  '&copy; OpenStreetMap',
  MAX_ZOOM:     19,
  DEFAULT_ZOOM: 11,
  FIT_PADDING:  [50, 50],
  ROUTE_CIRCLE_RADIUS_M: 350,
  HULL_EXPAND_EPSILON: 0.003, // ~300m
  // Coords fallback — se sobreescriben con el centro de geo_regions si carga.
  CENTER_LAT: 25.6866,
  CENTER_LNG: -100.3161,
});

// ── Planificación de rutas (valores operativos del negocio) ────────────────
// Estos viven aquí por ahora; si cambian con frecuencia, mover a
// pricing_config o a una tabla route_planning_config en BD.
export const ROUTE_PLANNING = Object.freeze({
  AVG_SPEED_KMH:      30,
  AVG_SERVICE_MIN:    90,
  MAX_PER_ROUTE:       6,
  MAX_TRANSIT_MIN:   120,
  MAX_SAVED_ROUTES:   30,
});

// ── Pricing fallback (sobreescrito por runtime-config) ─────────────────────
export const PRICING_FALLBACK = Object.freeze({
  costo_desinstalacion_por_ud: 100,
  costo_traslado_default:        0,
});

// ── Estado MX default (sobreescrito por runtime-config) ────────────────────
export const DEFAULT_ESTADO_MX = 'Nuevo León';
