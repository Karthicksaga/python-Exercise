# Hop mobile platform: Rider & Captain apps

Applies to every model and agent working in this folder. `AGENTS.md` points here.

## How the apps are built
- `apps/rider/src/main.ts` and `apps/captain/src/main.ts` only call `mountMobileApp(role)` in `shared/design/mountPrototype.ts`.
- The UI is rendered by the canonical renderer `../hop-platform/prototypes/mobile-first/app.js` + `style.css`, imported through the Vite alias `@prototype`. One renderer and one stylesheet serve both apps.
- Live behaviour is added under the renderer by adapters in `shared/`: `booking/`, `journey/`, `payments/`, `account/`, `history/`, `maps/` (Google/OSM), `onboarding/`, `notifications/`, `services/client.ts` (HTTP + CSRF) and `services/contracts.ts` (API types).
- `apps/*/src/features/prototype/*.ts` are archived renderers. They are not mounted, so never edit them or use them as a reference.
- `prototypes/app-03/` is the approved design preview for the November 2026 redesign. `prototypes/app-next/` and `prototypes/launch/` are earlier previews. None of them are imported by the apps.

## Design (approved redesign: "concept 03", November 2026)
- Rider and Captain share one palette. Tokens are defined at the top of `style.css`:
  - primary: indigo `#4B3FD1` (`--accent`; dark mode `#5B50E6`)
  - ink: `#14151F`
  - muted: `#6B6F80`
  - paper: `#F4F4F9`
- Green, amber and red mean status only: online/paid/verified, expiring/pending, SOS/cancel. Never use them as the brand colour.
- The Captain app has no separate brand colour.
- Maps: pickup marker and route use indigo, the drop-off pin uses ink, and the "you are here" dot stays blue (`#2677df`). Google uses the `hopDay` style in `shared/maps/google.ts`.
- OpenStreetMap (approved Nov 2026): Hop's own vector style from OpenFreeMap tiles (`shared/maps/vectorStyle.ts`), drawn by MapLibre under Leaflet, so pins, routes and vehicles stay Leaflet markers and tests are unchanged.
  - Modes: `browse` (booking), `ride` (live trip, when `phase` is set) and night (night preference or app dark mode).
  - MapLibre is lazy-loaded. With no WebGL, a failed or slow load (20 s), or `VITE_MAP_STYLE=raster` or `VITE_MAP_TILE_URL` set, it falls back to image tiles muted by a CSS filter.- Pins (`shared/maps/pins.ts`): round pickup and square drop-off on a stem with a ground dot, plus a callout (`MapData.pickupNote` / `dropoffNote`) that shows only real values:
  - walk distance while booking
  - "N min ride" from the quoted route
  - "Captain N min" or "Captain is here" before pickup, and "Arrive h:mm" during the trip (rider `/nav` seconds)
  - While booking, tapping a callout fires `hop-pin-edit`, which opens the pickup or search edit control.
  - Callouts slide or flip to stay below the bars over the map (`data-top-inset`, measured in `PrototypeMap.measureTop`).
- While booking, a new route draws itself from pickup to drop-off, pins pop in, and a light travels along it (`.hop-route-flow`, in its own pane). Live trips don't animate the route, and reduced motion turns all of it off.
- Live map behaviour (Nov 2026), in `shared/maps/`:
  - `vehicleArt.ts`: top-down vehicle markers that point north and are rotated to the heading. The side-view PNGs are for cards only.
  - `motion.ts`: vehicles glide between fixes over one 2 s poll and turn by the shortest angle. They jump instead under reduced motion, on a hidden page, or for moves over 800 m. Also holds the road snapping and route-trimming helpers.
  - `PrototypeMap.ts`: on a trip, a captain within 35 m of the route is drawn on it and the route behind them is removed. The map reframes once per trip stage.
  - `liveFeed.ts`: the rider sees the captain's approach road (`/api/rides/{id}/nav`, cached 15 s) until the captain arrives.
  - `rideCheck.ts`: rider check-in after 45 s more than 250 m off the route, or after a 4-minute stop away from the destination. It never auto-escalates.
  - Alternative routes are drawn in grey with a "Fastest" or "Shortest" label. Tapping one fires `hop-route-pick`.
  - Tests are in `tests/map-realism.spec.mjs`. The suite runs with reduced motion, so motion tests opt out with `test.use`.
- Font: Plus Jakarta Sans (approved Nov 2026) for headings, amounts and body text, bundled locally in `assets/fonts/jakarta-*.woff2` (the latin-ext file carries ₹). Don't add runtime Google Fonts.
- Change colours through tokens. New hard-coded hex values are only allowed in SVG marker strings.

## Rules (kept from the original contract)
- Keep the single renderer as the visual source. `shared/design/standalone.css` may only remove the review frame.
- Connect real data and actions underneath the approved UI. Never show fabricated success after an error, and don't add simplified "integration" screens.
- Preserve server state, CSRF, quote IDs, idempotency keys and ride versions.
- Keep accessibility, safe areas, large text, dark mode, keyboard access, anchored actions and bounded scrolling working.
- Hop Commute stays disabled: its home control and review entries stay hidden, and its navigation guard stays active.
- Review URLs `?prototype=login|payment|states` must never mount live adapters, send SMS, charge money or change device permissions.
- Search uses the selected service area (initially Chennai), not the first area returned by `/api/config`.
- Captain onboarding is mandatory, in development too. Until the backend status is `approved`, keep the Captain on onboarding or pending review, with no map or main navigation.
- Local testing uses the dev backend at `http://127.0.0.1:8081` through the Vite proxy. Don't point local UI testing at staging unless asked.
- Never relax a test to accept accidental drift. Update an expectation only when the user approved the design change, and say so in the commit.
- Don't call the apps production-ready or fully backend-integrated.

## Commands (run from this folder)
```sh
npm run typecheck
npm run build
npm run test:design                                        # Playwright; starts renderer :5290, rider :5183, captain :5184
npx playwright test tests/<file>.spec.mjs --reporter=line  # one suite
npm run test:e2e                                           # Captain onboarding + a full ride on a real local API (e2e/README.md)
HOP_E2E_OPERATOR_PHONE=… npm run test:e2e:staging          # the same two tests against staging
```
`tests/support/mockBackend.mjs` provides the API fixtures, so no backend is needed for `test:design`. `test:e2e` wipes and uses a local `_e2e` database; run it after changing booking, trip, payment or GPS flows.

## Live behaviour rules (from the Nov 2026 end-to-end test)
- Captain GPS: tapping Go online starts sharing location. Reopening the app while already online does not resume it silently; the status asks the captain to tap GPS sharing.
  - Only a denied permission stops sharing. Watch timeouts (standing still) and a lost signal are temporary.
  - With no fix for 8 s, the tracker asks for a fresh reading. It never re-sends an old fix.
- Captain Android app: Go online starts the native foreground service (`CaptainLocationService`, via `HopTracking` in `foregroundTracking.ts`), which keeps sharing location with the screen off and keeps reporting while parked (no minimum distance). It also registers ride alerts (`ensureRideAlerts`): requests ring on the "Ride requests" channel (`ride_request.wav`, made by `scripts/ride-request-sound.py`) and expire after 30 s. The server sends Firebase pushes as its own identity (`FCM_PROJECT_ID`, no key file).
- Rider map: the last captain fix stays on screen for 30 s before the car is hidden as out of date.
- Never leave a trip screen without a live ride behind it: the renderer would show its sample captain ("Arun Kumar") and pickup code. `LiveJourney.decorate` sends the app to payment or home, and the payment page restores itself if the renderer draws over it.
- Booking:
  - A new rider whose wallet can't cover the fare starts on Cash.
  - A `402 payment_required` opens the unpaid ride's payment screen.
  - The default route is the fastest by server time, not the router's first route.
- Cash and direct UPI (Nov 2026): the rider's "I’ve paid my Captain" (`cash_paid` → `rider_reported_paid`) lets them book again. The captain can confirm it (`payment_received`) or report "Cash not received" (`payment_not_received` → `driver_reported_unpaid`), which blocks booking until the rider pays by Wallet or online, or disputes.
- Ratings: after payment, each side rates the other once (1–5 stars, `POST /api/rides/{id}/rating`) on the payment page; `my_rating` shows the stored score.
- Money shows paise when present ("₹130.50"), and cards and footers use the same `money()` helper.
- Sounds (`shared/sounds.ts`):
  - One FM "chime" voice, a motif per event.
  - The captain ride-request alert repeats every 2.6 s until accept or decline (45 s max).
  - Rider sounds for captain found, captain arrived (doorbell), trip started and trip complete.
  - No sound on the first state load after opening, or while the app is hidden.

## Finding things cheaply
- Find a screen with `grep -n "<screen-id>" ../hop-platform/prototypes/mobile-first/app.js`, then read only that range.
- Find styles with `grep -n "\.selector" ../hop-platform/prototypes/mobile-first/style.css`.
- The design 03 component layer is the last section of `style.css`, marked `/* === Design 03 === */`.
- Status and audit history live in `docs/`. Read them only when needed.
