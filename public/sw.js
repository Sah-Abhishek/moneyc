/* Money Control service worker.
 *
 * Deliberately narrow. Pages in the book are private, per-user and change with
 * every entry, so HTML, RSC payloads, server actions and API/auth routes are
 * never cached here — they always go to the network. Nothing about a user's
 * money is stored on the device by this worker, so signing out leaves nothing
 * behind.
 *
 * What it does cache:
 *   - /offline.html, shown when a page navigation fails for lack of network;
 *   - content-hashed build assets under /_next/static (immutable, cache-first);
 *   - the app's own icons (stale-while-revalidate, since their names are not hashed).
 *
 * Bump VERSION when this file's caching rules change; activation drops every
 * cache from other versions.
 */

const VERSION = "v1";
const SHELL_CACHE = `mc-shell-${VERSION}`;
const ASSET_CACHE = `mc-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const SHELL = [OFFLINE_URL, "/pwa/icon-192.png"];
// Hashed assets pile up across deploys; keep the newest few hundred.
const ASSET_LIMIT = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("mc-") && !keep.has(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/pwa/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
  // Everything else falls through to the browser untouched.
});

// Network only. The offline page stands in only when the request never reached
// the server; an HTTP error (404, 500, a redirect to sign-in) is passed through as-is.
async function navigate(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    return offline ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") return cache.put(request, response.clone()).then(() => response);
      return response;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) ?? Response.error();
}

// Cache keys come back in insertion order, so the oldest go first.
async function trim(cache) {
  const keys = await cache.keys();
  const excess = keys.length - ASSET_LIMIT;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}
