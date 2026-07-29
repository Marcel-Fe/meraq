/*
  Service Worker für MERAQ FINANCE.

  Bewusst schlank gehalten statt next-pwa einzusetzen: das Paket arbeitet mit
  dem App Router unzuverlässig, und ein falsch konfigurierter Cache ist bei
  einer Finanz-App das größere Risiko als kein Cache.

  Strategie:
  - Seitenaufrufe: zuerst Netzwerk, bei Ausfall die zuletzt gecachte Fassung.
    So werden nie veraltete Stände angezeigt, solange Verbindung besteht.
  - Statische Dateien: zuerst Cache, im Hintergrund aktualisiert.

  Die Finanzdaten selbst liegen in localStorage und sind vom Cache unberührt.
*/

const VERSION = "meraq-v1";
const RUNTIME_CACHE = `${VERSION}-runtime`;
// Der Scope enthält bereits den Basispfad — die App läuft auf GitHub Pages
// in einem Unterordner, harte "/"-Pfade würden dort ins Leere zeigen.
const OFFLINE_URL = new URL("./", self.registration.scope).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached ?? caches.match(OFFLINE_URL);
        }),
    );
    return;
  }

  const isStatic =
    url.pathname.includes("/_next/static/") ||
    url.pathname.includes("/icons/") ||
    /\.(?:css|js|woff2?|png|svg|jpe?g|webp)$/.test(url.pathname);

  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached ?? network;
    }),
  );
});
