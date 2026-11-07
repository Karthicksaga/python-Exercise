/** True when the phone can draw the MapLibre map (WebGL), unless image tiles are forced. */
export function webglAvailable() {
  if (import.meta.env.VITE_MAP_STYLE === "raster" || import.meta.env.VITE_MAP_TILE_URL) return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
