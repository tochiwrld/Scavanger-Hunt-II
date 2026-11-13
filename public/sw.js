// PrimaHunt service worker: shows push alerts (game updates and new stars), opens the right page when tapped,
// and shows a branded "No network, hunter." page when a page can't load offline.
// It caches only that one offline page; everything else always comes fresh from the network.
const OFFLINE = "/offline.html";
const CACHE = "ph-offline-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(OFFLINE, { cache: "reload" }))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // only whole pages; API calls, photos and scripts go straight to the network
  e.respondWith((async () => {
    try {
      return (await e.preloadResponse) || (await fetch(e.request));
    } catch {
      return (await caches.match(OFFLINE)) || new Response("No network, hunter. Reconnect to keep hunting.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const title = d.title || "PrimaHunt";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); try { await w.navigate(url); } catch {} return; }
    }
    await self.clients.openWindow(url);
  })());
});
