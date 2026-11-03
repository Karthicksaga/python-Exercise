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
- Maps: pickup marker and route use indigo, the drop-off pin uses ink, and the "you are here" dot stays blue (`#2677df`). OSM tiles are muted by a CSS filter; Google uses the `hopDay` style in `shared/maps/google.ts`.
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
```
`tests/support/mockBackend.mjs` provides the API fixtures, so no backend is needed for tests.

## Finding things cheaply
- Find a screen with `grep -n "<screen-id>" ../hop-platform/prototypes/mobile-first/app.js`, then read only that range.
- Find styles with `grep -n "\.selector" ../hop-platform/prototypes/mobile-first/style.css`.
- The design 03 component layer is the last section of `style.css`, marked `/* === Design 03 === */`.
- Status and audit history live in `docs/`. Read them only when needed.
