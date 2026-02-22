/* CHRISTINE FIX — Network-first SW with proper cache invalidation */
const CACHE_NAME = 'dadash-v2';

self.addEventListener('install', e => {
  /* Skip waiting immediately — don't serve stale content */
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  /* Clean ALL old caches on activation */
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  /* Network-first: always try network, only use cache as offline fallback */
  e.respondWith(
    fetch(e.request)
      .then(response => {
        /* Cache successful responses for offline use */
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
