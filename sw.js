const CACHE = "peripath-v2";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest"
];

// Install: cache core
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE))
  );
  self.skipWaiting();
});

// Activate: clean old
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: stale-while-revalidate for core; network-first for other GET
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCore = isSameOrigin && CORE.some(p => url.pathname.endsWith(p.replace("./","")));

  if (isCore) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then(resp => {
        cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      return cached || (await fetchPromise) || new Response("Offline", { status: 503 });
    })());
    return;
  }

  // For any other same-origin GET, try network then cache fallback
  if (isSameOrigin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const resp = await fetch(req);
        cache.put(req, resp.clone());
        return resp;
      } catch {
        const cached = await cache.match(req);
        return cached || new Response("Offline", { status: 503 });
      }
    })());
  }
});
