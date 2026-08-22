// VectOS Service Worker — safe-by-default strategy:
// 1. Only GET requests are handled; POSTs (orders, logins) go straight to network.
//    Offline order queuing is done by the page itself (localStorage + client_ref).
// 2. Pages are NETWORK-FIRST: online visitors always get fresh HTML and CSS.
//    A cached page is served ONLY when the network genuinely fails, so nobody
//    ever sees a stale page while online (the bug that broke logins before).
// 3. Cross-origin assets (Tailwind CDN, fonts, lucide) are never cached, so
//    styling always comes straight from the source while online.
const VERSION = 'v4';
const PAGE_CACHE = `vectos-pages-${VERSION}`;
const ASSET_CACHE = `vectos-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== PAGE_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // CDNs: never cached

  // Page navigations: try network first, fall back to cache/offline page
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const offlinePage = await caches.match(OFFLINE_URL);
          return offlinePage || new Response('You are offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        })
    );
    return;
  }

  // Same-origin static assets: cache-first with background refresh.
  if (/\.(css|js|png|jpg|jpeg|svg|ico|woff2?|ttf)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
