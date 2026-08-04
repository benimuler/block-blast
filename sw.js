const CACHE = 'blockblast-v3.14';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Never cache API or socket.io
  if (url.includes('/api/') || url.includes('socket.io')) return;

  // Network-first for HTML/JS/CSS — always get latest on phone
  if (url.includes('.js') || url.includes('.html') || url.includes('.css') || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(res => res).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for CSS/images only
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
    )
  );
});
