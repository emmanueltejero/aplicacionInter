// Cache only the public connection notice. Club data and auth requests use the network.
const CACHE_PREFIX = '__CACHE_PREFIX__';
const CACHE_NAME = '__CACHE_NAME__';
const APP_PATH = '__APP_PATH__';
const OFFLINE_PATH = '__OFFLINE_PATH__';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(new Request(OFFLINE_PATH, { cache: 'reload', credentials: 'omit' }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin
    || ![APP_PATH, `${APP_PATH}index.html`].includes(url.pathname)) return;
  event.respondWith((async () => {
    try { return await fetch(request, { cache: 'no-store' }); }
    catch {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_PATH)) ?? Response.error();
    }
  })());
});
