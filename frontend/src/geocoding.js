// ═══════════════════════════════════════════════════════════════════════════
// Geocoding — cliente que consume /api/geocode/* en el backend
// ═══════════════════════════════════════════════════════════════════════════
//
// Estrategia:
//   1. Intentar parseGoogleMapsUrl si la entrada parece URL         → precisión alta
//   2. parseAddress para obtener campos estructurados (calle/CP/muni)
//   3. POST /api/geocode/search con structured cuando haya CP+muni
//   4. Fallback a free-text si structured falla
//   5. Reverse geocode de validación para confirmar muni/CP
// ═══════════════════════════════════════════════════════════════════════════

import { api } from './api.js';
import { parseGoogleMapsUrl, parseAddress } from './zonas.js';

const ESTADO_DEFAULT = 'Nuevo León';

/**
 * Resuelve una entrada (dirección libre, URL larga o URL corta) a:
 *   { lat, lng, municipio, codigoPostal, source, confidence, verified }
 *
 * @param {Object} opts
 * @param {string} [opts.address]   dirección en texto libre
 * @param {string} [opts.url]       URL de Google Maps (larga o corta)
 * @returns {Promise<Object|null>}
 */
export async function resolveLocation({ address, url } = {}) {
  // 1) URL de Google Maps — camino rápido, máxima confianza
  if (url) {
    let longUrl = url;
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) {
      try {
        const r = await api.geocode.resolveShort(url);
        longUrl = r?.url || url;
      } catch (_) {
        return { error: 'short_url_unresolved' };
      }
    }
    const parsed = parseGoogleMapsUrl(longUrl);
    if (parsed?.error === 'low_zoom_search') return { error: 'low_zoom_search', zoom: parsed.zoom };
    if (parsed && parsed.lat != null) {
      return {
        lat: parsed.lat,
        lng: parsed.lng,
        municipio: parsed.municipio || null,
        codigoPostal: parsed.cp || null,
        source: 'google_url',
        confidence: 'high',
        verified: true,
        googleMapsUrl: longUrl,
      };
    }
  }

  // 2) Dirección textual → parseAddress + geocode estructurado
  if (!address) return null;
  const addr = parseAddress(address);

  const structured = addr ? {
    street:     addr.calle      || null,
    city:       addr.municipio  || null,
    postalcode: addr.codigoPostal || null,
    state:      addr.estado || ESTADO_DEFAULT,
  } : null;

  let res = null;
  try {
    res = await api.geocode.search({
      q: address,
      structured: structured && (structured.street || structured.postalcode) ? structured : null,
    });
  } catch (err) {
    // 404 o 5xx — devolvemos null para que el caller decida
    return { error: 'geocode_failed', message: err.message };
  }
  if (!res || res.lat == null) return null;

  // 3) Reverse-valida para detectar resultados malos (colonia vs dirección real)
  let reverseMatch = null;
  try {
    const rev = await api.geocode.reverse(res.lat, res.lng);
    if (rev?.codigoPostal && addr?.codigoPostal) {
      reverseMatch = rev.codigoPostal === addr.codigoPostal ? 'cp_match'
        : rev.codigoPostal.slice(0, 3) === addr.codigoPostal.slice(0, 3) ? 'cp_prefix'
        : 'cp_mismatch';
    }
  } catch (_) { /* no bloqueante */ }

  // Downgrade de confidence si el reverse detectó mismatch
  let confidence = res.confidence || 'medium';
  if (reverseMatch === 'cp_mismatch') confidence = 'low';
  else if (reverseMatch === 'cp_match' && confidence === 'medium') confidence = 'high';

  return {
    lat: res.lat,
    lng: res.lng,
    municipio: res.municipio || addr?.municipio || null,
    codigoPostal: res.codigoPostal || addr?.codigoPostal || null,
    source: res.source === 'cache' ? ('cache:' + (res.cachedProvider || 'nominatim')) : 'nominatim_' + (res.mode || 'structured'),
    confidence,
    verified: false,
    reverseMatch,
  };
}

/**
 * Convierte un resultado de resolveLocation a payload para api.clientes.update/create.
 * Centraliza la persistencia de los campos de verificación.
 */
export function toClientePayload(loc, extra = {}) {
  if (!loc) return extra;
  return {
    lat: loc.lat,
    lng: loc.lng,
    municipio: loc.municipio || extra.municipio || 'Desconocido',
    codigo_postal: loc.codigoPostal || extra.codigo_postal || null,
    google_maps_url: loc.googleMapsUrl || extra.google_maps_url || null,
    geocode_source: loc.source || null,
    geocode_confidence: loc.confidence || null,
    ubicacion_verificada: !!loc.verified,
    verified_at: loc.verified ? new Date().toISOString() : null,
    ...extra,
  };
}
