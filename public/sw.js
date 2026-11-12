// PrimaHunt service worker: shows push alerts (new stars) and opens the right page when tapped.
// It caches nothing, so the site always loads fresh.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
