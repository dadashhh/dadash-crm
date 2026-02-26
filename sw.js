/* ═══════════════════════════════════════════════════════════════
   DADASH Service Worker — v2.2.1
   
   Strategy: Network-first, NEVER cache index.html
   Cache is versioned — old caches auto-deleted on activate
   skipWaiting + clients.claim = instant takeover
   ═══════════════════════════════════════════════════════════════ */

const SW_VERSION = 'v2.2.1-da6d381';
const CACHE_NAME = 'dadash-' + SW_VERSION;

/* List of paths that must NEVER be served from cache */
const NEVER_CACHE = ['/', '/index.html'];

console.log('[SW] Service Worker loading — version:', SW_VERSION, '— cache:', CACHE_NAME);

/* ─── INSTALL: skip waiting immediately ─── */
self.addEventListener('install', e => {
  console.log('[SW] Install event — version:', SW_VERSION);
  self.skipWaiting();
});

/* ─── ACTIVATE: nuke old caches + claim all clients ─── */
self.addEventListener('activate', e => {
  console.log('[SW] Activate event — version:', SW_VERSION);
  e.waitUntil(
    caches.keys().then(keys => {
      const oldKeys = keys.filter(k => k !== CACHE_NAME);
      if (oldKeys.length > 0) {
        console.log('[SW] Deleting old caches:', oldKeys);
      }
      return Promise.all(oldKeys.map(k => caches.delete(k)));
    })
    .then(() => {
      /* Also purge index.html from the CURRENT cache (safety net) */
      return caches.open(CACHE_NAME).then(cache =>
        Promise.all(NEVER_CACHE.map(path =>
          cache.delete(new Request(path)).catch(() => {})
        ))
      );
    })
    .then(() => {
      console.log('[SW] Claiming all clients');
      return self.clients.claim();
    })
    .then(() => {
      /* Notify all open tabs to refresh */
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
        });
      });
    })
  );
});

/* ─── FETCH: network-first, index.html NEVER from cache ─── */
self.addEventListener('fetch', e => {
  /* Only handle GET requests */
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  /* ── index.html and root: ALWAYS network, no cache write ── */
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => {
          console.warn('[SW] Network failed for', url.pathname, '— trying cache fallback');
          return caches.match(e.request);
        })
    );
    return;
  }

  /* ── sw.js itself: never cache ── */
  if (url.pathname.endsWith('/sw.js')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  /* ── API/Supabase calls: always network, never cache ── */
  if (url.hostname.includes('supabase') || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  /* ── Everything else: network-first with cache fallback ── */
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

/* ─── MESSAGE: handle force-update requests from app ─── */
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
});
