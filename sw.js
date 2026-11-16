const CACHE = "uprising-tracker-v3";
const files = [
  "./index.html", "./style.css", "./deck.css", "./deck.js", "./library.js", "./app.js", "./core.js", "./cards.js",
  "./icon.png", "./manifest.webmanifest",
].map(path => new URL(path, self.registration.scope).href);
const entry = files[0];

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
  if (request.mode === "navigate" && new URL(request.url).origin === self.location.origin) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(entry)).then(response => response || fetch(request)));
  } else if (files.includes(request.url)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request)).then(response => response || fetch(request)));
  }
});
