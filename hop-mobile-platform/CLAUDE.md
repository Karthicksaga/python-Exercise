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
- Map declutter (Nov 2026, requested after phone testing):
  - The map status chip (`.hop-map-status`) shows only problems (location off, GPS not shared, feed errors). Normal states in `QUIET_STATUS` (`PrototypeMap.ts`) are visually hidden but still read by screen readers; the text keeps the provider name for tests.
  - Map buttons are one column at the bottom right of the map, just above the sheet (`--hop-map-height`, set in `PrototypeMap.size`), and a row when the map is under 360 px tall. "Follow me" and "Show full route" show only when a route is drawn (`data-has-route`, set in `PrototypeMap.paint`). Booking hides "Centre map". GPS sharing is hidden on Demand nearby.
  - "Replay route" is an icon-only button.
  - With a route drawn, "Centre map" is hidden (Follow me recentres), so trip screens show at most three buttons. GPS sharing shows only on the Drive screen. Map buttons, status and replay are hidden while a pop-up sheet is open. A problem message sits at the bottom left of the map.
  - Route framing (`framePadding` in `pins.ts`) keeps a wider right margin (up to 130 px) on maps at least 360 px tall, so pin labels and the button column don't cover the route; short maps keep 45 px.
  - The route preview's travelling vehicle is the category the rider picked (bike, auto, mini, sedan, SUV), read from the renderer state (`PrototypeMap.selectedVehicle`) and passed to `setPreviewVehicle` on OSM, Google and the native map. It used to be hard-coded to "sedan".
  - Both apps ask for the phone's location when the map first opens, so a newly approved captain gets the permission prompt and sees their real position, not the last server fix.
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
- Captain matching (Nov 2026): a request is offered to one captain at a time; the request screen shows "Only you have this request · N s". A "Next ride" card appears on the captain's trip screen when they're finishing a trip near a new pickup (`LiveJourney.nextRideCard`); completing the trip opens its payment first, then the next pickup. The rider's search screen says a captain is finishing a trip nearby.
- Payment actions fetch the ride's latest version first (`LivePayment.act`): the other person may have just changed it.
- Rider map: the last captain fix stays on screen for 30 s before the car is hidden as out of date.
- Never leave a trip screen without a live ride behind it: the renderer would show its sample captain ("Arun Kumar") and pickup code. `LiveJourney.decorate` sends the app to payment or home, and the payment page restores itself if the renderer draws over it.
- Booking:
  - A new rider whose wallet can't cover the fare starts on Cash.
  - A `402 payment_required` opens the unpaid ride's payment screen.
  - The default route is the fastest by server time, not the router's first route.
- Cash and direct UPI (Nov 2026): the rider's "I’ve paid my Captain" (`cash_paid` → `rider_reported_paid`) lets them book again. The captain can confirm it (`payment_received`) or report "Cash not received" (`payment_not_received` → `driver_reported_unpaid`), which blocks booking until the rider pays by Wallet or online, or disputes.
- Chat (Nov 2026): `shared/chat/ChatSession.ts` (reusable, no UI) and `RideChat.ts` (trip chat screen). Long polling on `/api/chats/{id}/wait`; every message has a device-made `client_id`, so retries never duplicate; unsent messages survive a restart. The chat header and bubbles show real first names, never the preview's "Arun". Statuses: Sending… / Sent / Seen / Not sent · Tap to retry. The trip screen's Message button shows an unread count ("Message, N unread"). Contract in `hop-platform/docs/API.md` under "Chat".
- Captain screens (Nov 2026): once approved, Account hides the "Join as Captain" card and onboarding row (the application stays under Vehicle & documents). Vehicle & documents shows the vehicle type's art. Earnings: today, then week/month/all-time tiles, a Ledger & payouts row, recent trips. Drive sheet: "Daily goal" shows today against the captain's goal ("no goal set" when 0), and the row under the bar shows the real trip count.
- Trip screens (Nov 2026 audit): riders never see the review build's "Switch to Captain perspective" link; the rider header says "Your captain is here" on arrival; the captain's request shows real pickup distance (from their last fix), trip time (quote `seconds`) and payment method, with no sample rider name; the navigation button reads "Full-screen navigation". The fare and meeting sheets have no "sample" text. The payment page has one main button with the other actions as a lighter row.
- Rider trip sheet (Nov 2026, simplified; `LiveJourney.decorateTripSheet`, styles in `responsive.css` under `.live-trip-sheet`): headline ("Murugan arrives in 4 min" / "Murugan is here" / "Arriving in N min"), captain with a large plate, the pickup code (compact while the captain is coming, highlighted on arrival; e2e reads it from the sheet), one action row, and a "Trip details or cancel" link. The wait time comes from the map feed (`hop-trip-eta` event from `liveFeed.ts`), so sheet and pickup pin agree. Onboarding review counts required documents uploaded ("7 of 7 uploaded").
- Copy: user-facing text never says "backend" or "server" (e.g. "Live prices", "Estimated fare", "Fare locked", "Confirmed by Hop"). The live wallet hides the renderer's sample HOP50 offer, and Saved places suggestions never carry an invented address.
- Captain onboarding "Testing mode" is offered only when `/api/drivers/onboarding` returns `testing_mode: true` (development, or `DEV_ONBOARDING=true` on staging); otherwise the server still requires documents.
- Matching never offers a ride to the account that booked it. Rider and Captain apps signed in with the same phone number are the same account, so testing a full ride needs two phone numbers.
- Ratings: after payment, each side rates the other once (1–5 stars, `POST /api/rides/{id}/rating`) on the payment page; `my_rating` shows the stored score.
- Money shows paise when present ("₹130.50"), and cards and footers use the same `money()` helper.
- Phone-test fixes (Nov 2026, second round):
  - Launch: Android splash is the indigo mark on ink (`res/drawable/ic_hop.xml`, `#14151F`), then the inline launch screen in `apps/*/index.html` (`#hop-launch`), which `mountPrototype` fades out on `ready()` (15 s fallback).
  - Motion (approved "Hop Launch Motion" preview), styles at the end of `animations.css`: search skeleton rows and highlighted results, a sweeping step and pickup rings (`.hop-pin-wave`, OSM) while finding a captain, and trip moments from `shared/design/tripMoments.ts` (`playMoment` chip + `#app[data-hop-moment]`, `countUp`). Payment success shows a tick burst (paid) or a ₹ stamp (cash), once per status.
  - Bottom navigation is docked to the bottom edge (no floating pill), and on map screens the action bar continues the sheet.
  - Full-screen navigation (`cockpitHUD`) is a map screen: next turn on top, real time/distance/destination and the trip action below, plus "Google Maps" (`external-nav`, opens Google Maps turn-by-turn). No speed, limit or lane data.
  - Pickup code boxes are cleared for each new ride (`LiveJourney.pinRide`); typing keeps the new digit and a pasted code fills the boxes. Mixed old/new digits caused "Incorrect pickup code" on staging.
  - Payment actions retry once on "Ride changed" (both people tapping at once). A cash ride's payment page opens on "I’ve paid my Captain"; "Change method" shows the other options. No pop-up when the app switches a short wallet to Cash.
  - Money figures in `LiveAccount` (earnings, wallets, insights) reload when any trip's status or payment changes, and after 60 s.
- Sounds (`shared/sounds.ts`):
  - One FM "chime" voice, a motif per event.
  - The captain ride-request alert repeats every 2.6 s until accept or decline (45 s max).
  - Rider sounds for captain found, captain arrived (doorbell), trip started and trip complete.
  - No sound on the first state load after opening, or while the app is hidden.

## Phone-test fixes (Nov 2026, third round, from screenshots)
- After a trip ends, `LiveJourney.clearPlan()` clears the old pickup, drop-off and route, so home maps on both apps start clean. This was the "same pickup and drop" report.
- A pickup chosen by tapping the map gets its street name from `/api/places/reverse` ("Pinned location" if that fails), never raw coordinates.
- Route fields show focus with an indigo label and dot halo, not a box over the label (`responsive.css`).
- Vehicle rows: priced ones say "Captains checked when you book"; others say "Not available for this trip" and are dimmed.
- Payment page: plain titles ("Cash received." for the captain, "Paid to your Captain." for the rider), "Received by Captain" status, "Cash" not "CASH". The action links use flex, so a lone link is centred.
- Trip cards: short dates ("5 Nov, 6:31 pm"), readable status and vehicle words, one wrapping link row. "Showing your 50 most recent trips" only appears at 50.
- The captain's GPS sharing button stays. Reopening the app while online needs it to resume sharing (see the maps test).
- A ₹25 charge against a ₹62 estimate is the early-finish fare (`earlyFinishQuote`, `rides.go`): the captain completed about 3 km short of the drop-off.
- Design audit: `npm run test:audit` (`tests/design-audit.spec.mjs`, uses `@axe-core/playwright`) checks the flush bottom nav, no sideways scroll, tap targets and critical accessibility issues on phone sizes, with screenshots in the report. Review workflow: `.agents/skills/hop-design-review/SKILL.md`.

## Compact redesign (approved Nov 2026; preview https://claude.ai/artifact/78gPbf4hv57Yr89QFL51Ay)
- **Slide to confirm** (`shared/design/slideToConfirm.ts`): Captain "Accept ride" (70%) and "Complete trip" (85%).
  - The renderer's button becomes the knob, so its handlers, name and Enter/Space keyboard path stay. A pointer tap alone is stopped in a window capture listener and nudges the knob.
  - Tests confirm with `.press("Enter")`, or drag (see `tests/compact-redesign.spec.mjs`).
- **Early finish:** "Complete trip" first sends `complete` without `confirm`. On 409 "Early finish…" the captain sees the server's message (reduced fare) in a confirm dialog, and only "yes" resends with `confirm: true`. The full-ride tests accept that dialog.
- **Online switch:** an approved captain's `[data-action="online"]` button is moved into `.app-head .head-tools` and styled as a switch ("Online" / "Go online", `aria-pressed`). Unapproved captains keep the bottom button. The GPS sharing map button stays.
- **Cash change helper:** `LivePayment.changeHelper` ("Rider gave" Exact / next notes → "Give back ₹…"), on the captain's cash page only. It runs on the phone, with no API call.
- **Choose your ride:** when some vehicles are priced, the unpriced ones fold into one dimmed "Cars" / "Other rides" row. Real names are kept in `data-live-name`.
- **Not built yet:**
  - The pickup-spot screen needs server data for named spots.
  - Merging Review into Choose your ride: the vehicle route preview stays on Review.

## Phone-test fixes (Nov 2026, fourth round)
- **Profile photo:** if `createImageBitmap` can't decode a phone photo (Android WebView: "The source image could not be decoded"), `loadImage` decodes it through an `<img>`. The picker accepts `image/*`.
- **Account status line** ("Personal details saved.") is cleared when the screen changes (`LiveAccount.statusScreen`).
- **Pop-ups the account layer doesn't fill** (Appearance, Language…) still get the live page drawn under them (`ownModal`); before, the renderer's sample page showed through.
- **Dark mode** is remembered on the phone (`localStorage` "hop-dark"). With no choice yet, it follows the phone's setting.
- **Captain earnings:** the drive sheet's real earnings are filled in while a pop-up is open too. The ₹1,260 was the renderer's sample.
- **Operating city:** an approved captain sees their city and "Contact support" (there is no city-change API yet), not "View Captain Application".
- **Phone alerts:**
  - The notifications screen shows the real state (on / off in settings / not asked) from `notificationStatus()`.
  - If Android has blocked alerts, the button opens Hop's notification settings (`HopPushGuard.openSettings`, both apps).
  - Errors show their real message instead of the generic "Stay in the loop" sheet.
- **Swipe between tabs** (`shared/design/swipe.ts`, `enableTabSwipe`): on any screen with a `.tabs` bar (Activity/Trips, Notifications, Earnings periods) a sideways swipe clicks the neighbouring tab (left → next, right → previous) and the new content slides in. Maps, sliders, inputs and sideways-scrolling rows keep their own gestures. Touch events, since Android cancels pointer events once it scrolls.
- **Mark one notification read:** each unread card has a "Mark read" button → `POST /api/notifications/read {"id"}` (new optional field).
- **Nearby captains** show on the rider map only while booking, not on the home screen (`PrototypeMap.browsingHome`).
- **Rider home (compact redesign):** a slim search bar under the header, and four tiles (Home, Work, Rental, Outstation) plus the usual ride in the sheet. Home and Work keep the saved address in their accessible name. Trip types are still also in "Plan a ride".
- **Razorpay:** the checkout pre-fills the verified mobile (falls back to `/api/profile` when the order has none). `ViewportController` doesn't resize the app while the checkout iframe has focus, which dropped the keyboard after each digit.
- **Captain ledger:** a "To pay out" hero that explains cash is already the captain's, today's earnings and trips, an activity list, and a payout button only when there is a balance.

## UI polish pass (Nov 2026, all 44 screens reviewed at phone size)
- Chat: the message box fills the bar. The header says "Your captain" (not "Your captain · your captain") until a name is known.
- Error notes (`.notice-box[role=alert|status]`): readable text with a normal-size button, not a full-width one.
- Captain Drive sheet: the city is a quiet outlined chip and the headline is 22 px.
- Trip cards: "Book again", then one even row of Receipt · Report an issue · Statement. Addresses clamp to two lines.
- Vehicle & documents: status "Approved" with a "✓ Ready to drive" badge (it used to repeat "approved"). Profile photos that fail to load fall back to the initial.
- Online switch shows only the toggle under 360 px wide, or with large text under 400 px (its text stays the accessible name).
- `npm run test:audit` now covers 27 screens (13 rider, 14 captain incl. home/route/drive) at 360 and 412 px.

## Approved prototype, phase 1 (Nov 2026; prototype https://claude.ai/artifact/SSuyWApGcrtBFFugtqA1r1)
- **Button system** (`animations.css`, "Button system"):
  - The bottom `.action-bar` is flat and edge to edge. Its `.primary` or slide runs full-bleed on the bottom edge (60 px + safe area, square corners).
  - Notes, the fare line and small text actions sit above it (`order`).
  - Sub-page main actions are docked there, not mid-page: mark the button `data-dock` and `LiveAccount.dock()` moves it. Used by Saved places "Save destination", Your people "Invite family member", Vehicle "View application…" and Ledger "Request payout of ₹…".
- **Slides** (`slideToConfirm.ts`, `SLIDES`) cover every trip step and money record:
  - Accept (70%), I've arrived, Start trip, Complete trip, captain "Record payment received" (it records at once; the old "Yes, payment received" step is gone), rider "I've paid my Captain".
  - `LivePayment.render` calls `enhanceSlides`. Tests confirm with `.press("Enter")`.
- **On the trip:** the rider has no Call or Message (CSS on `.live-trip-sheet[data-phase="in_progress"]`), and the captain's trip screen hides Message. Safety, Share and navigation stay.
- **Hop originals** (`shared/design/tripExtras.ts`):
  - **Fair wait clock:** rider tracking, captain pickup and code screens show the same countdown from `ride.arrived_at` (new in `/api/state` for `arrived` rides). It uses the server's rule: 3 min free, then ₹2/min up to ₹100 (`waitChargeSQL`).
  - **Pickup beacon:** the rider's "Light up my phone" fills the screen with a colour picked from the ride id (`beaconFor`). The overlay sits on `<body>` so redraws don't remove it. The captain sees "Look for a teal phone".
  - **Fare story:** on the payment page, built from `quoted_fare_paise`, `wait_charge_paise`, `adjusted_from_paise`/`covered_meters` (early finish), `discount_paise` and `payable_paise`.
- **Profile photo:** one sheet for both apps (`LiveAccount.openPhotoSheet`): Take a photo (`capture="user"`) or Choose from gallery.
- The Captain onboarding portrait keeps its own camera step.

## Approved prototype, phases 2 and 3 (Nov 2026; backend migration 041, `internal/app/originals.go`)
All helpers are in `shared/design/tripExtras.ts` unless named; styles are in `animations.css` under "phases 2 and 3".
- **Ride notes:** the rider picks Quiet ride / Luggage / Help boarding / On a call on Review (`notesPicker`, `.hop-notes`); they go with the booking as `notes` (codes only, server checks them). The captain sees them on the request and pickup screens in their own app language (`notesCard`, `NOTE_LABELS`), English underneath.
- **Low rating:** 1–2 stars shows "What went wrong?" chips (`LivePayment`, `LOW_REASONS`); the picks are sent as the rating `comment`.
- **Arrival alert and SMS updates:** rider trip sheet switches (`alertToggles`) post `/api/rides/{id}/alerts`. The server texts the first emergency contact on completion and saves `arrival_alert_status`; the payment page says what happened (`arrivalResult`). Without an SMS provider the switches say "test mode" or "not set up" and never claim a text was sent.
- **Chai break:** after 4 h online the captain Drive screen offers a 15 min break (`breakCard`, `/api/drivers/break`); requests pause, they stay online. "Take a break" in Driver tools does the same (it used to go offline).
- **Home by:** Driver tools "Be home by" time (`LiveAccount.homeByRow`, `/api/drivers/home-by`). From an hour before, only rides towards home. Home is the saved go-home spot, or the current location (the app says so).
- **Language bridge** (`RideChat`): messages from the other person show in your app language. Quick replies use the fixed `QUICK_TEXT` table; other text has a Translate button only when the server has `TRANSLATE_API_KEY` (`translate_available`). "Show original" is always one tap away.
- **Voice destination** (`shared/design/voice.ts`, rider only): mic on search, pick English/Tamil/Hindi, Android's speech screen fills the destination. Needs the native plugin `@capacitor-community/speech-recognition` and `RECORD_AUDIO`; on the web it says it isn't available.
- Tests: `tests/compact-redesign.spec.mjs` (phases 2–3 block), the notes test in `completion.spec.mjs`, the language bridge test in `journey.spec.mjs`, backend `originals_test.go`.

## Finding things cheaply
- Find a screen with `grep -n "<screen-id>" ../hop-platform/prototypes/mobile-first/app.js`, then read only that range.
- Find styles with `grep -n "\.selector" ../hop-platform/prototypes/mobile-first/style.css`.
- The design 03 component layer is the last section of `style.css`, marked `/* === Design 03 === */`.
- Status and audit history live in `docs/`. Read them only when needed.

## OpenStreetMap in 3D, landmarks and Hop layers (Nov 2026)
- **`shared/maps/maplibre.ts`** is the OpenStreetMap view wherever the phone has WebGL (`webgl.ts`). It uses MapLibre directly, so the map can tilt. `osm.ts` (Leaflet) stays as the fallback (no WebGL, or `VITE_MAP_STYLE=raster`). If the vector server fails, MapLibre switches to image tiles itself.
- **Style** (`vectorStyle.ts`, used by both views):
  - 3D buildings (`building-3d`, from the tiles' `render_height`).
  - Landmark badges (`landmarks`: temples, petrol bunks, bus stops, metro or rail, hospitals, malls).
  - One-way arrows from zoom 16 (`oneway-arrows`).
  - Icons are drawn on a canvas in `mapIcons.ts` and supplied on `styleimagemissing`, so no sprite server.
- **3D:**
  - A "3D" button in the map controls (`data-map-3d`, `PrototypeMap.decorate3D`) tilts or flattens the map.
  - On a live trip it also turns on Follow me: the driving view, tilted 55°, heading-up, more road ahead.
  - Overviews (`fit`) are always flat and north-up, at whole zoom levels like the old map.
  - Low-data mode keeps the map flat. Choosing "off" is remembered (`localStorage hop-map-3d`).
- **Pins and vehicles** are HTML markers. Pins stand upright; vehicles and "you are here" lie flat on the road.
- **Landmarks near the pickup:** the pickup callout adds "near Central Station Bus Terminus" (nearest named landmark within 160 m, read from loaded tiles). It shows while booking, and for the captain until pickup.
- **Suggested pickup points:** while booking, zoomed in (≥ 15), up to 3 nearby stations, bus stops, hospitals or malls show as tappable pills (`.hop-pickup-suggest`, 44 px targets); a tap moves the pickup there. They come from the map data, not the server.
- **Hop layers:**
  - Outside the service area is shaded with a dashed edge (zones from `/api/config`, `setServiceAreas`).
  - An online captain on Drive with no trip sees the demand glow from `/api/drivers/demand`, refreshed every minute (`setDemand`).
- **Route labels** for other route options slide along their route until clear of the top bars. Fitting includes the other options.
- **Tests:** markers are `.hop-map-marker[title=…]`. The canvas has `data-route` and `data-alternatives`, and `hopDebug` (route, project, vehicle, pitch, bearing, nav, overlay). See `tests/map-3d.spec.mjs`.
- **APKs** still show Google Maps when a Google key is set (CI sets one). The OpenStreetMap map shows when Google is unavailable or with `VITE_MAP_PROVIDER=osm`.
