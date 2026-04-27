/**
 * VELUM Laser — Service Worker
 * Estrategia:
 *   - App shell (HTML, JS, CSS, fonts): Cache-first con revalidación en background
 *   - API (/api/): Network-only (nunca cachear datos del servidor)
 *   - Google Fonts: Cache-first (inmutables)
 */

const CACHE_NAME = "velum-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
];

// ── Install: pre-cachea el shell ────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: limpia caches antiguas ───────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API: siempre network-only
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return; // deja que el browser maneje la request normalmente
  }

  // Google Fonts y otros CDNs externos: cache-first
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Assets estáticos (JS, CSS, imágenes): cache-first con network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        }).catch(() => cached);

        // Retorna caché inmediatamente mientras revalida en background (stale-while-revalidate)
        return cached || networkFetch;
      })
    );
    return;
  }
});
