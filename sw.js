const CACHE = 'omnicalc-v10';
const ASSETS = ['./style.css', './app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // External API calls (BLS, OFF, ZXing CDN) always live
  if (new URL(e.request.url).hostname !== location.hostname) {
    e.respondWith(fetch(e.request));
    return;
  }
  const path = new URL(e.request.url).pathname;
  const isHTML = path === '/' || path.endsWith('/index.html') || path.endsWith('/');
  if (isHTML) {
    // Network-first for HTML: always fresh, fallback to cache when offline
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for CSS/JS assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }))
  );
});
