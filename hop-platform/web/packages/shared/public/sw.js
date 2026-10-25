// Service worker for Web Push. While the app is visible the live stream already alerts the user, so the
// system notification is only shown when no window is in the foreground.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = { title: "hop", body: "", tag: "hop", url: "/" };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // Keep the default message for malformed payloads.
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      if (windows.some((client) => client.visibilityState === "visible")) return undefined;
      return self.registration.showNotification(message.title, {
        body: message.body,
        tag: message.tag,
        renotify: true,
        data: { url: message.url },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});

// Offline map tiles: cache-first for OpenStreetMap tiles, capped so storage stays small.
const TILES = "hop-tiles";
const MAX_TILES = 600;
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !(url.hostname.endsWith("tile.openstreetmap.org") || url.hostname === "server.arcgisonline.com")) return;
  event.respondWith(
    caches.open(TILES).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      try {
        const res = await fetch(event.request);
        if (res.ok || res.type === "opaque") {
          await cache.put(event.request, res.clone());
          const keys = await cache.keys();
          if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES).map((k) => cache.delete(k)));
        }
        return res;
      } catch {
        return Response.error();
      }
    }),
  );
});
