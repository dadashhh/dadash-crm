/* dadash-telegram-autofill — Network-first SW, never stale index.html */
const CACHE_NAME = 'dadash-v3';
const NEVER_CACHE = ['index.html', '/'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isNav = e.request.mode === 'navigate';
  const isNeverCache = isNav || NEVER_CACHE.some(p => url.pathname === p || url.pathname.endsWith(p));

  if (isNeverCache) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Ne jamais intercepter les requêtes cross-origin (Supabase, Carlos, CDNs, APIs)
  // — les laisser passer directement au navigateur sans cache ni gestion SW
  if (url.origin !== self.location.origin) {
    return;
  }

  // Same-origin uniquement : cache-first avec fallback réseau
  if (e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'PURGE_ALL') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
