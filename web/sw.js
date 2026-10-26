// PS DOWNLOAD - Service Worker for Mobile Web App
const CACHE_NAME = 'ps-mobile-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Let browser network handle all dynamic API requests and mobile JS directly
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('/img?') ||
    event.request.url.includes('/stream') ||
    event.request.url.includes('/js/mobile.js')
  ) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
