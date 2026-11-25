const CACHE_NAME = "skyhop-arcade-v1";
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/assets/icons/favicon.png",
  "/assets/icons/icon-192.png",
  "/assets/birds/classic-sparrow.png",
  "/assets/scenes/sunny-meadow-sky.png",
  "/assets/scenes/sunny-meadow-far.png",
  "/assets/scenes/sunny-meadow-mid.png",
  "/assets/scenes/sunny-meadow-ground.png",
  "/assets/scenes/sunny-meadow-obstacle.png",
  "/assets/audio/flap.wav",
  "/assets/audio/score.wav",
  "/assets/audio/hit.wav",
  "/assets/audio/die.wav",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API calls — competitive scores & economy require live backend verification
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok && (url.pathname.startsWith("/assets/") || url.origin === self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
