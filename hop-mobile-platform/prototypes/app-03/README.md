# Hop app concept 03 — Rider & Captain

A design-only preview in the floating-card style of the November 2026 references, with one colour system shared by both apps. It uses sample data. It makes no API, GPS, payment or account calls, and neither app imports it.

## Run

From the repository root:

```sh
python3 -m http.server 5295 --bind 127.0.0.1 --directory hop-mobile-platform/prototypes/app-03
```

- Both apps: http://127.0.0.1:5295/
- Rider only: `?view=rider` · Captain only: `?view=captain` · Colour review: `?view=palette`
- Dark theme: `?theme=dark`

`assets` is a symlink to the existing vehicle artwork and the licensed Outfit/Inter fonts in `hop-platform/prototypes/mobile-first/assets`.

## Screens

- **Rider (12):** home, where to, choose a ride (Recommended / Faster / Cheaper / Shared), offer your fare (bids), finding a Captain, Captain on the way (pickup code, call/message), on the trip (share, SOS), arrived and rating, schedule/rental/outstation, activity, wallet, account.
- **Captain (10):** offline dashboard (goal, go-home mode, expiring document), online with demand areas, ride request (timer, counter offer), going to pickup, pickup code, trip in progress, collect payment (UPI QR / cash), earnings, vehicle and documents, account.

The screens only show features the Go backend already supports (`hop-platform/docs/API.md`): quotes per vehicle, shared rides, bids and counter-offers, stops, rental, outstation, scheduled rides, pickup codes, SOS, trip sharing, direct-payment reports, earnings, goals, go-home mode, demand cells and document expiry.

## Colours

| Token | Light | Dark | Use |
|---|---|---|---|
| primary | `#4B3FD1` | `#5B50E6` | Main buttons, route line, active nav, selected ride |
| primary-soft / ink | `#ECEBFD` / `#3A2FB8` | `#26244A` / `#BDB7FF` | Selected option, info notices |
| ink | `#14151F` | `#F1F1F7` | Text, active chip, drop-off pin |
| muted | `#6B6F80` | `#9A9EB2` | Secondary text |
| paper / surface | `#F4F4F9` / `#FFFFFF` | `#0E0F16` / `#181A24` | Background / cards |
| success | `#0F7A4F` | `#4CC58F` | Online, paid, verified |
| warning | `#8A5A00` | `#F2C66B` | Expiring, pending |
| danger | `#C62F2F` | `#FF8080` | SOS and cancel only |

Each text/background pair is at least 4.5:1. White on primary is 7.2:1 in light mode and 5.6:1 in dark mode. The "Colour review" tab shows the problems with the current palette and the measured ratios.

## Matching Google and OSM maps

The prototype map is a drawing of the target look. In the live apps:

**OpenStreetMap / Leaflet:** add a day filter to `shared/maps/map.css`, next to the existing `.hop-night-tiles` rule:

```css
.hop-map-canvas .leaflet-tile-pane { filter: saturate(.4) brightness(1.04) contrast(.94); }
```

**Google Maps:** in `shared/maps/google.ts`, start the `styles` array from this muted day style when night mode is off:

```ts
const hopDay: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#eef0f4" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b6f80" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e3e5ed" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d9dce6" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cde0f5" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d6ecd8" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];
```

If the Google map is created with a cloud `mapId`, the `styles` option is ignored, and the same colours have to be set in Cloud Console map styling instead.

## Validation

With the preview server running, from `hop-mobile-platform`:

```sh
node prototypes/app-03/validate.mjs
```

The validator renders all 22 screens at 320, 390 and 1024px in light mode, plus 390px in dark mode (88 combinations). It fails on horizontal overflow, controls outside the phone, tap targets under 32px or clipped action bars. It also runs a booking flow, the pickup-code check (including the empty-code error) and the colour review, and confirms there are no page errors and no `/api` or `/auth` requests. Screenshots go to `evidence/`.
