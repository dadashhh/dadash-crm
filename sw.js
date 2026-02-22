const CACHE_NAME = 'dadash-v1';
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/components/AdminTab.jsx',
  '/components/ComptaTab.jsx',
  '/components/DashboardTab.jsx',
  '/components/InvoicesTab.jsx',
  '/components/ModelesTab.jsx',
  '/components/PayesTab.jsx',
  '/components/PrestatairesTab.jsx',
  '/components/SpendersTab.jsx',
  '/components/TelegramTab.jsx',
  '/components/TransactionsTab.jsx',
  '/components/VideosTab.jsx',
  '/components/WhatsAppAnalyzerTab.jsx'
];

// Install — cache critical assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CRITICAL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (e) => {
  // Skip non-GET and cross-origin API calls
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Don't cache Supabase or external API calls
  if (url.hostname !== self.location.hostname) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
