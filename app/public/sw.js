// Piano MIDI Pro service worker — minimal offline shell
// Versioned cache name; bumping forces clients to upgrade
const VERSION = "v2";
const APP_CACHE = `pmp-app-${VERSION}`;
const SAMPLE_CACHE = `pmp-samples-${VERSION}`;
const DEMO_CACHE = `pmp-demos-${VERSION}`;

// Always cache these on install
const PRECACHE_URLS = ["/", "/index.html", "/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const valid = new Set([APP_CACHE, SAMPLE_CACHE, DEMO_CACHE]);
      await Promise.all(keys.filter((k) => !valid.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Salamander samples — cache-first, long-lived
  if (url.hostname === "tonejs.github.io" && url.pathname.includes("/audio/salamander/")) {
    event.respondWith(staleWhileRevalidate(SAMPLE_CACHE, req));
    return;
  }

  // Demo MIDI files served from public/demo (.kar = karaoke MIDI, same format)
  if (url.origin === self.location.origin && url.pathname.startsWith("/demo/") && /\.(mid|kar)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(DEMO_CACHE, req));
    return;
  }

  // App shell + JS/CSS chunks — network-first with cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(APP_CACHE, req));
    return;
  }
});

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirst(cacheName, request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Offline shell fallback for SPA navigations
    if (request.mode === "navigate") {
      const fallback = await caches.match("/");
      if (fallback) return fallback;
    }
    throw new Error("Network unavailable and no cache");
  }
}
