// Pickup and drop-off pins (approved Nov 2026, "Hop Map Styles" preview).
// Pickup is round (indigo) and drop-off is square (ink), so they differ by shape as well as
// colour. Each stands on a short stem with a ground dot that marks the exact spot. A callout
// above carries the number the rider cares about: walk distance or the captain's wait before
// pickup, and the arrival time during the trip. Only real values are shown; with no value the
// callout just names the pin.
export type PinKind = "pickup" | "dropoff";

const KEY: Record<PinKind, string> = { pickup: "PICKUP", dropoff: "DROP" };
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** HTML for the OpenStreetMap (Leaflet) pin. The root keeps the `hop-marker-pin` class. */
export function pinHtml(kind: PinKind, note: string | undefined, options: { editable: boolean; waiting: boolean; callout?: boolean }) {
  const label = `${kind === "pickup" ? "Pickup" : "Drop-off"}${note ? `: ${note}` : ""}`;
  const body = `<span class="hop-pin-key">${KEY[kind]}</span>${note ? `<span class="hop-pin-note">${escape(note)}</span>` : ""}`;
  const callout = options.editable
    ? `<button type="button" class="hop-pin-callout" data-pin-edit="${kind}" aria-label="Change ${label}">${body}<span class="hop-pin-chevron" aria-hidden="true">›</span></button>`
    : `<div class="hop-pin-callout" role="img" aria-label="${escape(label)}">${body}</div>`;
  return `<div class="hop-marker-pin hop-${kind}-pin${options.waiting ? " waiting" : ""}">
    ${options.callout === false ? "" : callout}
    <span class="hop-pin-head" aria-hidden="true"><i></i></span><span class="hop-pin-stem" aria-hidden="true"></span><span class="hop-pin-ground" aria-hidden="true"></span>
    ${options.waiting ? '<span class="hop-pin-pulse" aria-hidden="true"></span>' : ""}
  </div>`;
}

/** The same pin as one SVG image, for maps that take image markers (Google). */
export function pinSvg(kind: PinKind, note?: string) {
  const fill = kind === "pickup" ? "#4b3fd1" : "#14151f";
  const key = KEY[kind];
  const keyW = Math.round(key.length * 6.6 + 12);
  const noteW = note ? Math.round(note.length * 6.9 + 10) : 0;
  const callW = keyW + noteW + 12;
  const width = Math.max(callW + 8, 40);
  const cx = width / 2;
  const height = 34 + 6 + 30 + 18; // callout, gap, head, stem and ground dot
  const head = kind === "pickup"
    ? `<circle cx="${cx}" cy="55" r="11" fill="${fill}" stroke="#fff" stroke-width="4"/><circle cx="${cx}" cy="55" r="3.5" fill="#fff"/>`
    : `<rect x="${cx - 11}" y="44" width="22" height="22" rx="5" fill="${fill}" stroke="#fff" stroke-width="4"/><rect x="${cx - 3}" y="52" width="6" height="6" rx="1" fill="#fff"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#14151f" flood-opacity=".22"/></filter></defs>
    <g filter="url(#s)"><rect x="${cx - callW / 2}" y="2" width="${callW}" height="30" rx="11" fill="#fff"/>
    <rect x="${cx - callW / 2 + 5}" y="7" width="${keyW}" height="20" rx="7" fill="${fill}"/></g>
    <text x="${cx - callW / 2 + 5 + keyW / 2}" y="21" text-anchor="middle" font-family="'Plus Jakarta Sans',-apple-system,sans-serif" font-size="10" font-weight="800" letter-spacing=".8" fill="#fff">${key}</text>
    ${note ? `<text x="${cx - callW / 2 + keyW + 11}" y="21.5" font-family="'Plus Jakarta Sans',-apple-system,sans-serif" font-size="12" font-weight="700" fill="#14151f">${escape(note)}</text>` : ""}
    <rect x="${cx - 1.5}" y="64" width="3" height="16" rx="1.5" fill="${fill}"/>
    <ellipse cx="${cx}" cy="${height - 4}" rx="5" ry="2" fill="#14151f" fill-opacity=".35"/>
    <g filter="url(#s)">${head}</g></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, width, height, anchorX: cx, anchorY: height - 4 };
}

/** "Arrive 6:42 PM" from the seconds left, in the phone's own clock format. */
export function arrivalNote(secondsLeft: number, now = Date.now()) {
  if (!Number.isFinite(secondsLeft) || secondsLeft < 0) return undefined;
  const at = new Date(now + secondsLeft * 1000);
  return `Arrive ${at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

/** "Captain 3 min" while the captain is on the way; "Captain is here" once they've arrived. */
export function waitNote(phase: string | undefined, secondsLeft: number | undefined) {
  if (phase === "arrived") return "Captain is here";
  if (phase !== "accepted" || secondsLeft == null || !Number.isFinite(secondsLeft)) return undefined;
  return `Captain ${Math.max(1, Math.round(secondsLeft / 60))} min`;
}

/** Walking distance to the pickup, shown only for a short walk (15 m to 600 m). */
export function walkNote(meters: number) {
  if (!Number.isFinite(meters) || meters < 15 || meters > 600) return undefined;
  return `${Math.round(meters / 10) * 10} m walk`;
}

/** Room to leave when framing a route: below the bars over the map's top edge, plus the
 * height of a pin and its callout (about 70 px) when there is space, so neither ends up hidden. */
export function framePadding(host: HTMLElement) {
  const side = 45, bottom = 45;
  const bars = Number(host.dataset.topInset || 0), height = host.clientHeight;
  // Best: below the bars with room for callouts. Tighter: just below the bars (callouts then
  // flip or slide to stay visible). A very short map keeps the plain margin rather than
  // squeezing the route into a sliver.
  const top = height - (bars + 70) - bottom >= 80 ? bars + 70 : height - (bars + 16) - bottom >= 60 ? bars + 16 : side;
  return { top: Math.round(top), bottom, left: side, right: side };
}
