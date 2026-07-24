// Kevin GPS Service Worker — runtime caching strategy
// Uses cache-on-access instead of precaching (supports Vite hashed assets)
const CACHE = 'kevin-gps-v2';
const STATIC_CACHE = 'kevin-gps-static-v2';
const API_CACHE = 'kevin-gps-api-v2';
const MARKER_CACHE = 'kevin-gps-markers-v2';

// Assets that exist at known, unhashed paths
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/custom/login_bg.webp',
  '/custom/login_icon_logo.webp',
  '/custom/nav_icon_head.png',
  '/custom/nav_icon_head.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Non-critical — proceed if some fail
      })
    )
  );
  // Activate immediately — don't wait for old SW to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean old caches
  const expectedCaches = [CACHE, STATIC_CACHE, API_CACHE, MARKER_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !expectedCaches.includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
    .then(() => {
      // Enable navigation preload if supported (speeds up navigation requests)
      if (self.registration?.navigationPreload) {
        self.registration.navigationPreload.enable().catch(() => {});
      }
    })
  );
});

// Determine which cache to use based on request type
function getCacheName(url) {
  const { pathname } = url;
  if (pathname.startsWith('/api/')) return API_CACHE;
  if (pathname.startsWith('/markers/')) return MARKER_CACHE;
  if (/\.(js|css|svg|png|webp|jpg|jpeg|gif|woff2?|ttf|eot)$/i.test(pathname)) {
    return STATIC_CACHE;
  }
  return CACHE;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Same-origin only
  if (url.origin !== location.origin) return;

  // API: network-first, cache fallback (GET only)
  if (url.pathname.startsWith('/api/') && request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Non-GET: pass through
  if (request.method !== 'GET') return;

  // Navigation requests: use preloadResponse (if available), network-first with cache fallback.
  // Properly uses event.waitUntil() to prevent the "preloadResponse cancelled" warning.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // Consume preload response first (if available) to prevent cancellation error
        let preloadResponse;
        try {
          preloadResponse = await event.preloadResponse;
        } catch {
          /* preload not available */
        }
        if (preloadResponse) {
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(request, preloadResponse.clone()))
          );
          return preloadResponse;
        }

        // Fall back to network fetch
        try {
          const response = await fetch(request);
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(request, response.clone()))
          );
          return response;
        } catch {
          const fallback = await caches.match('/');
          return fallback || new Response(
            '<html><body><h1>Offline</h1><p>Please check your connection.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  // Static assets & markers: cache-first (runtime caching)
  // This naturally handles Vite's hashed filenames without precaching
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchAndCache = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            const cacheName = getCacheName(url);
            caches.open(cacheName).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      // Return cached response if available, otherwise fetch from network.
      // If both fail, return a 504 fallback to prevent "Failed to convert value to 'Response'".
      if (cached) return cached;
      return fetchAndCache.then((r) => r || new Response('', { status: 504 }));
    })
  );
});
