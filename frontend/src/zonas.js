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
    { zona: 'Norte',  cp: [[64200, 64390]] },
    { zona: 'Centro', cp: [[64000, 64190]] },
    { zona: 'Sur',    cp: [[64700, 64990]] },
  ],
  'Santa Catarina': [
    { zona: 'Oriente', cp: [[66100, 66150]] },
    { zona: 'Poniente', cp: [[66350, 66380]] },
  ],
  'San Pedro Garza García': [
    { zona: 'Oriente', cp: [[66220, 66240]] },
    { zona: 'Poniente', cp: [[66250, 66280]] },
  ],
  'Guadalupe': [
    { zona: 'Poniente', cp: [[67100, 67170]] },
    { zona: 'Oriente', cp: [[67200, 67290]] },
  ],
  'San Nicolás de los Garza': [
    { zona: 'Poniente', cp: [[66400, 66450]] },
    { zona: 'Oriente', cp: [[66460, 66490]] },
  ],
  'General Escobedo': [
    { zona: 'Sur',   cp: [[66050, 66070]] },
    { zona: 'Norte', cp: [[66080, 66090]] },
  ],
  'Apodaca': [
    { zona: 'Poniente', cp: [[66600, 66630]] },
    { zona: 'Centro',   cp: [[66640, 66649]] },
    { zona: 'Oriente',  cp: [[66650, 66659], [66670, 66699]] },
  ],
  'García': [
    { zona: 'Oriente', cp: [[66000, 66010]] },
    { zona: 'Centro',  cp: [[66020, 66030]] },
    { zona: 'Poniente', cp: [[66035, 66049]] },
  ],
  'Juárez': [
    { zona: 'Poniente', cp: [[67250, 67260]] },
    { zona: 'Oriente',  cp: [[67270, 67290]] },
  ],
  'Pesquería': [
    { zona: 'Poniente', cp: [[66650, 66660]] },
    { zona: 'Oriente',  cp: [[66670, 66699]] },
  ],
  'Cadereyta Jiménez': [
    { zona: 'Poniente', cp: [[67480, 67490]] },
    { zona: 'Centro',   cp: [[67450, 67470]] },
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

  // 1) Patrón @lat,lng
  let lat = null, lng = null;
  const atMatch = u.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    lat = parseFloat(atMatch[1]);
    lng = parseFloat(atMatch[2]);
  }
  // 2) !3d<lat>!4d<lng>
  if (lat == null || lng == null) {
    const dMatch = u.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (dMatch) {
      lat = parseFloat(dMatch[1]);
      lng = parseFloat(dMatch[2]);
    }
  }
  // 3) query=lat,lng
  if (lat == null || lng == null) {
    const qMatch = u.match(/[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (qMatch) {
      lat = parseFloat(qMatch[1]);
      lng = parseFloat(qMatch[2]);
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

  return { lat, lng, cp, place, municipio };
}
