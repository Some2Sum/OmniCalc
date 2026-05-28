const CACHE = 'omnicalc-v1';
const SHELL = ['./', './index.html', './style.css', './app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
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
  // External API calls (BLS, OFF, ZXing CDN) immer live – niemals gecacht
  if (new URL(e.request.url).hostname !== location.hostname) {
    e.respondWith(fetch(e.request));
    return;
  }
  // App-Shell: cache-first, bei Miss netzwerk + in Cache legen
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }))
  );
});
