# Hop mobile-first experience prototype

Branch: `codex/mobile-first-prototype`.

## Purpose and boundaries

A local, interactive design review of two mobile-only products: Rider and Captain. Admin remains the existing web application. The Go backend, database, API contracts, pricing, payments, dispatch, auth and current app implementations are unchanged.

This prototype uses fixed, explicitly labelled sample data. It performs no business API requests, sends no messages/SMS/invitations, makes no bookings or payments and changes no real account. A sample balance, earnings chart or trip status is a design state, not live service evidence. The schematic map is not Google Maps or real navigation.

Run locally from this directory:

```sh
python3 -m http.server 5280 --bind 127.0.0.1
```

Open `http://localhost:5280`. The existing apps continue at their existing addresses. No new dependencies are required. Font loading is optional; system fallbacks work offline.

## Review

- Use Rider/Captain switches and the screen selector on desktop.
- On a phone-sized viewport, use the preview strip to switch roles or open Screens. That strip belongs to the review tool and is not proposed production app navigation.
- Use **Next journey step** to simulate external events such as matching a captain; riders cannot advance real trip states themselves.
- Rider path: home → search → vehicle (with route alternatives) → review/options → request → match preview → tracking → receipt/rating. Plus **Hop Commute** corridor carpooling and proactive **RideCheck** anomaly safety.
- Captain path: drive (with Operating Service Area) → incoming request (with 15s expiration countdown) → pickup (with Cockpit Navigation HUD) → arrive → sample code `431602` → trip (with turn maneuvers & telemetry) → completion/payment → dynamic earnings switcher (Today, This week, This month).
- The demonstration code has six digits, matching the current pickup-code format. The real app must preserve the backend’s actual pickup-code length, validation, expiry and attempt limits.
- Activity, wallet, account, commute, cockpit navigation, support, safety, preferences, family, saved places, rewards, onboarding, documents, driver tools, payouts and insights have separate screens.
- All sample forms/actions remain local.

`strategy.html` is the readable product direction, migration gates and feature coverage. It also links back to the interactive app.

## Proposed architecture, subject to native proof

- Rider and Captain: separate React Native + Expo development-build targets sharing branded native primitives and pure TypeScript domain code.
- Admin: existing React app.
- Backend: existing Go API and existing database. No new services or migrations for this redesign.
- Keep the existing mobile auth exchange, session and CSRF semantics through a tested native transport adapter. Do not replace auth with a new token contract merely to use a new UI framework.
- Keep fare/quote, dispatch/acceptance, payment/settlement, ownership and lifecycle validation server-authoritative.
- Maps use native presentation, but existing routing coordinates/geometries and pricing APIs remain authoritative. Map provider integration is not proved by this visual prototype.
- Captain background location requires a physical-device proof using the existing native lifecycle semantics, potentially bridging the current Android service. Do not assume Expo Go or a browser preview proves background location.
- Existing DOM/Mantine/CSS components and browser map widgets need native equivalents. Reuse pure types, formatting, validation and applicable domain logic after dependency inspection; do not claim all existing frontend code is portable.

An existing `docs/ARCHITECTURE.md` proposes Flutter. This prototype does not silently overwrite that proposal; it adds a reviewable React Native direction based on the current TypeScript implementation. The framework decision follows the native capability proof.

## Feature parity gate

The feature groups in `strategy.html` are mapped from current Rider/Captain/shared source, `docs/API.md`, `docs/ANDROID.md`, and `docs/FEATURES.md`. Older feature documentation contains contradictory built/open notes; the implementation and endpoint tests take precedence. Before migration, record each feature’s exact source, API/payload, validation, replacement screen and test evidence. A prototype screen is not feature-integration completion.

No removal of existing features is authorised. Every feature must have a native implementation or an explicitly approved disposition before cutover. Keep existing clients operational until parity is established.

## Layout rules

- Production app navigation and primary actions occupy dedicated rows.
- Search gets its own screen and keyboard space.
- Optional controls use sheets or secondary screens.
- Long history, settings and document content may scroll in one bounded content region. Do not shrink text, clip fields or hide actions to promise zero scrolling on every device.
- Physical keyboard, text scaling, safe areas, permission prompts and screen-off/native lifecycle require real-device testing later.

## Verification performed

- JavaScript syntax check: `node --check app.js` passed.
- Prototype Playwright suite: **17 tests passed** (including Hop Commute carpooling, Cockpit HUD, Service Area management, dynamic earnings, RideCheck safety, chat simulation, radar dispatch, multi-offer switcher, race condition resolution, and OTP autofill).
- Every listed Rider/Captain screen checked at 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 pixels.
- Sample Rider booking/options/chat and Captain six-digit pickup-to-completion journeys exercised.
- Wallet amount validation, local family invitation and pending-review onboarding exercised.
- A 320 × 640 viewport with dark appearance and larger text checked for bounded sheets and visible primary actions.
- Prototype screen sweep observed no `/api/` or `/auth/` requests.
- Desktop and phone review views inspected; this does not verify native hardware, real payments, push or background location.

Run from `hop-platform/web`:

```sh
npx playwright test --config ../prototypes/mobile-first/playwright.config.mjs --fully-parallel --workers=3
```

The isolated server above must be running first. The test config reuses the repository's existing Playwright installation and writes results under `/private/tmp/hop-mobile-prototype-results`.
