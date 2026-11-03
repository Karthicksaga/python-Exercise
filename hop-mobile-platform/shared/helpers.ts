import { icon } from "./icons";
import { VehicleCategory } from "./types";

export const escape = (value: any): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] || c
  );

export const money = (value: number | string): string =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

export function img(category = "auto", width = 56): string {
  return `<img src="/assets/${category}.png" alt="${category}" width="${width}" height="${Math.round(
    width * 0.7
  )}" class="vehicle-thumb" loading="lazy"/>`;
}

export function mapArt(route = false, trip = false, role: "rider" | "captain" = "rider", screen = "home"): string {
  return `<div class="map-art" role="img" aria-label="Schematic sample map; not live navigation"><svg viewBox="0 0 390 720" preserveAspectRatio="xMidYMin slice"><defs><pattern id="blocks" width="84" height="82" patternTransform="rotate(-16)" patternUnits="userSpaceOnUse"><rect width="84" height="82" fill="#e2e2ee"/><rect x="6" y="7" width="29" height="27" rx="4" fill="#d9d9e3"/><rect x="43" y="7" width="34" height="27" rx="4" fill="#dadbe5"/><rect x="6" y="42" width="34" height="33" rx="4" fill="#dadbe5"/><rect x="47" y="42" width="30" height="33" rx="4" fill="#d9dae8"/><path d="M0 38h84M40 0v82" stroke="#f9f9fc" stroke-width="7"/></pattern><filter id="route-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".08"/></filter></defs><rect width="390" height="720" fill="url(#blocks)"/><path d="M320-20c-30 120 10 130 60 210 45 80-10 140 0 200l50 330H500V-20Z" fill="#cacad8"/><path d="M-20 230 412 79M-20 440 410 271M96-30 312 720M-15 92l415 325" stroke="#c7c8d7" stroke-width="14" fill="none"/><path d="M-20 230 412 79M-20 440 410 271M96-30 312 720M-15 92l415 325" stroke="#fffef5" stroke-width="9" fill="none"/><path d="M25 330c45-67 82-25 120-70s62-20 81-68" stroke="#fffef5" stroke-width="7" fill="none"/><ellipse cx="56" cy="109" rx="42" ry="31" transform="rotate(-16 56 109)" fill="#c3c4d4"/><ellipse cx="208" cy="289" rx="35" ry="24" transform="rotate(-16 208 289)" fill="#c4c5d5"/>${
    route
      ? '<path d="M99 126 130 199 175 182 204 251 263 229 282 278" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M99 126 130 199 175 182 204 251 263 229 282 278" fill="none" stroke="#474761" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#route-shadow)"/>'
      : ""
  }<text x="31" y="68" fill="#7e7f91" font-size="8" letter-spacing="2" font-family="sans-serif">ADYAR</text><text x="145" y="153" fill="#7e7f91" font-size="8" letter-spacing="2" font-family="sans-serif">GUINDY</text><text x="49" y="274" fill="#7e7f91" font-size="8" letter-spacing="2" font-family="sans-serif">ALANDUR</text><text x="314" y="260" fill="#74769b" font-size="8" font-family="sans-serif" transform="rotate(77 314 260)">ADYAR RIVER</text></svg></div><div class="map-pin pickup" style="left:22%;top:${
    route ? "18" : "24"
  }%"></div>${
    screen === "matching"
      ? '<div class="radar-pulse-wrap" style="left:22%;top:18%"><span class="radar-wave"></span><span class="radar-wave delay-1"></span><span class="radar-wave delay-2"></span></div>'
      : ""
  }${
    route
      ? '<div class="map-pin" style="left:70%;top:37%"></div><div class="map-bubble" style="left:40%;top:22%">22 min <span class="muted">· 8.6 km</span></div>'
      : ""
  }<div class="mini-car" style="left:49%;top:15%">${img(
    trip ? "sedan" : "auto",
    37
  )}</div><div class="mini-car" style="left:18%;top:39%;transform:rotate(25deg)">${img(
    "sedan",
    37
  )}</div><div class="mini-car" style="left:74%;top:12%;transform:rotate(-20deg)">${img(
    "mini",
    37
  )}</div><div class="map-controls"><button class="icon-button" aria-label="Map layers" data-modal="map">${icon(
    "layers"
  )}</button><button class="icon-button" aria-label="Centre map" data-action="center-map">${icon(
    "target"
  )}</button></div>`;
}

export function notify(message: string): void {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  const anyToast = toast as any;
  clearTimeout(anyToast.timer);
  anyToast.timer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 3200);
}

