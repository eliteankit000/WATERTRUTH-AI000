/* WaterTruth AI — Service Worker
   Relies on the browser cache + network only.
   Does NOT hardcode hashed filenames — those change on every build.
*/

const CACHE_NAME = 'watertruth-v2';

// Only cache the shell — NOT the hashed JS/CSS bundles
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // For navigation requests serve the app shell from cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/').then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // For everything else: network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
