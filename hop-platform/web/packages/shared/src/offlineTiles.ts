// Low-data mode uses satellite imagery as its base map, so that is what gets saved.
const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function tileXY(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x, y };
}

// Saves ~100 tiles (zoom 13-16, 5x5 around the point) into the cache the service worker reads.
export async function saveAreaOffline(lat: number, lng: number): Promise<number> {
  if (!("caches" in window)) throw new Error("Offline storage is not supported in this browser");
  await navigator.serviceWorker?.register("/sw.js");
  const cache = await caches.open("hop-tiles");
  let saved = 0;
  for (const z of [13, 14, 15, 16]) {
    const c = tileXY(lat, lng, z);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const url = TILE_URL.replace("{z}", String(z)).replace("{x}", String(c.x + dx)).replace("{y}", String(c.y + dy));
        if (await cache.match(url)) continue;
        try {
          await cache.add(new Request(url, { mode: "no-cors" }));
          saved++;
        } catch {
          /* skip failed tile */
        }
      }
    }
  }
  return saved;
}
