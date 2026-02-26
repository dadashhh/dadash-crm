/* DADASH SW — Network-first with proper cache invalidation
   Cache name includes version to force invalidation on deploy */
const CACHE_NAME = 'dadash-v2.2';

self.addEventListener('install', e => {
  /* Skip waiting immediately — don't serve stale content */
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  /* Clean ALL old caches on activation (any cache not matching current name) */
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  /* Skip non-GET requests */
  if (e.request.method !== 'GET') return;

  /* Never cache index.html — always fetch fresh */
  const url = new URL(e.request.url);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  /* Network-first for everything else: try network, fallback to cache */
  e.respondWith(
    fetch(e.request)
      .then(response => {
        /* Cache successful responses for offline use */
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
