// service-worker.js

const CACHE_NAME = "my-plan-v1";

const urlsToCache = [
  "/",
  "/index.html",
  "/parser.js",
  "/logo.png",
  "/favicon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
