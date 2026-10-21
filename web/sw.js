// PS DOWNLOAD - Service Worker for Mobile Web App
const CACHE_NAME = 'ps-mobile-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let browser network handle all dynamic API requests directly
  if (event.request.url.includes('/api/') || event.request.url.includes('/img?') || event.request.url.includes('/stream')) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
