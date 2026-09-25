// Bump this string whenever you edit index.html and re-deploy, so browsers
// pick up the new version instead of serving a stale cached copy.
const CACHE_NAME = 'storage-sites-v86';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './firebase-config.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // cache:'reload' skips the browser's HTTP cache — otherwise a fresh
    // CACHE_NAME could be filled with the previous, still-cached index.html
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Cache-first for our own files: works fully offline once installed.
// Cross-origin requests (Firebase, the Firebase SDK from gstatic.com, etc.)
// are left alone entirely — they need a live network round-trip to sync,
// caching them would only get in the way.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

// Push notification from the notifyNewPickup Cloud Function (functions/index.js):
// a new customer pickup request. Also sets the red count on the app icon.
self.addEventListener('push', (event) => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(e){}
  const tasks = [
    self.registration.showNotification(data.title || 'Nieuwe ophaalafspraak', {
      body: data.body || '',
      icon: './icon-192.png',
      tag: data.tag,
      data: { url: './#agenda' },
    }),
  ];
  if(typeof data.badge === 'number' && self.navigator.setAppBadge){
    tasks.push(self.navigator.setAppBadge(data.badge).catch(() => {}));
  }
  event.waitUntil(Promise.all(tasks));
});

// Tapping the notification opens the app on the Agenda tab.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins[0];
      if(win){
        win.postMessage('open-agenda');
        return win.focus();
      }
      return self.clients.openWindow(event.notification.data?.url || './');
    })
  );
});
