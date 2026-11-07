// Hop-style map icons, drawn on a canvas when the map first asks for them (no sprite server).
// Landmarks are round badges with a white pictogram; one-way and route arrows are plain chevrons.
// Used by the MapLibre map (maplibre.ts) and the vector base under Leaflet (osm.ts).

type Icon = { color: string; path: string; badge: boolean; size: number; stroke?: string; width?: number };

// 24×24 stroke pictograms, in the same line style as the app icons.
export const ICONS: Record<string, Icon> = {
  "hop-lm-worship": { color: "#C27A16", badge: true, size: 22, path: "M12 3v2M9 20V11l3-5 3 5v9M5.5 20v-5.5L9 12.5M18.5 20v-5.5L15 12.5M4 20h16M11 20v-3h2v3" },
  "hop-lm-fuel": { color: "#E46B2C", badge: true, size: 22, path: "M5 20V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v14M4 20h11M5 10h9M14 8.5h1.5A1.5 1.5 0 0 1 17 10v5.5a1.25 1.25 0 0 0 2.5 0V9.5L17.5 7" },
  "hop-lm-bus": { color: "#23824F", badge: true, size: 22, path: "M6 17V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v10M6 17h12M6 12h12M8 17v2.5M16 17v2.5M9 14.5h.01M15 14.5h.01" },
  "hop-lm-metro": { color: "#4B3FD1", badge: true, size: 22, path: "M6 18V6l6 7 6-7v12" },
  "hop-lm-rail": { color: "#4B3FD1", badge: true, size: 22, path: "M8 4h8a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM5 11h14M9 20l1.5-3M15 20l-1.5-3M9 14h.01M15 14h.01" },
  "hop-lm-hospital": { color: "#D23F3F", badge: true, size: 22, width: 3.2, path: "M12 6.5v11M6.5 12h11" },
  "hop-lm-mall": { color: "#8A3FB8", badge: true, size: 22, path: "M6.5 8.5h11l-1 11h-9l-1-11zM9.5 8.5V7a2.5 2.5 0 0 1 5 0v1.5" },
  "hop-oneway": { color: "transparent", badge: false, size: 18, stroke: "#6E7290", width: 2.4, path: "M5 12h13M13.5 7.5 18 12l-4.5 4.5" },
  "hop-oneway-night": { color: "transparent", badge: false, size: 18, stroke: "#9DA2BD", width: 2.4, path: "M5 12h13M13.5 7.5 18 12l-4.5 4.5" },
  "hop-route-arrow": { color: "transparent", badge: false, size: 12, stroke: "#FFFFFF", width: 2.6, path: "M7 18 12 8l5 10" },
};

const RATIO = 2;

/** Pixels for one icon, or undefined when the id isn't ours (or the canvas is unavailable). */
export function drawIcon(id: string): { width: number; height: number; data: Uint8ClampedArray } | undefined {
  const icon = ICONS[id];
  if (!icon) return undefined;
  const px = icon.size * RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.scale(RATIO, RATIO);
  const s = icon.size;
  if (icon.badge) {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
    ctx.fillStyle = icon.color;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#FFFFFF";
    ctx.stroke();
  }
  // Pictograms are drawn on a 24 grid; badges shrink them to sit inside the circle.
  const scale = icon.badge ? (s * 0.62) / 24 : s / 24;
  const offset = (s - 24 * scale) / 2;
  ctx.translate(offset, offset);
  ctx.scale(scale, scale);
  ctx.strokeStyle = icon.stroke || "#FFFFFF";
  ctx.lineWidth = (icon.width || 2.2) * (icon.badge ? 1.15 : 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(icon.path));
  const pixels = ctx.getImageData(0, 0, px, px);
  return { width: px, height: px, data: pixels.data };
}

type ImageHost = {
  hasImage(id: string): boolean;
  addImage(id: string, image: { width: number; height: number; data: Uint8ClampedArray }, options?: { pixelRatio?: number }): void;
  on(type: "styleimagemissing", listener: (e: { id: string }) => void): unknown;
};

/** Supplies Hop icons whenever the style asks for one it doesn't have (also after a restyle). */
export function provideIcons(map: ImageHost) {
  map.on("styleimagemissing", (e) => {
    if (map.hasImage(e.id)) return;
    const image = drawIcon(e.id);
    if (image) map.addImage(e.id, image, { pixelRatio: RATIO });
  });
}

/** Map POI classes (OpenMapTiles `poi` layer) to a landmark icon. */
export const LANDMARK_ICON = [
  "match", ["get", "class"],
  "place_of_worship", "hop-lm-worship",
  "fuel", "hop-lm-fuel",
  "bus", "hop-lm-bus",
  "railway", ["match", ["get", "subclass"], ["subway", "light_rail", "monorail"], "hop-lm-metro", "hop-lm-rail"],
  "hospital", "hop-lm-hospital",
  "shop", ["match", ["get", "subclass"], ["mall", "department_store"], "hop-lm-mall", ""],
  "",
];
