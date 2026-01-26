const CACHE_NAME = 'learnhub-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app/css/app.css',
  './app/js/app-config.js',
  './app/js/api.js',
  './app/js/auth.js',
  './app/js/layout.js',
  './app/js/pwa.js',
  './assets/img/brand/logo.png',
  './assets/img/brand/logo-light.png',
  './assets/img/icons/icon-192.png',
  './assets/img/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for same-origin navigations; cache-first for static assets.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Don't interfere with cross-origin requests (e.g., script.google.com JSONP)
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network-first
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      return res;
    }))
  );
});