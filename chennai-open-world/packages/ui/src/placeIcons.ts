/**
 * Icons for the places the player can go into: a round coloured badge with a simple drawn
 * symbol (no emoji or font needed, so it looks the same on every phone). Used on the minimap
 * and, as a canvas texture, above each entrance.
 */

export type PlaceIcon = "home" | "hospital" | "gym" | "mall" | "cinema";

export const PLACE_COLORS: Record<PlaceIcon, string> = {
  home: "#2f8f5b",
  hospital: "#d64545",
  gym: "#6a4fc2",
  mall: "#d9822b",
  cinema: "#1f6fb2",
};

/** Draw the badge centred at (cx, cy) with radius r, upright in the current transform. */
export function drawPlaceIcon(g: CanvasRenderingContext2D, icon: PlaceIcon, cx: number, cy: number, r: number): void {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = PLACE_COLORS[icon];
  g.strokeStyle = "#ffffff";
  g.lineWidth = r * 0.16;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#ffffff";
  const s = r * 0.55;
  g.beginPath();
  switch (icon) {
    case "home":
      g.moveTo(-s, -s * 0.05);
      g.lineTo(0, -s * 0.95);
      g.lineTo(s, -s * 0.05);
      g.lineTo(s * 0.7, -s * 0.05);
      g.lineTo(s * 0.7, s * 0.85);
      g.lineTo(-s * 0.7, s * 0.85);
      g.lineTo(-s * 0.7, -s * 0.05);
      g.closePath();
      g.fill();
      break;
    case "hospital": {
      const w = s * 0.38;
      g.rect(-w, -s, w * 2, s * 2);
      g.rect(-s, -w, s * 2, w * 2);
      g.fill();
      break;
    }
    case "gym":
      g.rect(-s * 0.7, -s * 0.12, s * 1.4, s * 0.24);
      g.rect(-s, -s * 0.55, s * 0.3, s * 1.1);
      g.rect(s * 0.7, -s * 0.55, s * 0.3, s * 1.1);
      g.fill();
      break;
    case "mall":
      g.rect(-s * 0.75, -s * 0.35, s * 1.5, s * 1.2);
      g.fill();
      g.beginPath();
      g.lineWidth = r * 0.14;
      g.arc(0, -s * 0.35, s * 0.4, Math.PI, 0);
      g.stroke();
      break;
    case "cinema":
      g.rect(-s * 0.9, -s * 0.6, s * 1.25, s * 1.2);
      g.fill();
      g.beginPath();
      g.moveTo(s * 0.35, 0);
      g.lineTo(s, -s * 0.55);
      g.lineTo(s, s * 0.55);
      g.closePath();
      g.fill();
      break;
  }
  g.restore();
}

/** A square canvas with the badge, for a texture. */
export function placeIconCanvas(icon: PlaceIcon, size = 128): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) drawPlaceIcon(g, icon, size / 2, size / 2, size * 0.42);
  return canvas;
}
