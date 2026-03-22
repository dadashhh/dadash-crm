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

  // Navigation / index.html : network-first avec fallback sûr
  if (isNeverCache) {
    e.respondWith(
      fetch(e.request)
        .catch(() => caches.match(e.request))
        .then(resp => {
          if (resp) return resp;
          // Fallback ultime : si RIEN ne fonctionne, retourner une page d'erreur
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DADASH</title></head><body style="background:#0F0F0F;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h2>Connexion perdue</h2><p>Vérifie ta connexion internet puis rafraîchis.</p><button onclick="location.reload()" style="margin-top:16px;padding:12px 24px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer">Rafraîchir</button></div></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // Cross-origin : laisser le navigateur gérer
  if (url.origin !== self.location.origin) {
    return;
  }

  // Same-origin GET : cache-first avec stale-while-revalidate
  if (e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 408 }));
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
