// Exomusica service worker. It does nothing until someone pins an album for offline ("exo-armed" exists).
// - pinned audio / covers (/uploads, /api/audio-proxy) are served from the cache, with Range support so seeking works;
// - /api/albums/:slug and /api/tracks/:id/provenance are network-first, falling back to the pinned copy;
// - the app shell (index.html + hashed /assets) is kept so a pinned album opens with no connection.
const PINNED = "exo-offline-v1";
const SHELL = "exo-shell-v1";
const ARMED = "exo-armed";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function armed() { return caches.has(ARMED); }

async function rangeResponse(req, res) {
  const range = req.headers.get("range");
  if (!range || res.status !== 200) return res;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return res;
  const blob = await res.blob();
  const size = blob.size;
  let start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  let end = m[1] === "" || m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const part = blob.slice(start, end + 1);
  return new Response(part, { status: 206, headers: { "Content-Type": res.headers.get("Content-Type") || blob.type || "audio/mpeg", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(part.size), "Accept-Ranges": "bytes" } });
}

async function pinnedFirst(req) {
  if (await armed()) {
    const hit = await (await caches.open(PINNED)).match(req.url, { ignoreSearch: false, ignoreVary: true });
    if (hit) return rangeResponse(req, hit);
  }
  return fetch(req);
}

async function networkThenPinned(req) {
  try { return await fetch(req); }
  catch (err) {
    const hit = await (await caches.open(PINNED)).match(req.url, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

async function shellAsset(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && (await armed())) {
    cache.put(req, res.clone());
    const keys = await cache.keys();
    if (keys.length > 160) for (const k of keys.slice(0, 40)) cache.delete(k); // old deploys' files age out
  }
  return res;
}

async function navigation(req) {
  try {
    const res = await fetch(req);
    if (res.ok && (await armed())) (await caches.open(SHELL)).put("/index.html", res.clone());
    return res;
  } catch (err) {
    const hit = await (await caches.open(SHELL)).match("/index.html");
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (req.mode === "navigate") { event.respondWith(navigation(req)); return; }
  if (p.startsWith("/uploads/") || p.startsWith("/api/audio-proxy/")) { event.respondWith(pinnedFirst(req)); return; }
  if (/^\/api\/albums\/[^/]+$/.test(p) || /^\/api\/tracks\/\d+\/provenance$/.test(p)) { event.respondWith(networkThenPinned(req)); return; }
  if (p.startsWith("/assets/")) { event.respondWith(shellAsset(req)); return; }
});
