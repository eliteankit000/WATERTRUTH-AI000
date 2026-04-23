/* WaterTruth AI — Service Worker (kill switch)
   Previous versions cached the app shell, which broke mobile users
   after every redeploy because the cached HTML referenced old hashed
   JS/CSS bundles that no longer exist (→ blank page).

   This version unregisters itself, clears all caches it owns, and
   forces every open client to reload to pick up fresh assets.
*/

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* ignore */ }

    try {
      await self.registration.unregister();
    } catch (e) { /* ignore */ }

    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch (e) { /* ignore */ }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  // Always go to the network — never serve stale cached responses.
  event.respondWith(fetch(event.request));
});
