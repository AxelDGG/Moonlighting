// ═══════════════════════════════════════════════════════════════════════════
// Geocoding pipeline
// ═══════════════════════════════════════════════════════════════════════════
// Endpoints:
//   POST /api/geocode/search           → estructurado + fallback free-text
//   POST /api/geocode/reverse          → lat,lng → { municipio, cp, display_name }
//   POST /api/geocode/resolve-short    → maps.app.goo.gl → URL larga
//
// Todos cachean en la tabla geocode_cache para evitar golpear Nominatim.
// ═══════════════════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

const NOMINATIM      = 'https://nominatim.openstreetmap.org';
const USER_AGENT     = 'Moonlighting/4.0 (contacto: moonlighting@local)';
const ACCEPT_LANG    = 'es';
const CACHE_TTL_DAYS = 90;

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function normalizeKey(parts) {
  // Normaliza para que "Calle 1, Mty " === "calle 1,mty"
  return parts
    .filter(Boolean)
    .map(s => String(s).trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|');
}

// Mapeo del resultado de Nominatim → campos normalizados
function extractMunicipio(addr) {
  if (!addr) return null;
  for (const k of ['city', 'town', 'municipality', 'county', 'state_district', 'village']) {
    if (addr[k]) return String(addr[k]).replace(/^Municipio\s+(de\s+)?/i, '').trim();
  }
  return null;
}

function extractCP(addr) {
  if (!addr) return null;
  return addr.postcode ? String(addr.postcode).slice(0, 5) : null;
}

function inferConfidence(item) {
  // Nominatim devuelve `place_rank` (0-30, menor = más específico) y `importance`.
  // También `class`/`type` (p.ej. building=yes, amenity, highway=residential).
  const rank = item.place_rank ?? 30;
  const cls  = (item.class || '').toLowerCase();
  const type = (item.type  || '').toLowerCase();
  // building / house / address → alta
  if (rank <= 26 || cls === 'building' || type === 'house' || type === 'yes') return 'high';
  if (rank <= 28 || type === 'residential' || type === 'road') return 'medium';
  return 'low';
}

async function fetchJson(url, { timeoutMs = 8000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { 'Accept-Language': ACCEPT_LANG, 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ── Cache helpers ───────────────────────────────────────────────────────────
async function cacheGet(supabase, hash) {
  const { data } = await supabase
    .from('geocode_cache')
    .select('*')
    .eq('query_hash', hash)
    .maybeSingle();
  if (!data) return null;
  // TTL
  const ageDays = (Date.now() - new Date(data.last_used_at).getTime()) / 86400000;
  if (ageDays > CACHE_TTL_DAYS) return null;
  // Actualizar contador en background (fire-and-forget)
  supabase.from('geocode_cache')
    .update({ hit_count: (data.hit_count || 0) + 1, last_used_at: new Date().toISOString() })
    .eq('query_hash', hash)
    .then(() => {}, () => {});
  return data;
}

async function cachePut(supabase, row) {
  // Upsert por hash
  await supabase.from('geocode_cache').upsert(row, { onConflict: 'query_hash' });
}

// ── Provider: Nominatim ─────────────────────────────────────────────────────
async function nominatimStructured({ street, city, postalcode, state, country = 'mx' }) {
  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    limit: '1',
    countrycodes: country,
  });
  if (street)     params.set('street', street);
  if (city)       params.set('city', city);
  if (postalcode) params.set('postalcode', postalcode);
  if (state)      params.set('state', state);
  const url = `${NOMINATIM}/search?${params}`;
  const arr = await fetchJson(url);
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

async function nominatimFree(q) {
  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    limit: '1',
    countrycodes: 'mx',
    q,
  });
  const arr = await fetchJson(`${NOMINATIM}/search?${params}`);
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

async function nominatimReverse(lat, lng) {
  const params = new URLSearchParams({
    format: 'json',
    lat: String(lat),
    lon: String(lng),
    addressdetails: '1',
    zoom: '18',
  });
  return await fetchJson(`${NOMINATIM}/reverse?${params}`);
}

// ── Route handlers ──────────────────────────────────────────────────────────
export default async function geocodeRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  // Rate-limit extra para no saturar Nominatim
  const routeRL = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  // POST /search
  //   body: { q?: string, structured?: { street, city, postalcode, state } }
  fastify.post('/search', {
    ...routeRL,
    schema: {
      body: {
        type: 'object',
        properties: {
          q: { type: ['string', 'null'] },
          structured: {
            type: ['object', 'null'],
            properties: {
              street:     { type: ['string', 'null'] },
              city:       { type: ['string', 'null'] },
              postalcode: { type: ['string', 'null'] },
              state:      { type: ['string', 'null'] },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { q, structured } = req.body || {};
    const hasStructured = structured && (structured.street || structured.city || structured.postalcode);
    if (!q && !hasStructured) return reply.code(400).send({ error: 'Falta q o structured' });

    // Clave de caché
    const keyParts = hasStructured
      ? ['structured', structured.street, structured.city, structured.postalcode, structured.state]
      : ['free', q];
    const hash = sha256(normalizeKey(keyParts));

    // Cache
    const cached = await cacheGet(fastify.supabase, hash);
    if (cached && cached.lat != null) {
      return {
        lat: Number(cached.lat), lng: Number(cached.lng),
        municipio: cached.municipio, codigoPostal: cached.codigo_postal,
        displayName: cached.display_name,
        source: 'cache',
        cachedProvider: cached.provider,
        confidence: cached.raw_response?._confidence || null,
      };
    }

    // Fetch real
    let item = null, mode = 'structured';
    try {
      if (hasStructured) {
        item = await nominatimStructured(structured);
      }
      if (!item && q) {
        mode = 'free';
        item = await nominatimFree(q);
      }
    } catch (err) {
      req.log.warn({ err: err.message }, 'nominatim error');
      return reply.code(502).send({ error: 'Geocoder no disponible' });
    }

    if (!item) {
      // Cachea un miss liviano (sin coords) para no reintentar al toque
      await cachePut(fastify.supabase, {
        query_hash: hash, query_text: q || JSON.stringify(structured),
        provider: 'nominatim', mode,
        lat: null, lng: null, municipio: null, codigo_postal: null,
        display_name: null, raw_response: { miss: true },
      });
      return reply.code(404).send({ error: 'Sin resultados' });
    }

    const confidence = inferConfidence(item);
    const lat = +item.lat, lng = +item.lon;
    const municipio = extractMunicipio(item.address);
    const codigoPostal = extractCP(item.address);

    await cachePut(fastify.supabase, {
      query_hash: hash,
      query_text: q || JSON.stringify(structured),
      provider: 'nominatim',
      mode,
      lat, lng,
      municipio, codigo_postal: codigoPostal,
      display_name: item.display_name || null,
      raw_response: { ...item, _confidence: confidence },
    });

    return {
      lat, lng, municipio, codigoPostal,
      displayName: item.display_name || null,
      source: 'nominatim',
      confidence,
      mode,
    };
  });

  // POST /reverse  { lat, lng }
  fastify.post('/reverse', {
    ...routeRL,
    schema: {
      body: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: { lat: { type: 'number' }, lng: { type: 'number' } },
      },
    },
  }, async (req, reply) => {
    const { lat, lng } = req.body;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return reply.code(400).send({ error: 'Coordenadas inválidas' });

    const hash = sha256(normalizeKey(['reverse', lat.toFixed(5), lng.toFixed(5)]));
    const cached = await cacheGet(fastify.supabase, hash);
    if (cached) {
      return {
        municipio: cached.municipio, codigoPostal: cached.codigo_postal,
        displayName: cached.display_name, source: 'cache',
      };
    }

    let item;
    try { item = await nominatimReverse(lat, lng); }
    catch (err) {
      req.log.warn({ err: err.message }, 'nominatim reverse error');
      return reply.code(502).send({ error: 'Geocoder no disponible' });
    }

    const municipio = extractMunicipio(item?.address);
    const codigoPostal = extractCP(item?.address);

    await cachePut(fastify.supabase, {
      query_hash: hash,
      query_text: `${lat},${lng}`,
      provider: 'nominatim', mode: 'reverse',
      lat, lng, municipio, codigo_postal: codigoPostal,
      display_name: item?.display_name || null,
      raw_response: item || null,
    });

    return {
      municipio, codigoPostal,
      displayName: item?.display_name || null,
      source: 'nominatim',
    };
  });

  // POST /resolve-short   body: { url }  → sigue redirect de maps.app.goo.gl
  fastify.post('/resolve-short', {
    ...routeRL,
    schema: {
      body: {
        type: 'object', required: ['url'],
        properties: { url: { type: 'string', minLength: 5, maxLength: 500 } },
      },
    },
  }, async (req, reply) => {
    const { url } = req.body;
    if (!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url)) {
      return reply.code(400).send({ error: 'No es una URL corta de Google Maps' });
    }
    try {
      // Seguir hasta 5 redirects manualmente
      let current = url, finalUrl = null;
      for (let i = 0; i < 5; i++) {
        const res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': USER_AGENT } });
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
          current = loc;
          finalUrl = loc;
        } else {
          finalUrl = finalUrl || current;
          break;
        }
      }
      if (!finalUrl) return reply.code(404).send({ error: 'No se pudo resolver la URL' });
      return { url: finalUrl };
    } catch (err) {
      req.log.warn({ err: err.message }, 'resolve-short error');
      return reply.code(502).send({ error: 'No se pudo contactar Google Maps' });
    }
  });
}
