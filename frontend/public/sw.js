/* ============================================================
   NoLimits AI – Service Worker  (PWA / Offline Support)
   ============================================================ */

const CACHE_VERSION = 'v2';
const CACHE_NAME    = `nolimits-ai-${CACHE_VERSION}`;

// App-shell assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Install: pre-cache shell ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting(); // Activate immediately
});

// ── Activate: clean up old caches ────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim(); // Take control of all open tabs
});

// ── Fetch: Network-first, fall back to cache ─────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests from our own origin
  if (
    request.method !== 'GET' ||
    !request.url.startsWith(self.location.origin)
  ) {
    return;
  }

  // Skip API calls — always go to network
  if (request.url.includes('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Cache a clone of every successful navigation/asset response
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() =>
        // Network failed → serve from cache; fall back to index.html for navigation
        caches.match(request).then(
          (cachedResponse) =>
            cachedResponse ||
            (request.mode === 'navigate'
              ? caches.match('/index.html')
              : new Response('Offline', { status: 503 }))
        )
      )
  );
});
