// ---------------------------------------------------------------------------
// VIGÍA ML · service worker (offline-first)
// Estrategia:
//  · Precarga el shell (raíz) al instalarse → la consola abre sin red.
//  · Navegaciones: network-first con fallback a caché (y a la raíz).
//  · Assets same-origin (JS/CSS hashed, manifest, iconos): stale-while-
//    revalidate → respuesta instantánea + refresco en segundo plano.
//  · Google Fonts (stylesheets y ficheros): cache-first (son inmutables
//    por URL; incluye cross-origin opaque con cuidado).
//  · Nunca intercepta POST ni peticiones de workflows de GitHub.
// ---------------------------------------------------------------------------
const VERSION = "vigia-ml-v0.12.2";
const SHELL = [
  "./",
  "./index.html",
  "./app.html",
  "./manifest.webmanifest",
  "./icon-192.svg",
  "./icon-512.svg",
  "./legal/privacidad.html",
  "./legal/terminos.html",
  "./legal/marca.html",
  "./legal/legal.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isFontAsset = (url) =>
  url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // --- navegación (HTML): red primero, caché como red de seguridad ---
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((hit) => hit || caches.match("./app.html") || caches.match("./index.html") || caches.match("./") || Response.error()),
        ),
    );
    return;
  }

  // --- fuentes externas: cache-first (URLs inmutables) ---
  if (isFontAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok || res.type === "opaque") {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // --- assets same-origin: stale-while-revalidate ---
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => hit || Response.error());
        return hit || refresh;
      }),
    );
  }
});
