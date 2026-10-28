# Hop mobile: approved prototype with live journey adapters

Rider and Captain share the approved renderer, Outfit/Inter fonts, tokens, assets, sheets and navigation from `../hop-platform/prototypes/mobile-first/`. No production application UI is reused. Backend services remain unchanged.

## Run locally

```sh
npm run dev:rider
npm run dev:captain
```

Open Rider at http://localhost:5183/ and Captain at http://localhost:5184/. Existing servers on 5173/5174 and Docker apps on 5273/5274 are separate applications. Use the same hostname consistently: localhost and 127.0.0.1 have different session cookies. Local ignored `.env.local` files select the existing backend and Google configuration.

## Connected functionality

- Existing account phone/SMS sign-in, verification and sign-out. Development codes appear only when the backend explicitly reports development mode.
- Real pickup/destination search, selected coordinates, service-area checks, current-location pickup, map pin selection and backend road-route drawing before booking.
- Current-position blue pin, Follow me toggle, manual-pan pause and full-route framing in both map providers. Viewing the full route pauses follow mode. Live sheets keep at least 180px for reachable map controls on short screens and retain internal scrolling.
- Google Maps with automatic OpenStreetMap fallback. Existing keys stay in ignored environment files. Source maps are available with `?map=reference` for visual testing only.
- Backend vehicle estimates and authoritative quote IDs for immediate solo city rides. Requests retain an idempotency key across retries; changed route/vehicle selections invalidate the quote.
- Backend matching status, incoming Captain offers, versioned acceptance/arrival/cancellation/start/completion actions and server-verified pickup codes. Demo acceptance and OTP shortcuts are blocked in live mode.
- Captain pickup/trip navigation reads the existing `/nav` endpoint and uses server road instructions when available. Stale or unavailable telemetry clears guidance; the quoted journey geometry remains a route context, not a fabricated turn instruction.
- Foreground Captain GPS sharing starts only after an explicit tap by an online Captain, sends measured coordinates at most once every six seconds and ignores inaccurate fixes.
- Live nearby vehicles and active-trip positions. No sample cars, random movement or stale GPS positions are shown.
- In-app backend notifications, mark-as-read, real trip chat and an explicit opt-in for browser/native push registration. Push errors are shown honestly; permission is never requested automatically.

## Remaining migration/device work

The applications are not a full production replacement yet. Scheduled, shared, rental and outstation booking options, extra stops, fare offers/promos/passenger overrides, payments/settlement, complete profile/onboarding/wallet/history/safety integrations and the full cockpit HUD remain to be ported. Unsupported options are rejected in the connected immediate city-booking path. Other legacy prototype screens can still contain clearly labelled sample content.

Real road testing requires authenticated Rider/Captain accounts, an approved online Captain, location permission and a configured backend routing provider. Native background tracking, push delivery, Firebase configuration, key restrictions and release builds require separate physical-device verification. The automated tests use controlled API/GPS fixtures and do not prove live two-device delivery.

## Structure

- `apps/*/src/main.ts`: role entry points.
- `shared/design/mountPrototype.ts`: canonical renderer mounting and adapter lifecycle.
- `shared/journey/LiveJourney.ts`: place selection, quotes, booking, trip actions, sign-in, chat and notifications beneath the approved UI.
- `shared/maps/`: Google/OSM providers, live telemetry, route overlay, foreground tracking and location watch.
- `shared/notifications/`: opt-in native/web push registration.
- `shared/services/` and `shared/platform/`: backend contracts, authenticated transport and device APIs.
- `mobile/`: Capacitor wrappers.
- `apps/*/src/features/prototype/`: earlier Gemini renderers, retained but not mounted or used as the visual reference.

Read `AGENTS.md` and `../.agents/skills/hop-mobile-design/SKILL.md` before modifying UI. The canonical renderer exposes a small integration bridge; adapters supply real content/actions without changing the experience lab’s sample behavior or visuals.

## Validation

```sh
npm run typecheck
npm run build
npm run test:design
```

The suite starts an isolated canonical reference on 5290 and reuses/starts the mobile previews. Reference-mode screenshots compare every listed Rider/Captain screen against the original renderer with zero RGB differences, using consistent fallback fonts for deterministic results. Live integration tests separately cover search/route/booking, provider fallback, Follow me, stale telemetry, GPS sharing, backend OTP validation, notifications and chat. Do not update visual expectations to hide design drift.

## Login, payment and recovery design previews

- Rider login: http://localhost:5183/?prototype=login
- Captain login: http://localhost:5184/?prototype=login
- Rider payment: http://localhost:5183/?prototype=payment
- Captain payment/collection: http://localhost:5184/?prototype=payment
- Missing/recovery states: http://localhost:5183/?prototype=states (also available on Captain port 5184)

These explicit preview URLs never mount the live adapters, send SMS, charge money or change device permissions. Login previews include phone/code/error/success states with short, reduced-motion-aware entrance animations. Payment previews distinguish UPI/wallet verification from Captain-reported cash receipt, with insufficient balance, pending, failure, success and refund states. Recovery previews cover location denied, no search results, no Captains, expired fare, offline request status, offer already taken, cancellation and notification permission.

Hop Commute is disabled in the home UI and navigation guard. It remains unavailable until explicitly re-enabled.

Destination search now defaults to the service area containing the initial Chennai map rather than the backend's first configured city (Delhi NCR). A visible Search city selector allows changing the area; selected pickup coordinates determine the area once available. Loading, sign-in-required and backend error messages persist through re-renders instead of silently reverting to a generic heading. Search still requires a valid backend session and a working configured geocoder.


## Approved designs implemented

Normal Rider/Captain entry points now use the approved animated login design and Outfit display/Inter body typography. Fonts are self-hosted under assets/fonts with their SIL Open Font Licences, including Latin/Latin Extended subsets. Design review URLs remain isolated and never charge or send SMS.

The approved payment layout is connected to completed ride entries via Payment & receipt, and appears when an active ride completes. Amounts, payment methods, wallet balance, cash receipt and settlement status are read from the existing backend. Rider can open provider checkout, add funds to Wallet, select Wallet/Cash, check status and report a disputed direct payment. Captain can check payment status and explicitly confirm cash/direct-UPI receipt. Unknown payment-order responses are retained as pending; retries reuse a known order rather than silently creating another. The provider callback is verified on the backend, then the ride status is re-read before showing success. Development provider stubs are not silently treated as successful real payments.

Quote expiry, lost connection, no-Captain expiry, unavailable location, unavailable alerts and cancellation-confirmed recovery dialogs use the approved state design. Sign-in errors appear inline. Commute remains disabled.

Payment integration tests use controlled provider/API fixtures and perform no actual charges. Native checkout handoff, UPI app switching, push delivery and live provider settlement require device/provider sandbox verification before release. Refund timelines remain design-only because no rider refund-status contract is exposed by the current backend; live disputed payments enter backend review instead of displaying a simulated refund.
