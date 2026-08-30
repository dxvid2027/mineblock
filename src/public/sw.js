// Offline support for MineBlock. The game is entirely client-side — the world
// is generated from a seed and saves live in localStorage — so once the
// bundle is cached the whole game runs with no network at all, which is what
// makes "Add to Home Screen" on an iPad behave like a real app.
//
// CACHE_VERSION must change whenever the deployed bundle changes; the build
// step rewrites it (see tools/stamp-sw.mjs) so this cannot be forgotten.
const CACHE_VERSION = '__BUILD_ID__';
const CACHE = `mineblock-${CACHE_VERSION}`;

// The exact built filenames, injected by tools/stamp-sw.mjs. These must be
// pre-cached at install: the worker only takes control after the page has
// already fetched its bundle, so relying on the fetch handler alone would
// leave a first-time visitor with nothing cached and no offline play.
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE)
      // Individually, so one missing file cannot fail the whole install.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Navigations go to the network first so a new deploy is picked up
  // immediately, falling back to the cache when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Fingerprinted assets never change under a given URL: cache first.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    }))
  );
});
