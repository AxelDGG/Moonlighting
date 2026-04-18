// ═══════════════════════════════════════════════════════════════════════════
// Mapeo de zonas por código postal (Monterrey y área metropolitana)
// ═══════════════════════════════════════════════════════════════════════════
//
// Para cada municipio se define una lista de zonas, y cada zona tiene uno o
// más rangos de códigos postales (inclusivos). La función `zonaFromCP` toma
// un municipio + un CP y devuelve la zona correspondiente, o null.
//
// También exporta `parseGoogleMapsUrl(url)` que extrae lat/lng y el CP (si
// aparece en la URL) a partir de una URL de Google Maps.
// ═══════════════════════════════════════════════════════════════════════════

export const ZONAS_POR_MUNICIPIO = {
  'Monterrey': [
    // Norte cubre Mitras, Cumbres, Del Valle, Del Paseo, Valle Oriente (64200-64699)
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

// Lista de municipios en orden consistente
export const MUNICIPIOS_LIST = Object.keys(ZONAS_POR_MUNICIPIO);

/**
 * Devuelve la zona correspondiente a un (municipio, CP) o null si no aplica.
 * @param {string} municipio
 * @param {string|number} cp
 */
export function zonaFromCP(municipio, cp) {
  if (!municipio || cp == null) return null;
  const n = parseInt(String(cp).trim().slice(0, 5), 10);
  if (!Number.isFinite(n)) return null;
  const zonas = ZONAS_POR_MUNICIPIO[municipio];
  if (!zonas) return null;
  for (const { zona, cp: ranges } of zonas) {
    for (const [lo, hi] of ranges) {
      if (n >= lo && n <= hi) return zona;
    }
  }
  return null;
}

/**
 * Lista de zonas únicas para un municipio dado.
 */
export function zonasDeMunicipio(municipio) {
  return (ZONAS_POR_MUNICIPIO[municipio] || []).map(z => z.zona);
}

/**
 * Extrae coordenadas, CP y municipio (si están presentes) de una URL de
 * Google Maps. Acepta formatos como:
 *   https://www.google.com.mx/maps/place/<Dir>/@<lat>,<lng>,<zoom>z/...
 *   https://maps.app.goo.gl/... (requiere resolución; aquí no se sigue)
 *   https://www.google.com/maps/@<lat>,<lng>,<zoom>z
 *   https://www.google.com/maps/search/?api=1&query=<lat>,<lng>
 *
 * @returns {{lat:number,lng:number,cp:?string,place:?string,municipio:?string}|null}
 */
export function parseGoogleMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!/google\.[a-z.]+\/maps/i.test(u) && !/maps\.app\.goo\.gl/i.test(u) && !/goo\.gl\/maps/i.test(u)) {
    return null;
  }

  // Orden de preferencia por precisión:
  //   1) !3d<lat>!4d<lng>  → coordenada exacta del lugar (siempre precisa)
  //   2) ?q=lat,lng o &query=lat,lng → coordenada explícita del query
  //   3) @lat,lng,<zoom>z  → centro del viewport; solo es precisa a nivel calle
  //      (zoom ≥ 17). En /maps/search/ con zoom bajo esto es la vista general,
  //      no la ubicación real → se rechaza.
  let lat = null, lng = null, precision = null;

  // 1) !3d!4d — coord exacta del lugar (URLs /maps/place/)
  const dMatch = u.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (dMatch) {
    lat = parseFloat(dMatch[1]);
    lng = parseFloat(dMatch[2]);
    precision = 'place';
  }

  // 2) query=lat,lng — coord explícita
  if (lat == null || lng == null) {
    const qMatch = u.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (qMatch) {
      lat = parseFloat(qMatch[1]);
      lng = parseFloat(qMatch[2]);
      precision = 'query';
    }
  }

  // 3) @lat,lng,<zoom>z — aceptar solo con zoom de calle
  if (lat == null || lng == null) {
    const atMatch = u.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/);
    if (atMatch) {
      const zoom = atMatch[3] ? parseFloat(atMatch[3]) : null;
      if (zoom == null || zoom >= 17) {
        lat = parseFloat(atMatch[1]);
        lng = parseFloat(atMatch[2]);
        precision = 'viewport';
      } else {
        // Viewport center con zoom bajo → no es confiable
        return { error: 'low_zoom_search', zoom };
      }
    }
  }

  // Validar rango de coordenadas
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  // Extraer la parte /place/<...>/ para sacar CP y municipio
  let place = null, cp = null, municipio = null;
  const placeMatch = u.match(/\/maps\/place\/([^/@]+)/i);
  if (placeMatch) {
    try {
      place = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    } catch (_) {
      place = placeMatch[1];
    }
    // CP: 5 dígitos contiguos
    const cpMatch = place.match(/\b(\d{5})\b/);
    if (cpMatch) cp = cpMatch[1];
    // Municipio conocido mencionado en el texto
    for (const m of MUNICIPIOS_LIST) {
      if (place.toLowerCase().includes(m.toLowerCase())) { municipio = m; break; }
      const first = m.split(' ')[0].toLowerCase();
      if (first.length > 4 && place.toLowerCase().includes(first)) { municipio = m; break; }
    }
  }

  return { lat, lng, cp, place, municipio, precision };
}

/**
 * Parsea una dirección en el formato que Google Maps entrega al "Copiar
 * dirección":
 *   "Pedregal de La Cascada 6769, Pedregal La Silla, 64898 Monterrey, N.L."
 * Es decir: `Calle+Número, Colonia, CP Municipio, Estado`.
 *
 * Admite también variantes con más o menos comas; lo importante es que la
 * parte "CP Municipio" aparezca en algún segmento (5 dígitos seguidos del
 * nombre del municipio).
 *
 * @returns {{calle:?string,colonia:?string,codigoPostal:?string,municipio:?string,estado:?string,zona:?string}|null}
 */
export function parseAddress(address) {
  if (!address || typeof address !== 'string') return null;
  const parts = address.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;

  let calle = null, colonia = null, codigoPostal = null, municipio = null, estado = null;

  // Buscar segmento con "CP Municipio" (ej. "64898 Monterrey")
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
  // Si no encontramos un segmento "CP Muni", intentar extraer CP suelto
  if (!codigoPostal) {
    for (const p of parts) {
      const m = p.match(/\b(\d{5})\b/);
      if (m) { codigoPostal = m[1]; break; }
    }
  }
  // Municipio: si no lo encontramos con el CP, buscar uno conocido en cualquier segmento
  if (!municipio) {
    for (const p of parts) {
      const m = _normalizeMunicipio(p);
      if (ZONAS_POR_MUNICIPIO[m]) { municipio = m; break; }
    }
  }

  // Calle = primer segmento
  calle = parts[0] || null;
  // Colonia = segundo segmento si es distinto del de CP
  if (parts.length >= 3) {
    colonia = parts[1] || null;
    if (cpSegIdx === 1) colonia = null;
  }
  // Estado = último segmento si no es el de CP (típicamente "N.L." / "Nuevo León")
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (cpSegIdx !== parts.length - 1 && /^[A-Z.]{2,}$|^(Nuevo\s+Le[oó]n|NL)$/i.test(last)) {
      estado = last;
    }
  }

  const zona = codigoPostal && municipio ? zonaFromCP(municipio, codigoPostal) : null;
  return { calle, colonia, codigoPostal, municipio, estado, zona };
}

// Mapea variantes comunes al nombre canónico usado en ZONAS_POR_MUNICIPIO
function _normalizeMunicipio(raw) {
  if (!raw) return raw;
  const s = raw.replace(/\s+N\.?L\.?$/i, '').trim();
  const aliases = {
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
  if (aliases[key]) return aliases[key];
  // Intento por prefijo
  for (const [k, v] of Object.entries(aliases)) {
    if (key.startsWith(k)) return v;
  }
  return s;
}
