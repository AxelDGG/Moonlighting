// Runtime config — carga datos de `/api/config/runtime` (pricing, duraciones,
// geo, zonas postales) y los cachea en memoria. Provee getters síncronos que
// caen a los fallbacks de constants.js si el fetch aún no completó.

import { api } from './api.js';
import {
  MUNIS_FALLBACK,
  PRICING_FALLBACK,
  DEFAULT_ESTADO_MX,
  MAP_DEFAULTS,
} from './constants.js';

let _cfg = null;
let _loadPromise = null;

// Seed sincrónico desde constants para que los módulos puedan llamar getters
// incluso antes de que loadRuntimeConfig() complete.
const SEED = {
  pricing:     { ...PRICING_FALLBACK },
  durations:   {},
  region:      {
    estado:      DEFAULT_ESTADO_MX,
    timezone:    'America/Monterrey',
    centerLat:   MAP_DEFAULTS.CENTER_LAT,
    centerLng:   MAP_DEFAULTS.CENTER_LNG,
    defaultZoom: MAP_DEFAULTS.DEFAULT_ZOOM,
  },
  municipios:  Object.entries(MUNIS_FALLBACK).map(([nombre, m]) => ({
    nombre,
    color:        m.color,
    centerLat:    m.center[0],
    centerLng:    m.center[1],
    radiusMeters: m.radius,
  })),
  postalZones: {},
  aliases:     {},
};

function current() {
  return _cfg || SEED;
}

export function loadRuntimeConfig() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const data = await api.config.runtime();
      if (data && typeof data === 'object') _cfg = data;
    } catch (err) {
      console.warn('[runtime-config] load failed, using fallback', err);
    }
    return current();
  })();
  return _loadPromise;
}

export function getPricing(clave) {
  const cfg = current();
  const val = cfg.pricing?.[clave];
  if (val != null) return val;
  return PRICING_FALLBACK[clave] ?? null;
}

export function getMunicipios() {
  return current().municipios || [];
}

export function getMunicipiosMap() {
  // Formato compatible con MUNIS legacy: { nombre: { color, center, radius } }
  const out = {};
  for (const m of getMunicipios()) {
    out[m.nombre] = { color: m.color, center: [m.centerLat, m.centerLng], radius: m.radiusMeters };
  }
  return out;
}

export function getMunicipiosList() {
  return getMunicipios().map(m => m.nombre);
}

export function getDefaultLocation() {
  const r = current().region || {};
  return {
    lat:       r.centerLat ?? MAP_DEFAULTS.CENTER_LAT,
    lng:       r.centerLng ?? MAP_DEFAULTS.CENTER_LNG,
    zoom:      r.defaultZoom ?? MAP_DEFAULTS.DEFAULT_ZOOM,
    timezone:  r.timezone ?? 'America/Monterrey',
    estado:    r.estado ?? DEFAULT_ESTADO_MX,
  };
}

export function getDuration(tipo, subtipo) {
  const cfg = current().durations?.[tipo];
  if (!cfg) return null;
  if (subtipo && cfg.bySubtipo?.[subtipo] != null) return cfg.bySubtipo[subtipo];
  return cfg.default ?? null;
}

export function getDurationConfig(tipo) {
  return current().durations?.[tipo] || null;
}

export function getAllDurations() {
  return current().durations || {};
}

export function resolveMunicipioAlias(input) {
  if (!input) return null;
  const key = String(input).trim().toLowerCase();
  return current().aliases?.[key] || null;
}

export function zonaFromCP(municipio, cp) {
  if (!municipio || cp == null) return null;
  const n = parseInt(String(cp).trim().slice(0, 5), 10);
  if (!Number.isFinite(n)) return null;
  const zones = current().postalZones?.[municipio];
  if (!zones) return null;
  for (const z of zones) {
    if (n >= z.cp_start && n <= z.cp_end) return z.zona;
  }
  return null;
}

export function allPostalZones() {
  return current().postalZones || {};
}
