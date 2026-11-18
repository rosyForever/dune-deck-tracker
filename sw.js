const CACHE = "uprising-tracker-v4";
const files = [
  "./index.html", "./style.css", "./deck.css", "./deck.js", "./library.js", "./app.js", "./core.js", "./cards.js",
  "./icon.png", "./manifest.webmanifest",
].map(path => new URL(path, self.registration.scope).href);
const entry = files[0];
const trackerPaths = new Set([
  new URL(entry).pathname,
  new URL(self.registration.scope).pathname,
]);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(files)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("uprising-tracker-") && key !== CACHE)
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate" && url.origin === self.location.origin && trackerPaths.has(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(entry)).then(response => response || fetch(request)));
  } else if (files.includes(request.url)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request)).then(response => response || fetch(request)));
  }
});
