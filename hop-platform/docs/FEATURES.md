# Feature status and agent task board

## Trust, onboarding and expense statements (2026-10-26)

- Exact-number ownership in `verified_phones`; authenticated profile OTP challenges are separate from login. Booking, captain application/acceptance and going online require verified ownership. Profile updates cannot bypass the OTP flow. Production never returns development OTP codes, including when the client ID is `hop-web`.
- Private portrait and identity/licence/RC/insurance uploads: client preview/compression plus independent server JPEG/PNG validation, re-encoding and size limits. Production stores binaries in separate private GCS buckets, with metadata/checksums only in PostgreSQL. Startup rejects configured buckets without uniform access and enforced public-access prevention. Without configuration, production uploads fail closed. Development uses disposable in-memory images. See `PRIVATE-MEDIA.md` for access, retention, cost assumptions and setup.
- Four-step captain application with server-side drafts, verified mobile, vehicle make/model/colour, private evidence, review summary, corrections and resubmission. Changed approved-captain portraits/documents/names require review; active captain trips block identity changes. Admin can inspect private evidence with document-read auditing. Existing version-0 approvals retain their prior evidence path during rollout.
- Assigned rider cards show approved captain portraits and vehicle descriptors. Unrelated accounts cannot access media; riders cannot access KYC evidence. Current captain portrait access ends seven days after trip completion.
- Business-profile fields and downloadable PDF trip statements, including Android native save/share. Fare/name/business snapshots are immutable at completion; payment/refund annotations are separate and current at download. Statements are explicitly not GST tax invoices. Captain downloads omit rider business details. Older completed rides get a snapshot from available records on first download.
- Dispatch uses a bounded OSRM table shortlist before taking ride locks, with a 1.2-second timeout, short Redis ETA caching, provider-failure cooldown and estimated fallback. Favourite score bonus is capped at one minute-like unit, ratings are smoothed, and superseded/unseen offers no longer lower acceptance ranking. Visible offer cards acknowledge display; explicit declines and supersession have distinct outcomes.
- Migration: `031_trust_onboarding_receipts.sql`. Backend, three web apps and Android bundles must be released together. Configure real SMS and private GCS before real onboarding. No cloud resources are automatically created. Full legal invoice issuance, submitted-KYC retention policy, whole-account purge and physical-device/cloud-provider acceptance remain release prerequisites or separate work as documented.
- Carpool/commute expansion is on hold; this work does not add a personal-vehicle carpool product.

Single source of truth for what is built and what is open. Pick one **Open** item, work in its listed files, finish with the shared **Definition of done**, then move the row to **Built**.

## Conventions for every agent

- Backend: Go in `backend/internal/app/`, routes registered in `server.go`, migrations in `backend/migrations/` (next free number; restart API after migrating).
- Web: npm workspaces in `web/` (`apps/rider`, `apps/captain`, `apps/admin`, `packages/shared`); check with `cd web && npm run typecheck && npm run build`.
- Local Go is 1.25.5 while `go.mod` says 1.27.3: temporarily lower the `go` line to build, then restore `go.mod`/`go.sum`.
- Mutating API calls need `Origin` and `X-CSRF-Token`. Ride actions: `POST /api/rides/{id}/actions`.
- Demo data: `infra/dev_seed.sql` (drivers go stale after 60 s; re-run). Dev-only endpoints must stay behind `APP_ENV=development`.
- Do not commit secrets, keys, or `.env.local`.

### Definition of done

1. Type-check/build and `go vet ./...` pass.
2. Rider **and** driver end-to-end run for the feature (online → quote → book → offer → accept → arrive → start with PIN → complete → payment), via API script or browser.
3. Docs updated here and in `README.md`/`docs/API.md` when endpoints change.

## Built (verified against the code on 2026-10-24)

All 45 rider-facing requirements have a backend and UI implementation. An earlier version of this file listed several as unbuilt; that list was stale.

| Area | Feature | Where |
|---|---|---|
| Account | OIDC sign-in, phone OTP login (`/auth/otp/*`), profile, language preference, accessibility prefs | `auth.go`, `otp.go`, `PhoneLogin.tsx` |
| Location | Live GPS pickup, search/autocomplete, saved places | `useLivePickup.ts`, `places.go`, `customer.go` |
| Booking | Bike, auto, mini, sedan, SUV; fare estimate/breakdown; preferred vehicle | `quotes.go`, `VehicleCards.tsx` |
| Trip types | Rental/hourly, outstation, multi-stop (≤3), operator pricing | `trips.go`, `TripOptions.tsx`, migration 009 |
| Negotiation | Rider bid, driver counter, reserve a driver | `rides.go`, `RideNegotiation.tsx` |
| Dispatch | Staged scored dispatch (1.5/3/6/20 km), late-join sweep, favorite-driver-first window, first accept wins | `dispatch.go` |
| Scheduled | Worker converts scheduled rides to live requests 15 min before pickup | `trips.go` `DispatchScheduled`, `cmd/api/main.go` |
| Ride for others | Another person (name/phone) and family member booking | `rides.go`, `companion.go` |
| Payments | Cash, UPI (direct), online gateway with webhook | `payments.go`, `OnlinePay.tsx` |
| Live | Nearby drivers with category icons, `/nav` turn-by-turn, `/position` 1 s poll, SSE `/api/stream` | `live.go`, `LiveNavMap.tsx` |
| Safety/Support | SOS, trip sharing, complaints, lost items, ratings | `companion.go` |
| Growth | Referral/rewards, family accounts, notifications | `companion.go` |
| Voice, i18n | Voice booking, 10 language picker (dictionaries partial) | `VoiceBooking.tsx`, `i18n.ts` |
| Scale (new) | Redis GEO live-location layer; see `docs/SCALING.md` | `geo.go` |

## Open work

| ID | Item | Why / acceptance |
|---|---|---|
| S-01 | ✅ Event-driven SSE/push | Done — Postgres LISTEN/NOTIFY triggers (migrations 013/015) wake `stream`; 10 s safety tick. |
| S-02 | ✅ Dispatch from Redis GEO | Done — lease-based parallel dispatch over a Redis shortlist (migration 014). |
| S-03 | ✅ Shard geo keys by area | Done — keys are `geo:<area>:<category>`. |
| S-04 | ✅ Rider view reads Redis | Done — `state()` overrides `driver_lat/lng` with the live Redis ping during accepted/arrived/in_progress; falls back to the DB checkpoint if Redis is down or stale. |
| S-05 | ✅ Real web/mobile push (FCM/APNs/Web Push) | Done — Web Push (VAPID): `push.go`, `web/public/sw.js`, migration 016. FCM/APNs native still open. |
| S-06 | ✅ Complete translations | Done — all 10 languages cover nav, booking, trip status and driver duty strings (`i18n.more.ts`). Remaining screens still fall back to English. |
| S-07 | ✅ Go integration tests | Done — all pass with `-race`. Run with `TEST_DATABASE_URL` (db name ending `_test`) and `TEST_REDIS_URL` (Redis DB 15). Tests dispatch via `f.dispatch()` before drivers accept. New coverage: push SSRF allowlist, outbox lease, Redis live index, event hub. |
| S-08 | Own OSRM and geocoder; OSRM table API for dispatch ETA | Public servers are dev-only. |
| S-09 | Read replica + PgBouncer; partition `ride_offers`, `audit_events` by month | Needed before six-figure daily rides. |
| S-10 | Driver KYC document storage, surge pricing, observability, load tests, native driver app | Production readiness. |
| S-11 | Split `App.tsx` (989 lines) | No behavior change. |
| S-12 | Browser-verify live maps with a Google Maps key | Headless Chrome cannot render them. |

## Known limits

- SSE works in browsers only; no mobile push.
- Public OSRM/Photon are dev-only; dispatch ETA uses haversine.
- Real Razorpay, SMS and production load behaviour are unverified.
- Navigation updates every 1–3 s, not continuous streaming.
- The driver demo auto-drive (Developer tools) is development-only.

## Rider experience redesign (done)
- `POST /api/estimates`: all vehicle fares for one route (cheapest tag) → `RideOptions` list.
- In-ride chat (`/api/rides/{id}/messages`, migration 018) for rider (`TripHero`) and driver (`DriverPanel`), with quick replies and push/SSE notifications.
- `TripHero`: live-trip hero with driver card (rating, trips, plate), pickup PIN, chat, share, 112 and SOS.
- `QuickPlaces`: saved and recent destination chips.
- Still open: step-based bottom-sheet layout, navigation voice guidance/traffic layer, browser screenshot verification.

## Booking redesign (done)
- Service area is auto-detected from GPS (no dropdown); outside every area shows "Service isn't available in your area yet"; denied GPS offers city chips.
- Map + bottom-sheet stage with a 3-step flow (Where to → Choose ride → Confirm), responsive (map on top, sheet over it on mobile).
- `MapBoundary` keeps a failing map (quota/key) from blanking the app.
- Open: Google Maps demo key quota is exhausted in dev — set `VITE_GOOGLE_MAPS_API_KEY`; restyle history/support/profile/driver tabs; nav voice guidance/traffic layer.

## Maps, navigation and tab redesign (verified in browser)
- Map layer (`web/src/mapkit.tsx`): OpenStreetMap/Leaflet by default; Google Maps only when `VITE_MAP_PROVIDER=google` and `VITE_GOOGLE_MAPS_API_KEY` are set. Production should set `VITE_TILE_URL` to a hosted tile provider (the public OSM tile server is for development only).
- Live navigation on OSM: heading marker, turn banner, ETA, voice guidance with mute, speed readout, open-in-Google-Maps link.
- Restyled tabs: per-tab headers, ride/trip summary strip, support quick-action cards, two-column safety & more page.
- Satellite layer toggle (Esri imagery, remembered per device). Not done: traffic layer (needs Google Maps with billing).

## Money, payouts and operator tools (done, API + browser verified)
- Surge/peak pricing: operator peak windows, per-area overrides and auto surge by demand (capped by `areas.surge_cap`); shown as ⚡ on ride options and a quote row. Not applied to outstation.
- Promo codes (percent/flat, caps, limits, per-rider, area) applied at quote; platform funds the discount so drivers get the gross fare.
- Rider wallet: top-up (Razorpay, or dev credit in Development), pay rides by wallet, refunds go to wallet.
- Driver earnings: 7-day chart, ledger, payout requests (min ₹100) with operator approve/reject.
- Operator finance panel: totals, payout queue, ride search + refund (optional driver claw-back), promos, surge, safety scores.
- Masked calling endpoint (simulated number in Development; returns 503 elsewhere) and driver safety score.
- Rating shown as ★ avg (count) or "New driver"; sticky Book button; translations for new screens (10 languages).
- Not done: FCM/APNs native push, real telephony provider for masked calls, traffic map layer, Web Push test in a real browser.

## Rich profile (done, API + browser verified)
- Profile page: avatar colour, verified-mobile badge, member-since, rider rating, stats (rides, km, spend, wallet, reward points).
- Editable details: name, mobile, gender, date of birth (16+). Ride defaults (payment method, usual vehicle) pre-fill booking.
- Up to 5 emergency contacts, saved places list/remove, language picker, shortcuts to accessibility, wallet and support.
- Privacy: download my data (JSON) and account-deletion request with a 30-day cancel window.
- Not done: photo upload, mobile-number OTP verification for added numbers, automatic alerts to emergency contacts (needs an SMS provider), the automatic purge after the deletion window.

## Admin, pink rides, driver insights (done; Go tests + browser verified)
- Admin console (`/?admin=1`, operators; also a button on the Operator tab): driver/vehicle queue, 6-point verification checklist (identity, licence, RC, insurance, vehicle, police), expiry check, review note, Enable/Disable. A driver can only be approved with a full checklist.
- Pink rides: female riders (profile gender) can request women-only rides; dispatch and nearby view use only pink-certified women drivers (admin certifies). Gender is self-declared for riders.
- Driver "Fare and payment summary": distance, time on trips, avg fare and ₹/km, pickup wait, rating, 7-day chart, areas travelled, busiest hours, payment/trip mix, per-trip details (estimate vs actual time).
- UI: Mantine adopted for place search, right rail, admin console, insights; rest still old styling.
- Counter-offer fix: rider/driver get in-app notifications on each status change and see "waiting for driver to confirm".
- Not done: traffic/3D/dark map, airport pickup points, low-data mode, rider-ID verification for pink rides.

## Maps, pin picker, moments (done; browser verified)
- Map layers (Google): live traffic, 3D tilt, night map (auto 7pm–6am / on / off). 3D buildings and the true dark style need a vector Map ID in `VITE_GOOGLE_MAP_ID` (the demo ID only gives traffic).
- Centre-pin picker: drag the map under a fixed pin; address, nearest-cab ETA and official airport/railway bays shown before confirming.
- Airport/railway pickup points for 7 cities (`web/src/hubs.ts`; coordinates are approximate, verify before launch).
- Low-data mode (or browser Save-Data): slower polling, no traffic/3D/night/animations, no side rail.
- Moments: booking, driver-accepted (rider and driver), trip-completed animations; sign-out confirmation (warns about active ride/driver mode); late-night Pink-ride nudge for women riders.
- Route alternatives: `POST /api/routes/alternatives` (up to 3 routes); quote accepts `route_index` and prices the chosen route. Chips on the Confirm step (fastest/shortest).
- Offline maps: service worker caches OpenStreetMap tiles (cap 600); low-data mode switches to OSM and "Save this area offline" stores ~100 tiles. Google tiles can't be cached (terms).

## Three separate apps (done; browser verified)
- Three web projects in an npm workspace under `web/`, one Go API:
  - `apps/rider` (port 5173, indigo): customer app.
  - `apps/captain` (port 5174, yellow/black taxi design): driver app with its own landing page.
  - `apps/admin` (port 5175, dense slate/blue): operator console with its own landing/sign-in page.
  - `packages/shared` (`@hop/shared/*`): API client, session hook, i18n, maps, ride card, chat, phone login, base CSS, service worker.
- Each app has its own entry, Mantine theme, theme CSS, landing page and build (`web/dist/{rider,captain,admin}`). Files used by one app live in that app; files used by two or more live in `packages/shared`.
- Dev: `cd web && npm run dev` starts all three (or `npm run dev -w @hop/captain`); `/api` and `/auth` proxy to :8080. Cookies ignore ports, so one login works on all three. Each app's `.env.development` sets `VITE_RIDER_URL`/`VITE_CAPTAIN_URL`/`VITE_ADMIN_URL` so role redirects jump between ports (rider→captain 5174, operator→admin 5175); in production leave them unset or point them at the real hosts.
- Rider and captain use the same shared map engine (`mapkit`, `MapControls`, `MapExtras` layers/toolbar). Map preferences are stored per browser origin, so each port keeps its own copy.
- The Go server picks the app by hostname (`admin.`, `captain.`) or path (`/admin`, `/captain`), serves `WEB_DIR/<app>/index.html`, and finds built assets in the app's own folder first, then the others (so old pages survive a deploy).
- Role routing: operators go to the admin app, drivers to captain, "Become a driver" opens captain.
- Performance: hashed assets cached a year, gzipped in memory, code-split chunks, tile preconnect.

## Driver tools (done; Go tests)
- Waiting charge (first 3 min free, then ₹2/min, cap ₹100; solo rides only), migration 025.
- Go-home mode (90 min, 2 uses a day): hides rides leading away from home in both offers and dispatch.
- Daily earnings goal with progress bar; break reminder after 4 h online.
- Demand cells include driver supply; the hot-zone card ranks by unmet demand.

## Registration validation (done; Go tests)
- Sign-in and all POSTs accept the public origin, `ALLOWED_ORIGINS`, and (development only) localhost on any port, so the separate app ports no longer get "Request origin or CSRF token is invalid".
- Driver application: field-specific messages for area, vehicle number (normalised, 6-12 letters/digits), licence and insurance numbers, UPI ID and unexpired/realistic dates; the same checks run in the browser first (`packages/shared/src/validate.ts`). Phone sign-in shows inline errors for the number and the 6-digit code.

## Admin sidebar
The admin app uses a left sidebar (Fleet, Pricing, Money, Safety) with one section per screen instead of one long page; the section is kept in the URL hash.
