// Piano MIDI Pro service worker — minimal offline shell
// Versioned cache name; bumping forces clients to upgrade
const VERSION = "v10";
const APP_CACHE = `pmp-app-${VERSION}`;
const SAMPLE_CACHE = `pmp-samples-${VERSION}`;
const OWNED_CACHE_PREFIX = "pmp-";
const SHELL_URLS = new Set(["/", "/index.html", "/favicon.svg", "/manifest.webmanifest"]);
const SHELL_ASSET = /^\/assets\/[^/]+\.(?:js|css|woff2?|svg|png|webp|ico)$/i;
const CORE_AUDIO = /^\/audio\/(?:salamander|virtuosity|freepats-handclap|tr808-fischer)\/core\/(?:LICENSE(?:\.txt)?|[^/]+\.(?:ogg|wav|json|md|txt))$/i;
const LOCAL_OGG = /^\/audio\/(?:salamander\/(?:core|anchors)|virtuosity\/core|freepats-handclap\/core)\/[^/]+\.ogg$/i;
const LOCAL_AAC = /^\/audio\/(?:salamander|virtuosity|freepats-handclap)\/core-aac\/(?:[^/]+\.m4a|manifest\.json|ATTRIBUTION\.md)$/i;
const LOCAL_WAV = /^\/audio\/tr808-fischer\/core\/[A-Z0-9]+\.WAV$/i;

// Pinned Virtuosity core; the decoder still validates every file against manifest SHA-256.
const DRUM_CORE_URLS = [
  ...[1, 2, 3, 4].flatMap((layer) => [1, 2].map((round) =>
    `kickmic_kick_snoff_vl${layer}_rr${round}.ogg`)),
  ...[1, 6, 11, 16, 21, 26, 31, 36].map((layer) => `snaremic_snare_center_vl${layer}.ogg`),
  ...["closed", "open"].flatMap((position) => [1, 2, 3, 4].flatMap((layer) =>
    [1, 2].map((round) => `oh_hh_${position}_vl${layer}_rr${round}.ogg`))),
  ...[1, 2, 3].flatMap((layer) => [1, 2].map((round) =>
    `Cowbell1_Normal_v${layer}_rr${round}_Close.ogg`)),
].map((file) => `/audio/virtuosity/core/${file}`);
const CLAP_CORE_URLS = ["01_02", "01_03", "01_05", "01_06", "01_07", "01_08", "01_09", "02_02", "02_05"]
  .map((file) => `/audio/freepats-handclap/core/${file}.ogg`);
const TR808_CORE_URLS = ["BD5050", "SD5050", "CP", "CH", "OH50", "CB", "RS", "CL", "MA",
  "LT50", "MT50", "HT50", "LC50", "MC50", "HC50", "CY5050", "BD5010"]
  .map((file) => `/audio/tr808-fischer/core/${file}.WAV`);

// Always cache these on install
const PRECACHE_URLS = [
  "/", "/index.html", "/favicon.svg", "/manifest.webmanifest",
  "/audio/salamander/core/C3.ogg", "/audio/salamander/core/Fs3.ogg",
  "/audio/salamander/core/C4.ogg", "/audio/salamander/core/Fs4.ogg",
  "/audio/salamander/core/C5.ogg", "/audio/salamander/core/Fs5.ogg",
  "/audio/salamander/core/C6.ogg",
  "/audio/salamander/core/ATTRIBUTION.md",
  "/audio/salamander/core/manifest.json",
  "/audio/virtuosity/core/manifest.json", "/audio/virtuosity/core/LICENSE",
  "/audio/freepats-handclap/core/manifest.json", "/audio/freepats-handclap/core/LICENSE.txt",
  "/audio/freepats-handclap/core/README-source.txt",
  "/audio/tr808-fischer/core/manifest.json", "/audio/tr808-fischer/core/LICENSE",
  "/audio/tr808-fischer/core/README-source.md",
  ...DRUM_CORE_URLS,
  ...CLAP_CORE_URLS,
  ...TR808_CORE_URLS,
];

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
      const valid = new Set([APP_CACHE, SAMPLE_CACHE]);
      await Promise.all(keys.filter((k) => k.startsWith(OWNED_CACHE_PREFIX) && !valid.has(k))
        .map((k) => caches.delete(k)));
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

  // Local samples are immutable for this app version. Serve a cached core or
  // previously used anchor immediately, without waiting for network state.
  if (url.origin === self.location.origin &&
      (LOCAL_OGG.test(url.pathname) || LOCAL_AAC.test(url.pathname) || LOCAL_WAV.test(url.pathname))) {
    event.respondWith(cacheFirst(APP_CACHE, req));
    return;
  }

  // Only the app shell and live piano assets belong in this cache. Requests
  // for retired paths and unrelated same-origin apps pass straight through.
  if (url.origin === self.location.origin && (
    (req.mode === "navigate" && SHELL_URLS.has(url.pathname)) ||
    (req.mode !== "navigate" && (
      SHELL_URLS.has(url.pathname) || SHELL_ASSET.test(url.pathname) || CORE_AUDIO.test(url.pathname)
    ))
  )) {
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

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200) {
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Offline shell fallback for SPA navigations
    if (request.mode === "navigate") {
      const fallback = await cache.match("/");
      if (fallback) return fallback;
    }
    throw new Error("Network unavailable and no cache");
  }
}
