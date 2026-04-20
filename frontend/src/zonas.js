// ═══════════════════════════════════════════════════════════════════════════
// Zonas por código postal.
// ═══════════════════════════════════════════════════════════════════════════
//
// Los datos canónicos viven en Supabase (tabla `postal_zones` + `municipios`)
// y se cargan vía runtime-config.js. Este archivo expone funciones
// (getMunicipiosList, zonaFromCP, parseAddress, parseGoogleMapsUrl) que
// consultan primero el runtime-config y caen al seed local si aún no está
// disponible.
// ═══════════════════════════════════════════════════════════════════════════

import {
  allPostalZones,
  getMunicipiosList as _rtMunicipiosList,
  zonaFromCP as _rtZonaFromCP,
  resolveMunicipioAlias,
} from './runtime-config.js';

// Seed local — usado hasta que runtime-config resuelve. Mantener en sync con
// la migración 20260420_hardcoded_values_to_db.sql.
const SEED_ZONAS = {
  'Monterrey': [
    { zona: 'Norte',  cp: [[64200, 64699]] },
    { zona: 'Centro', cp: [[64000, 64199]] },
    { zona: 'Sur',    cp: [[64700, 64999]] },
  ],
  'Santa Catarina': [
    { zona: 'Oriente', cp: [[66100, 66249]] },
    { zona: 'Poniente', cp: [[66250, 66399]] },
  ],
  'San Pedro Garza García': [
    { zona: 'Oriente', cp: [[66200, 66249]] },
    { zona: 'Poniente', cp: [[66250, 66299]] },
  ],
  'Guadalupe': [
    { zona: 'Poniente', cp: [[67100, 67199]] },
    { zona: 'Oriente', cp: [[67200, 67299]] },
  ],
  'San Nicolás de los Garza': [
    { zona: 'Poniente', cp: [[66400, 66450]] },
    { zona: 'Oriente', cp: [[66451, 66499]] },
  ],
  'General Escobedo': [
    { zona: 'Sur',   cp: [[66050, 66074]] },
    { zona: 'Norte', cp: [[66075, 66099]] },
  ],
  'Apodaca': [
    { zona: 'Poniente', cp: [[66600, 66630]] },
    { zona: 'Centro',   cp: [[66631, 66649]] },
    { zona: 'Oriente',  cp: [[66650, 66699]] },
  ],
  'García': [
    { zona: 'Oriente',  cp: [[66000, 66015]] },
    { zona: 'Centro',   cp: [[66016, 66034]] },
    { zona: 'Poniente', cp: [[66035, 66059]] },
  ],
  'Juárez': [
    { zona: 'Poniente', cp: [[67250, 67264]] },
    { zona: 'Oriente',  cp: [[67265, 67299]] },
  ],
  'Pesquería': [
    { zona: 'Poniente', cp: [[66700, 66749]] },
    { zona: 'Oriente',  cp: [[66750, 66799]] },
  ],
  'Cadereyta Jiménez': [
    { zona: 'Poniente', cp: [[67450, 67479]] },
    { zona: 'Centro',   cp: [[67480, 67499]] },
    { zona: 'Oriente',  cp: [[67500, 67599]] },
  ],
};

// Vista dinámica de las zonas: si runtime-config cargó, úsalo; si no, el seed.
function getZonasDict() {
  const rt = allPostalZones();
  if (rt && Object.keys(rt).length) {
    // Convertir formato runtime-config ({ municipio: [{zona, cp_start, cp_end}] })
    // al formato legacy ({ municipio: [{zona, cp: [[start, end]]}] }).
    const out = {};
    for (const [m, zones] of Object.entries(rt)) {
      out[m] = zones.map(z => ({ zona: z.zona, cp: [[z.cp_start, z.cp_end]] }));
    }
    return out;
  }
  return SEED_ZONAS;
}

export function getMunicipiosList() {
  const rt = _rtMunicipiosList();
  if (rt && rt.length) return rt;
  return Object.keys(SEED_ZONAS);
}

export function zonaFromCP(municipio, cp) {
  if (!municipio || cp == null) return null;
  // Preferir runtime-config
  const rt = _rtZonaFromCP(municipio, cp);
  if (rt) return rt;
  // Fallback al seed
  const n = parseInt(String(cp).trim().slice(0, 5), 10);
  if (!Number.isFinite(n)) return null;
  const zonas = SEED_ZONAS[municipio];
  if (!zonas) return null;
  for (const { zona, cp: ranges } of zonas) {
    for (const [lo, hi] of ranges) {
      if (n >= lo && n <= hi) return zona;
    }
  }
  return null;
}

export function zonasDeMunicipio(municipio) {
  const dict = getZonasDict();
  return (dict[municipio] || []).map(z => z.zona);
}

export function parseGoogleMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!/google\.[a-z.]+\/maps/i.test(u) && !/maps\.app\.goo\.gl/i.test(u) && !/goo\.gl\/maps/i.test(u)) {
    return null;
  }

  let lat = null, lng = null, precision = null;

  const dMatch = u.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (dMatch) {
    lat = parseFloat(dMatch[1]);
    lng = parseFloat(dMatch[2]);
    precision = 'place';
  }

  if (lat == null || lng == null) {
    const qMatch = u.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (qMatch) {
      lat = parseFloat(qMatch[1]);
      lng = parseFloat(qMatch[2]);
      precision = 'query';
    }
  }

  if (lat == null || lng == null) {
    const atMatch = u.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/);
    if (atMatch) {
      const zoom = atMatch[3] ? parseFloat(atMatch[3]) : null;
      if (zoom == null || zoom >= 17) {
        lat = parseFloat(atMatch[1]);
        lng = parseFloat(atMatch[2]);
        precision = 'viewport';
      } else {
        return { error: 'low_zoom_search', zoom };
      }
    }
  }

  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  let place = null, cp = null, municipio = null;
  const placeMatch = u.match(/\/maps\/place\/([^/@]+)/i);
  if (placeMatch) {
    try {
      place = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    } catch (_) {
      place = placeMatch[1];
    }
    const cpMatch = place.match(/\b(\d{5})\b/);
    if (cpMatch) cp = cpMatch[1];
    for (const m of getMunicipiosList()) {
      if (place.toLowerCase().includes(m.toLowerCase())) { municipio = m; break; }
      const first = m.split(' ')[0].toLowerCase();
      if (first.length > 4 && place.toLowerCase().includes(first)) { municipio = m; break; }
    }
  }

  return { lat, lng, cp, place, municipio, precision };
}

export function parseAddress(address) {
  if (!address || typeof address !== 'string') return null;
  const parts = address.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;

  let calle = null, colonia = null, codigoPostal = null, municipio = null, estado = null;

  let cpSegIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(/^(\d{5})\s+(.+)$/);
    if (m) {
      codigoPostal = m[1];
      municipio = _normalizeMunicipio(m[2].trim());
      cpSegIdx = i;
      break;
    }
  }
  if (!codigoPostal) {
    for (const p of parts) {
      const m = p.match(/\b(\d{5})\b/);
      if (m) { codigoPostal = m[1]; break; }
    }
  }
  if (!municipio) {
    for (const p of parts) {
      const m = _normalizeMunicipio(p);
      if (getZonasDict()[m]) { municipio = m; break; }
    }
  }

  calle = parts[0] || null;
  if (parts.length >= 3) {
    colonia = parts[1] || null;
    if (cpSegIdx === 1) colonia = null;
  }
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (cpSegIdx !== parts.length - 1 && /^[A-Z.]{2,}$|^(Nuevo\s+Le[oó]n|NL)$/i.test(last)) {
      estado = last;
    }
  }

  const zona = codigoPostal && municipio ? zonaFromCP(municipio, codigoPostal) : null;
  return { calle, colonia, codigoPostal, municipio, estado, zona };
}

// Mapea variantes comunes al nombre canónico. Preferir la tabla
// `municipio_aliases` en BD; si no hay match, caer a la lista seed.
function _normalizeMunicipio(raw) {
  if (!raw) return raw;
  const s = raw.replace(/\s+N\.?L\.?$/i, '').trim();

  // Runtime-config (tabla municipio_aliases)
  const fromDb = resolveMunicipioAlias(s);
  if (fromDb) return fromDb;

  // Fallback local
  const SEED_ALIASES = {
    'monterrey': 'Monterrey',
    'mty': 'Monterrey',
    'san pedro': 'San Pedro Garza García',
    'san pedro garza garcia': 'San Pedro Garza García',
    'san pedro garza garcía': 'San Pedro Garza García',
    'guadalupe': 'Guadalupe',
    'san nicolas': 'San Nicolás de los Garza',
    'san nicolás': 'San Nicolás de los Garza',
    'san nicolas de los garza': 'San Nicolás de los Garza',
    'san nicolás de los garza': 'San Nicolás de los Garza',
    'apodaca': 'Apodaca',
    'escobedo': 'General Escobedo',
    'general escobedo': 'General Escobedo',
    'santa catarina': 'Santa Catarina',
    'garcia': 'García',
    'garcía': 'García',
    'juarez': 'Juárez',
    'juárez': 'Juárez',
    'pesqueria': 'Pesquería',
    'pesquería': 'Pesquería',
    'cadereyta': 'Cadereyta Jiménez',
    'cadereyta jimenez': 'Cadereyta Jiménez',
    'cadereyta jiménez': 'Cadereyta Jiménez',
  };
  const key = s.toLowerCase();
  if (SEED_ALIASES[key]) return SEED_ALIASES[key];
  for (const [k, v] of Object.entries(SEED_ALIASES)) {
    if (key.startsWith(k)) return v;
  }
  return s;
}
