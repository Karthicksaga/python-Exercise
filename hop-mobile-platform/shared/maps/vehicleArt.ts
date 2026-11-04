// Top-down vehicle markers for the live map, in the shaded style ride-hailing apps use: glossy
// body, tinted glass with reflections, mirrors, lights and a soft ground shadow. They point
// north at 0° and are rotated to the heading, so they read correctly in every direction.
// Hex colours are allowed here: they live inside SVG marker strings (see CLAUDE.md).
// After changing the art, run `node scripts/map-sprites.mjs` to refresh the Android PNGs.
import { vehicleCategory } from "./types";

type Paint = { dark: string; base: string; light: string; edge?: string };

const common = (id: string) => `
  <filter id="${id}s" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4"/></filter>
  <linearGradient id="${id}g" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#0c0f22"/><stop offset=".45" stop-color="#2b3561"/><stop offset=".55" stop-color="#34407a"/><stop offset="1" stop-color="#0c0f22"/>
  </linearGradient>
  <linearGradient id="${id}t" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;

// Cylindrical body shading: darker sides, a lit centre line.
const bodyGradient = (id: string, p: Paint) => `
  <linearGradient id="${id}b" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="${p.dark}"/><stop offset=".22" stop-color="${p.base}"/><stop offset=".5" stop-color="${p.light}"/>
    <stop offset=".78" stop-color="${p.base}"/><stop offset="1" stop-color="${p.dark}"/>
  </linearGradient>`;

function car(id: string, p: Paint, length: number, width: number) {
  const x = 48 - width / 2, y = 48 - length / 2, r = width * 0.36;
  const at = (f: number) => y + length * f;
  const wheel = (wx: number, wy: number) => `<rect x="${wx}" y="${wy}" width="3.6" height="9" rx="1.6" fill="#111216"/>`;
  return `<defs>${common(id)}${bodyGradient(id, p)}</defs>
  <rect x="${x + 1}" y="${y + 3}" width="${width}" height="${length}" rx="${r}" fill="#05060d" opacity=".32" filter="url(#${id}s)"/>
  ${wheel(x - 1.6, at(0.17))}${wheel(x + width - 2, at(0.17))}${wheel(x - 1.6, at(0.7))}${wheel(x + width - 2, at(0.7))}
  <rect x="${x}" y="${y}" width="${width}" height="${length}" rx="${r}" fill="url(#${id}b)" stroke="${p.edge ?? "#05060d"}" stroke-opacity="${p.edge ? ".55" : ".35"}" stroke-width="${p.edge ? "1.1" : ".7"}"/>
  <ellipse cx="48" cy="${at(0.12)}" rx="${width * 0.3}" ry="${length * 0.07}" fill="url(#${id}t)" opacity=".6"/>
  <ellipse cx="${x - 0.8}" cy="${at(0.3)}" rx="2" ry="1.3" fill="${p.base}" stroke="#05060d" stroke-opacity=".4" stroke-width=".5"/>
  <ellipse cx="${x + width + 0.8}" cy="${at(0.3)}" rx="2" ry="1.3" fill="${p.base}" stroke="#05060d" stroke-opacity=".4" stroke-width=".5"/>
  <path d="M${x + 2.4} ${at(0.27)} Q48 ${at(0.2)} ${x + width - 2.4} ${at(0.27)} L${x + width - 3.6} ${at(0.41)} Q48 ${at(0.38)} ${x + 3.6} ${at(0.41)}Z" fill="url(#${id}g)"/>
  <path d="M${x + 5} ${at(0.255)} L${x + width * 0.42} ${at(0.235)} L${x + width * 0.3} ${at(0.395)} L${x + 4.6} ${at(0.4)}Z" fill="#fff" opacity=".22"/>
  <rect x="${x + 1.5}" y="${at(0.4)}" width="1.7" height="${length * 0.32}" rx=".8" fill="#141933" opacity=".85"/>
  <rect x="${x + width - 3.2}" y="${at(0.4)}" width="1.7" height="${length * 0.32}" rx=".8" fill="#141933" opacity=".85"/>
  <rect x="${x + 3.6}" y="${at(0.41)}" width="${width - 7.2}" height="${length * 0.3}" rx="3" fill="url(#${id}b)" stroke="#05060d" stroke-opacity=".18" stroke-width=".5"/>
  <rect x="${x + width * 0.36}" y="${at(0.45)}" width="${width * 0.28}" height="${length * 0.16}" rx="2" fill="#fff" opacity=".13"/>
  <path d="M${x + 3.8} ${at(0.72)} Q48 ${at(0.7)} ${x + width - 3.8} ${at(0.72)} L${x + width - 3} ${at(0.82)} Q48 ${at(0.86)} ${x + 3} ${at(0.82)}Z" fill="url(#${id}g)"/>
  <path d="M${x + 4.2} ${at(0.735)} L${x + width * 0.38} ${at(0.725)} L${x + width * 0.3} ${at(0.81)} L${x + 3.8} ${at(0.805)}Z" fill="#fff" opacity=".16"/>
  <rect x="${x + 2.2}" y="${y + 0.9}" width="${width * 0.26}" height="2.2" rx="1.1" fill="#fff9d8"/>
  <rect x="${x + width - 2.2 - width * 0.26}" y="${y + 0.9}" width="${width * 0.26}" height="2.2" rx="1.1" fill="#fff9d8"/>
  <rect x="${x + 2.2}" y="${y + length - 2.8}" width="${width * 0.24}" height="1.9" rx=".9" fill="#e5383b"/>
  <rect x="${x + width - 2.2 - width * 0.24}" y="${y + length - 2.8}" width="${width * 0.24}" height="1.9" rx=".9" fill="#e5383b"/>`;
}

// Indian auto-rickshaw: yellow body, black canvas canopy with ribs, single front wheel.
const auto = (id: string) => `<defs>${common(id)}${bodyGradient(id, { dark: "#a8810a", base: "#f2c418", light: "#ffe27a" })}
  <linearGradient id="${id}c" x1="0" x2="1"><stop offset="0" stop-color="#050608"/><stop offset=".5" stop-color="#2a2c33"/><stop offset="1" stop-color="#050608"/></linearGradient></defs>
  <path d="M48 16 C40 17 33 23 32 32 L30 76 Q48 82 66 76 L64 32 C63 23 56 17 48 16Z" fill="#05060d" opacity=".3" filter="url(#${id}s)" transform="translate(1 3)"/>
  <rect x="45.6" y="12" width="4.8" height="9" rx="2" fill="#111216"/>
  <rect x="27.5" y="62" width="4" height="11" rx="1.6" fill="#111216"/><rect x="64.5" y="62" width="4" height="11" rx="1.6" fill="#111216"/>
  <path d="M48 16 C40 17 33 23 32 32 L30 76 Q48 82 66 76 L64 32 C63 23 56 17 48 16Z" fill="url(#${id}b)" stroke="#05060d" stroke-opacity=".35" stroke-width=".7"/>
  <path d="M40 25 Q48 21 56 25 L57 31 Q48 29 39 31Z" fill="url(#${id}g)"/>
  <path d="M41 25.5 L46 23.5 L44.5 30.2 L40 30.8Z" fill="#fff" opacity=".22"/>
  <path d="M34 34 Q48 29 62 34 L63 74 Q48 79 33 74Z" fill="url(#${id}c)"/>
  ${[42, 52, 62].map((v) => `<path d="M34.3 ${v} Q48 ${v - 3} 62.6 ${v}" stroke="#4a4d58" stroke-width="1" fill="none" opacity=".8"/>`).join("")}
  <path d="M40 36 Q48 33.5 56 36 L56.5 44 Q48 42 39.5 44Z" fill="#fff" opacity=".07"/>
  <circle cx="48" cy="18.3" r="1.7" fill="#fff9d8"/>
  <rect x="35" y="75.3" width="4" height="1.6" rx=".8" fill="#e5383b"/><rect x="57" y="75.3" width="4" height="1.6" rx=".8" fill="#e5383b"/>`;

// Motorbike with rider seen from above: tyres, handlebar with mirrors, glossy helmet with visor.
const bike = (id: string) => `<defs>${common(id)}
  <radialGradient id="${id}h" cx=".38" cy=".32" r=".7"><stop offset="0" stop-color="#8a80ff"/><stop offset=".55" stop-color="#4b3fd1"/><stop offset="1" stop-color="#231b7a"/></radialGradient>
  <linearGradient id="${id}j" x1="0" x2="1"><stop offset="0" stop-color="#15161c"/><stop offset=".5" stop-color="#3a3d4a"/><stop offset="1" stop-color="#15161c"/></linearGradient>
  <linearGradient id="${id}k" x1="0" x2="1"><stop offset="0" stop-color="#3a1a1a"/><stop offset=".5" stop-color="#c62f2f"/><stop offset="1" stop-color="#3a1a1a"/></linearGradient></defs>
  <ellipse cx="49" cy="52" rx="13" ry="31" fill="#05060d" opacity=".28" filter="url(#${id}s)"/>
  <rect x="45" y="13" width="6" height="15" rx="3" fill="#111216"/><rect x="45" y="67" width="6" height="17" rx="3" fill="#111216"/>
  <path d="M44.5 24 Q48 20 51.5 24 L53 44 L43 44Z" fill="url(#${id}k)"/>
  <rect x="30" y="27.6" width="36" height="2.6" rx="1.3" fill="#1d1f27"/>
  <ellipse cx="29.5" cy="26" rx="2.6" ry="1.6" fill="#2b2d36"/><ellipse cx="66.5" cy="26" rx="2.6" ry="1.6" fill="#2b2d36"/>
  <path d="M35 30 Q37 40 40 46 M61 30 Q59 40 56 46" stroke="#2a2c35" stroke-width="4" stroke-linecap="round" fill="none"/>
  <ellipse cx="48" cy="52" rx="12.5" ry="9.5" fill="url(#${id}j)"/>
  <path d="M42 60 Q48 64 54 60 L53 72 Q48 74 43 72Z" fill="#202228"/>
  <circle cx="48" cy="45" r="7.4" fill="url(#${id}h)" stroke="#fff" stroke-opacity=".85" stroke-width="1.1"/>
  <path d="M42.8 42 Q48 38.2 53.2 42 L52 44 Q48 41.6 44 44Z" fill="#0c0f22" opacity=".85"/>
  <ellipse cx="45.6" cy="42.6" rx="2" ry="1.2" fill="#fff" opacity=".55"/>
  <rect x="46.4" y="80.5" width="3.2" height="1.6" rx=".8" fill="#e5383b"/>
  <circle cx="48" cy="15.4" r="1.6" fill="#fff9d8"/>`;

const ART: Record<string, string> = {
  auto: auto("a"),
  bike: bike("k"),
  mini: car("m", { dark: "#9ea2b3", base: "#e4e6ee", light: "#ffffff" }, 54, 30),
  sedan: car("s", { dark: "#241c78", base: "#4b3fd1", light: "#8a80ff" }, 62, 31),
  // The dark SUV gets a light edge so it stays visible on the night map.
  suv: car("v", { dark: "#05060a", base: "#23252f", light: "#5a5e70", edge: "#d9dce6" }, 66, 35),
};

const cache = new Map<string, string>();
/** Data URL of the top-down marker for a category (unknown categories draw as an auto). */
export function topDownVehicle(category: string): string {
  const key = vehicleCategory(category);
  let url = cache.get(key);
  if (!url) {
    url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">${ART[key]}</svg>`)}`;
    cache.set(key, url);
  }
  return url;
}
export const VEHICLE_MARKER_SIZE = 46;
