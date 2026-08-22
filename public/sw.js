const CACHE_NAME = 'vectos-v2';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
  '/offline.html'
];

// Install: cache the static shell only. Authenticated pages are NEVER cached
// (they may contain other users' business data on shared devices).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets could not be cached:', err);
      })
    ).then(() => self.skipWaiting())
  );
});

// Activate: purge old versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Static assets: cache-first (fast, offline-capable)
  const isStatic =
    url.origin === location.origin &&
    (url.pathname.startsWith('/icon') ||
      url.pathname === '/manifest.json' ||
      url.pathname === '/offline.html' ||
      url.pathname.startsWith('/css/') ||
      url.pathname.startsWith('/js/'));

  if (isStatic) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Everything else: network-first; when the network is gone and nothing is
  // cached, serve the branded offline page for document navigations.
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then((cached) => {
        if (cached) return cached;
        if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
          return caches.match('/offline.html');
        }
        return Response.error();
      })
    )
  );
});
