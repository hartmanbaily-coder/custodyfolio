const CACHE_NAME = "custody_folio_shell_v5";
const PUBLIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/app-icons/icon-192.png",
  "/app-icons/icon-512.png",
  "/app-icons/apple-touch-icon.png",
  "/app-icons/favicon-32.png"
];

const PRIVATE_PREFIXES = [
  "/api/",
  "/records",
  "/attorney",
  "/auth",
  "/dashboard",
  "/work",
  "/client-portal",
  "/documents",
  "/reports",
  "/settings"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PUBLIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  const cacheable =
    url.pathname === "/" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/app-icons/") ||
    url.pathname.startsWith("/_next/static/");

  if (!cacheable) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetched;
    })
  );
});
