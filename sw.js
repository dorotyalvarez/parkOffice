/* ═══════════════════════════════════════
   ParkOffice — Service Worker (PWA)
   ═══════════════════════════════════════ */

const CACHE_NAME = 'parkoffice-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

// Instalar: guardar archivos en caché
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activar: limpiar cachés viejas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: caché primero para assets, red para Firebase/EmailJS
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Dejar pasar Firebase y EmailJS siempre a la red
  if (url.hostname.includes('firebase') || url.hostname.includes('emailjs') || url.hostname.includes('googleapis')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Para el resto: caché primero
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Guardar en caché si es un asset propio
        if (e.request.method === 'GET' && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
    }).catch(() => caches.match('/index.html'))
  );
});
