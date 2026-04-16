const CACHE = 'motus-v1';
const APP_SHELL = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_SHELL))
  );
  // Take control immediately — don't wait for old SW to expire
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  // Network-first: Firestore, Cloudinary, and dynamic content must always be fresh
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
