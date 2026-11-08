// PharmaStock - Service Worker (offline-first)
// Incrementer CACHE_VERSION a chaque livraison pour declencher la mise a jour.
const CACHE_VERSION = 'v29';
const CACHE_NAME = 'pharmastock-' + CACHE_VERSION + '-offline';

// Fichiers indispensables : si l'un d'eux echoue, l'installation echoue (pas de demi-installation).
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './auth-config.js',
  './icon-192x192.png',
  './icon-512x512.png'
];
// Fichiers complementaires : mis en cache au mieux (un echec n'empeche pas l'installation).
const OPTIONAL = [
  './server-inventory.js',
  './gs1.js',
  './stock.js',
  './fefo.js',
  './expiry.js',
  './dispensation.js',
  './dashboard.js',
  './xlsx.full.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    await Promise.allSettled(OPTIONAL.map(u => cache.add(new Request(u, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(n => (n.startsWith('pharma') ) && n !== CACHE_NAME)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Le client demande l'activation de la nouvelle version apres confirmation de l'utilisateur.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Les appels reseau (API serveur local, Google Apps Script...) ne passent jamais par le cache.
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: true });

    // Mise a jour silencieuse en arriere-plan (stale-while-revalidate)
    const refresh = fetch(req).then(resp => {
      if (resp && resp.status === 200 && resp.type === 'basic') cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }
    const resp = await refresh;
    if (resp) return resp;

    // Hors ligne et rien en cache : une navigation retombe sur l'application
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html', { ignoreSearch: true });
      if (shell) return shell;
    }
    return new Response('', { status: 504, statusText: 'Hors ligne' });
  })());
});
