// Sudoku Master service worker — offline support only.
// It precaches the game's own files and serves them from the cache. It never
// touches cross-origin requests (the game makes none) and stores no user data.

const CACHE = 'sudoku-master-__VERSION__';
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // bypass the HTTP cache so a new version never mixes in stale files
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sudoku-master-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // ignoreVary: hosts often send "Vary: Origin", and the page loads its
  // bundles with crossorigin (adding an Origin header), which would otherwise
  // miss the precache and fail offline. Every cached file is a static asset.
  const opts = { ignoreSearch: true, ignoreVary: true };
  if (req.mode === 'navigate') {
    const index = new URL('index.html', self.registration.scope).href;
    event.respondWith(caches.match(index, opts).then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, opts).then((hit) => hit || fetch(req)));
});
