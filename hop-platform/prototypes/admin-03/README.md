# Hop operations console: concept 03

A clickable design preview of the redesigned admin console, in the Design 03 style used by the Rider and Captain apps (same indigo tokens, Plus Jakarta Sans, light and dark). It uses sample data from `data.js`, whose field names match the live `/api/operator` and `/api/admin` responses. It makes no API calls, and the console in `web/apps/admin` doesn't import it.

## Run

From the repository root:

```sh
python3 -m http.server 5296 --bind 127.0.0.1 --directory hop-platform/prototypes/admin-03
```

Open http://127.0.0.1:5296/. Add `?theme=dark` for dark mode or `#zones` (any screen id) to open a screen directly. `assets` is a symlink to `../mobile-first/assets` (fonts and vehicle images).

## Navigation: 16 menu items become 13

| Group | Screen | Replaces |
|---|---|---|
| — | **Overview** (new) | Executive analytics, plus a "Needs attention" queue: SOS, incidents, applications, payouts, expiring documents, zones missing fares, lost items |
| Operations | **Live dispatch** | Live dispatch map |
| | **Rides** | Rides management (cancel needs a reason; refund is capped at the amount still refundable and can recover the amount from the captain) |
| Captains | **Captain reviews** | "Driver reviews" and "KYC & documents" (they showed the same screen) plus vehicle and area change requests, now in tabs |
| | **Safety scores** | Driver scores |
| Safety & care | **SOS & incidents** | Emergency SOS and Incidents, now in tabs |
| | **Lost & found** | Lost & found |
| Network | **Service areas** | Service areas, with the map zone editor |
| | **Fares** | Fares & categories and trip options; prices shown in rupees, stored in paise |
| | **Surge & peak** | Surge & peak |
| Money | **Payouts & refunds** | Payouts & refunds |
| | **Promo codes** | Promo codes (all fields the API accepts) |
| Records | **Audit log** | Audit log, with filters and search |

Sign-in screen: select the sign-out button at the bottom of the sidebar.

## Zone editor

- The zone is a rectangle on the map. Drag it to move it, drag a corner to resize it, use the arrow keys when it's focused, or type the coordinates.
- **City limits** shrinks a district zone to the city in one click. **Whole district** restores the catalogue bounds.
- Overlaps with other zones are drawn in red. Overlap with a zone that's taking bookings blocks opening bookings.
- A checklist explains exactly why bookings can't open yet (for example a missing approval reference) instead of a Save button that seems to do nothing.

## Built (Nov 2026)

The real console in `web/apps/admin` implements this design on the live API. The backend gained:

1. **City limits:** migration 036 adds city boxes to `region_catalog`, written by `backend/scripts/fetch_districts.py --cities`. OpenStreetMap has real boundaries for 9 Tamil Nadu cities and approximate boxes for 25; 4 have none. The console labels approximate boxes.
2. **Overlap check:** `POST /api/operator/areas` refuses to open bookings in a zone that overlaps another live zone (409).
3. **Overview counts:** `GET /api/operator/summary`.

The prototype stays as the design reference. It still uses sample data.

## Validation

With the preview server running, from the repository root:

```sh
node hop-platform/prototypes/admin-03/validate.mjs
```

It renders all 13 screens and the sign-in page at 390, 768, 1280 and 1600 px in light mode and at 390 and 1280 px in dark mode (84 combinations). It fails on sideways scrolling, controls outside the screen, tap targets under 32 px, page errors or any `/api` or `/auth` request. It then runs 7 flows: dragging a zone, City limits removing the overlap, activation needing an approval reference, a new zone from a district, approval blockers, the refund cap and resolving an SOS. Screenshots go to `evidence/`, which git ignores.
