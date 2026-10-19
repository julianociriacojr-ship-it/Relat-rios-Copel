const CACHE_NAME = 'solarminas-relatorios-v9';
const ASSETS = [
  './', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  // Módulo Inspeção SAS (PEE Copel): tudo local para funcionar em modo avião
  './inspecao-sas.html',
  './inspecao-sas/style.css',
  './inspecao-sas/config.js',
  './inspecao-sas/observations.js',
  './inspecao-sas/memorial-config.js',
  './inspecao-sas/geo.js',
  './inspecao-sas/backup.js',
  './inspecao-sas/report-memorial.js',
  './inspecao-sas/db.js',
  './inspecao-sas/images.js',
  './inspecao-sas/report-docx.js',
  './inspecao-sas/report-pdf.js',
  './inspecao-sas/app.js',
  './inspecao-sas/logo-solarminas.png',
  './inspecao-sas/logo-solarminas.jpg',
  './inspecao-sas/cartao-contato.png',
  './inspecao-sas/memorial/logo-vertical.png',
  './inspecao-sas/memorial/mapa-poe.jpg',
  './inspecao-sas/memorial/vista-isometrica.jpg',
  './inspecao-sas/memorial/vista-frontal.jpg',
  './inspecao-sas/memorial/vista-lateral.jpg',
  './vendor/docx.min.js',
  './vendor/docx-layout.min.js',
  './vendor/jspdf.umd.min.js',
  './vendor/jszip.min.js'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' evita gravar cópias antigas do cache HTTP do navegador
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then((cached) => {
      const networkFetch = fetch(e.request)
        .then((resp) => {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, respClone));
          return resp;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
