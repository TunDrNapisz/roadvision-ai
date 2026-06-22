const CACHE_NAME = 'roadvision-v1';
const ASSETS = [
  'main.html',
  'style.css',
  'script.js',
  'manifest.json' // Pastikan anda tambah ini
];

// 1. INSTALL: Simpan semua fail ke dalam cache
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Memaksa service worker baru untuk terus aktif
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 2. ACTIVATE: Bersihkan cache lama jika ada versi baru (v2, v3, dll)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// 3. FETCH: Strategi cache-first
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});