// Caches the app "shell" so it opens fast / offline.
// Map tiles are served from the offline-tiles cache when available (downloaded
// on demand from the Map screen), otherwise they go straight to the network.
const CACHE = "senderos-shell-v3";
const OFFLINE_TILES_CACHE = "senderos-offline-tiles";
const SHELL = [
  "./", "./index.html", "./app.js", "./geo.js", "./manifest.json", "./icon-192.png", "./icon-512.png",
  "./vendor/leaflet/leaflet.css", "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/images/marker-icon.png", "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png", "./vendor/leaflet/images/layers.png", "./vendor/leaflet/images/layers-2x.png",
  "./vendor/pmtiles/pmtiles.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== OFFLINE_TILES_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // App shell: cache-first, same origin only.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
    return;
  }

  // OSM map tiles: serve from the offline-tiles cache when we have them
  // (downloaded on purpose from the Map screen), otherwise hit the network.
  if (url.hostname === "tile.openstreetmap.org") {
    e.respondWith(
      caches.open(OFFLINE_TILES_CACHE).then((cache) =>
        cache.match(e.request).then((cached) => cached || fetch(e.request))
      )
    );
  }
});
