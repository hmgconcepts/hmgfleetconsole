// HMG Fleet Console — offline service worker.
// Cache-first for the app shell so the console opens instantly and works
// offline (monitoring calls obviously need the network; the UI never does).
// Bump CACHE on every release.
const CACHE = 'hmg-fleet-v1.0-20260914-1';
const CORE = [
  './', './index.html', './projects.html', './incidents.html', './reports.html',
  './board.html', './tools.html', './guide.html', './deploy.html', './settings.html',
  './assets/css/fleet.css',
  './assets/js/store.js', './assets/js/shell.js', './assets/js/fleet.js',
  './assets/img/logo.svg', './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE).catch(err => console.warn('[SW] precache failed', err.message)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // NEVER intercept monitoring traffic (Supabase/API calls must always be live).
  if(url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit ||
      fetch(e.request).then(resp => {
        if(resp.ok){
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
