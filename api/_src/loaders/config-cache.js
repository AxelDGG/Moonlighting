// In-memory cache del runtime config (pricing, durations, geo). Todo se lee
// desde Supabase al primer request y se refresca cada CACHE_TTLS.RUNTIME_CONFIG_MS.

import { CACHE_TTLS } from '../config/cache-ttls.js';

let _cache = null;
let _expiresAt = 0;
let _inflight = null;

async function fetchFromDb(supabase) {
  const [pricing, durations, regions, municipios, zones, aliases] = await Promise.all([
    supabase.from('pricing_config').select('clave, valor'),
    supabase.from('service_duration_subtipos').select('*'),
    supabase.from('geo_regions').select('*'),
    supabase.from('municipios').select('*'),
    supabase.from('postal_zones').select('*'),
    supabase.from('municipio_aliases').select('*'),
  ]);

  const pricingMap = {};
  for (const row of pricing.data || []) pricingMap[row.clave] = Number(row.valor);

  // Normaliza duraciones: { Abanico: { default: 25, bySubtipo: {...}, perUnit: true, desinstalacion: 10 } }
  const durationsByTipo = {};
  for (const row of durations.data || []) {
    const t = row.tipo_servicio;
    if (!durationsByTipo[t]) {
      durationsByTipo[t] = { perUnit: true, default: null, bySubtipo: {}, desinstalacionPerUd: null };
    }
    const cfg = durationsByTipo[t];
    cfg.perUnit = row.per_unit !== false;
    if (row.desinstalacion_per_ud != null) cfg.desinstalacionPerUd = row.desinstalacion_per_ud;
    if (row.subtipo == null) {
      cfg.default = row.duracion_min;
    } else {
      cfg.bySubtipo[row.subtipo] = row.duracion_min;
    }
  }
  // Asegurar default si solo hay subtipos
  for (const t of Object.keys(durationsByTipo)) {
    if (durationsByTipo[t].default == null) {
      const vals = Object.values(durationsByTipo[t].bySubtipo);
      if (vals.length) durationsByTipo[t].default = vals[0];
    }
  }

  const defaultRegion = (regions.data || []).find(r => r.is_default) || (regions.data || [])[0] || null;

  // Organizar zonas postales por municipio
  const zonesByMunicipio = {};
  const municipiosById = {};
  for (const m of municipios.data || []) municipiosById[m.id] = m;
  for (const z of zones.data || []) {
    const m = municipiosById[z.municipio_id];
    if (!m) continue;
    if (!zonesByMunicipio[m.nombre]) zonesByMunicipio[m.nombre] = [];
    zonesByMunicipio[m.nombre].push({ zona: z.zona, cp_start: z.cp_start, cp_end: z.cp_end });
  }

  const aliasMap = {};
  for (const a of aliases.data || []) {
    const m = municipiosById[a.municipio_id];
    if (m) aliasMap[a.alias] = m.nombre;
  }

  return {
    pricing: pricingMap,
    durations: durationsByTipo,
    region: defaultRegion && {
      estado:       defaultRegion.estado,
      timezone:     defaultRegion.timezone,
      centerLat:    defaultRegion.center_lat,
      centerLng:    defaultRegion.center_lng,
      defaultZoom:  defaultRegion.default_zoom,
    },
    municipios: (municipios.data || []).map(m => ({
      id:           m.id,
      nombre:       m.nombre,
      color:        m.color,
      centerLat:    m.center_lat,
      centerLng:    m.center_lng,
      radiusMeters: m.radius_meters,
    })),
    postalZones:   zonesByMunicipio,
    aliases:       aliasMap,
    generatedAt:   new Date().toISOString(),
  };
}

export async function getRuntimeConfig(supabase, { force = false } = {}) {
  if (!force && _cache && Date.now() < _expiresAt) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      _cache = await fetchFromDb(supabase);
      _expiresAt = Date.now() + CACHE_TTLS.RUNTIME_CONFIG_MS;
      return _cache;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

export function invalidateRuntimeConfig() {
  _cache = null;
  _expiresAt = 0;
}
