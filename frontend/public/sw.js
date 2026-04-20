/**
 * Service Worker para Moonlighting PWA.
 *
 * Estrategias:
 *   - Assets estáticos (JS/CSS/HTML): stale-while-revalidate — rápido y se auto-actualiza.
 *   - API /api/*: network-first con fallback a cache; permite a técnicos ver la agenda offline.
 *   - Imágenes/íconos/manifest: cache-first.
 *
 * Incrementa STATIC_CACHE al cambiar la estructura del SW para invalidar caches viejos.
 */
const STATIC_CACHE = 'ml-static-v1';
const API_CACHE    = 'ml-api-v1';
const ASSET_CACHE  = 'ml-assets-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => ![STATIC_CACHE, API_CACHE, ASSET_CACHE].includes(k)).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API: network-first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  // Same-origin JS/CSS: stale-while-revalidate
  if (url.origin === self.location.origin && /\.(js|css)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, ASSET_CACHE));
    return;
  }

  // Images, fonts, manifest: cache-first
  if (/\.(svg|png|jpg|jpeg|webp|ico|woff2?|ttf)$/.test(url.pathname) || url.pathname === '/manifest.json') {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }

  // HTML navigation: network-first with offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then(c => c.put('/', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('/') || caches.match('/index.html'))
    );
    return;
  }
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Respuesta offline sintética para que el cliente muestre su propio UI
    return new Response(JSON.stringify({ offline: true, error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}
