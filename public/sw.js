// Kevin GPS  Service Worker — offline-capable app shell caching
const CACHE = 'Kevin GPS -v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/custom/login_bg.webp',
  '/custom/login_icon_logo.webp',
  '/custom/nav_icon_head.png',
  '/markers/car-top.svg',
  '/markers/parking.svg',
  '/markers/start.svg',
  '/markers/end.svg',
  '/markers/moving_car.svg',
  '/markers/idle_car.svg',
  '/markers/parking_car.svg',
  '/markers/offline_car.svg',
  '/markers/maintenance_car.svg',
  '/markers/speeding_car.svg',
  '/markers/moving_truck.svg',
  '/markers/moving_bus.svg',
  '/markers/moving_van.svg',
  '/markers/moving_motocycle.svg',
  '/markers/moving_default.svg',
  '/markers/idle_truck.svg',
  '/markers/idle_default.svg',
  '/markers/parking_truck.svg',
  '/markers/parking_default.svg',
  '/markers/offline_default.svg',
  '/markers/maintenance_default.svg',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-critical — proceed even if some assets fail
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests — network first, fallback to cache (GET only)
  if (url.pathname.startsWith('/api/') && request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets — cache first (GET only)
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
