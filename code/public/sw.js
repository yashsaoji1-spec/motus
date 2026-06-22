const CACHE = 'motus-v2';
const APP_SHELL = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Drop old caches (e.g. motus-v1) so stale app-shell + headers don't linger.
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // CRITICAL: only handle same-origin requests. Everything cross-origin — Firebase,
  // Cloud Functions, Cloudinary, fonts, Sentry, analytics, reCAPTCHA — must go
  // straight to the network. A fetch issued from inside the SW runs under the SW's
  // own CSP, so intercepting cross-origin requests here would (and did) break them.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Same-origin: network-first, fall back to cache, never resolve to undefined.
  e.respondWith(
    fetch(req).catch(() => caches.match(req).then((r) => r || Response.error()))
  );
});
