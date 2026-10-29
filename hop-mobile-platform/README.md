# Hop mobile: approved prototype with live journey adapters

Rider and Captain share the approved renderer, Outfit/Inter fonts, tokens, assets, sheets and navigation from `../hop-platform/prototypes/mobile-first/`. Normal app entry points mount only the mobile screen; review controls are isolated to reference mode. Backend services remain unchanged.

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

The mobile adapters now support backend-priced city/rental/outstation quotes, resolved stops, promo validation, shared/favourite-first dispatch, fare offers, named/family passengers and city scheduling. Product availability remains controlled by the backend. Scheduled city rides accept Cash/UPI and cannot carry extras the scheduling API does not support. Voice destination search uses SpeechRecognition when available and otherwise asks the user to type. No synthetic route or frontend fare is substituted when the APIs fail.

History has Ongoing/Upcoming/Past views, ten-item local pages over the server's latest 50 trips, tracking, cancellation, fresh rebooking, reports, payment links and private trip-statement downloads. Profile/business fields, phone verification, portrait uploads, preferences, emergency contacts, incident/lost-item reports, revocable trip links, family/referrals/saved places, wallet top-ups, Captain earnings/ledger/payout requests and goals use the existing backend. Other unsupported prototype actions are blocked instead of reporting fabricated success.

The cockpit uses backend navigation instructions and trip distance/time; unavailable speed, speed limits, lane and compass telemetry remain blank rather than displaying simulated measurements. Statement/account downloads use the OS share sheet on native devices. The source remains a tested integration foundation, not an accepted production release. Backend archive pagination, background location, full translation, emergency-service escalation, provider refunds/reconciliation and some advanced operations need separate implementation or release verification.

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

The suite starts an isolated canonical reference on 5290 and reuses/starts the mobile previews. Reference-mode screenshots compare every listed Rider/Captain screen against the original renderer with bundled fonts loaded. Card geometry and computed styles must match exactly; screenshots allow only one RGB channel value of browser edge raster rounding. Live integration tests separately cover search/route/booking, provider fallback, Follow me, stale telemetry, GPS sharing, backend OTP validation, notifications and chat. Do not update visual expectations to hide design drift.

## Login, payment and recovery design previews

- Rider login: http://localhost:5183/?prototype=login
- Captain login: http://localhost:5184/?prototype=login
- Rider payment: http://localhost:5183/?prototype=payment
- Captain payment/collection: http://localhost:5184/?prototype=payment
- Missing/recovery states: http://localhost:5183/?prototype=states (also available on Captain port 5184)

These explicit preview URLs never mount the live adapters, send SMS, charge money or change device permissions. Login previews include phone/code/error/success states with short, reduced-motion-aware entrance animations. Payment previews distinguish UPI/wallet verification from Captain-reported cash receipt, with insufficient balance, pending, failure, success and refund states. Recovery previews cover location denied, no search results, no Captains, expired fare, offline request status, offer already taken, cancellation and notification permission.

Hop Commute is hidden from home and review navigation; its navigation guard still blocks old links. It remains unavailable until explicitly re-enabled.

Destination search now defaults to the service area containing the initial Chennai map rather than the backend's first configured city (Delhi NCR). A visible Search city selector allows changing the area; selected pickup coordinates determine the area once available. Loading, sign-in-required and backend error messages persist through re-renders instead of silently reverting to a generic heading. Search still requires a valid backend session and a working configured geocoder.


## Approved designs implemented

Normal Rider/Captain entry points now use the approved animated login design and Outfit display/Inter body typography. Fonts are self-hosted under assets/fonts with their SIL Open Font Licences, including Latin/Latin Extended subsets. Design review URLs remain isolated and never charge or send SMS.

The approved payment layout is connected to completed ride entries via Payment & receipt, and appears when an active ride completes. Amounts, payment methods, wallet balance, cash receipt and settlement status are read from the existing backend. Rider can open provider checkout, add funds to Wallet, select Wallet/Cash, check status and report a disputed direct payment. Captain can check payment status and explicitly confirm cash/direct-UPI receipt. Unknown payment-order responses are retained as pending; retries reuse a known order rather than silently creating another. The provider callback is verified on the backend, then the ride status is re-read before showing success. Development provider stubs are not silently treated as successful real payments.

Quote expiry, lost connection, no-Captain expiry, unavailable location, unavailable alerts and cancellation-confirmed recovery dialogs use the approved state design. Sign-in errors appear inline. Commute remains disabled.

Payment integration tests use controlled provider/API fixtures and perform no actual charges. Native checkout handoff, UPI app switching, push delivery and live provider settlement require device/provider sandbox verification before release. Refund timelines remain design-only because no rider refund-status contract is exposed by the current backend; live disputed payments enter backend review instead of displaying a simulated refund.

## Android CI builds and distribution

The **Hop Mobile Android** workflow (`.github/workflows/hop-mobile.yml`) validates both clients and runs browser regressions. Pushes to main/master/codex branches build debug APKs; pull requests validate without signing/deployment secrets. Manual **Run workflow** supports selecting Rider, Captain or both, debug or signed release, and GitHub artifact downloads. Changes to the canonical prototype also trigger CI.

Configure GitHub repository **Settings → Secrets and variables → Actions**:

- Variables `HOP_RIDER_API_URL` and `HOP_CAPTAIN_API_URL`: each app's phone-accessible HTTPS gateway origin. Debug builds default to the respective `hop-staging-rider-qp262su4sq-el.a.run.app` and `hop-staging-captain-qp262su4sq-el.a.run.app` HTTPS origins when variables are absent. Release builds require explicit variables. A legacy `HOP_API_URL` fallback is supported only for a shared API that preserves `X-Hop-App`; never point Captain at the Rider gateway. Use an origin such as `https://api.example.com`, without `/api`. Localhost and emulator addresses are rejected. Backend authentication, OTP and routing providers must be operational.
- Secret `HOP_GOOGLE_MAPS_API_KEY`: the client Maps JavaScript key used by the WebView. This is bundled into the app; apply Google API/application restrictions compatible with the Capacitor WebView. A native Android Maps SDK key is not interchangeable with this JavaScript integration. If absent or rejected, OSM is used.
- Optional secrets `HOP_RIDER_GOOGLE_SERVICES_JSON_BASE64` and `HOP_CAPTAIN_GOOGLE_SERVICES_JSON_BASE64`: base64 of the respective Firebase `google-services.json`, matching `com.hop.rider` / `com.hop.captain`. Required for native push delivery, separate from location/maps.
- For **release**: secrets `HOP_ANDROID_KEYSTORE_BASE64`, `HOP_ANDROID_STORE_PASSWORD`, `HOP_ANDROID_KEY_ALIAS`, `HOP_ANDROID_KEY_PASSWORD`. Use the same securely stored signing key for subsequent updates. Missing credentials stop the build. Release produces a signed APK for direct testing and an AAB for store distribution.

Each successful build uploads its APK (plus release AAB), `SHA256SUMS` and `build.json` as a GitHub Actions artifact for 30 days. CI assigns an increasing version code from the workflow run number. Existing store releases with higher version codes require adjusting that sequence before publishing.

To test: open **Actions → Hop Mobile Android → Run workflow**, choose **debug / all**, then download and extract each artifact. Transfer the APKs to your Android phone (Android 7/API 24 or later) and open them, allowing installation from that download source if Android prompts. Install the `.apk`, not the `.aab` or artifact ZIP. Debug signing keys are generated per runner, so installing a different debug run may require uninstalling the previous test app (which clears its local data); signed release builds allow updates with the same key. The workflow must be committed/pushed before GitHub can execute it; manual dispatch appears when the workflow exists on the default branch.

Location access is requested on first use of current location, Follow me or Captain sharing, not on installation. Choose precise location and while using the app for accurate testing. Denial shows recovery UI. Google Maps needs no Google account sign-in. Notifications have a separate opt-in and Android permission; Firebase configuration is needed for delivery. Current Captain telemetry is foreground-only; this build does not enable background tracking.

### Captain onboarding

The connected Captain flow resumes private server drafts, selects configured operating cities, verifies phone ownership, uploads real portrait/document images, and submits credentials for operator review. There are no neighbourhood-zone approvals in the mobile flow. Existing backend service-area restrictions still apply.

When `/api/config` enables `development`, **Testing mode** defaults to optional fields, documents and declaration so incomplete drafts can move through all four screens. Turn the toggle off to exercise required-field validation. This setting does not fabricate documents, credentials, approval or successful submissions: final submission and going online remain subject to backend checks. Production keeps required onboarding validation.

## Completion follow-up — 29 October 2026

See `docs/IMPLEMENTATION-STATUS-2026-10-29.md` for completed adapters, test evidence and remaining external acceptance gates. The earlier requirements review is preserved as the baseline, not the current completion status. Local APK/release builds now reject missing, emulator or insecure backend origins before building. Configure the actual phone-accessible HTTPS backend rather than using an emulator address.

### Verified staging phone builds

Rider uses `https://hop-staging-rider-qp262su4sq-el.a.run.app`; Captain uses its separately verified gateway `https://hop-staging-captain-qp262su4sq-el.a.run.app`. Both `/api/config` endpoints returned HTTP 200 with two areas, ten vehicle configurations and `development: false` on 29 October 2026. Local ignored `.env.android.local` files contain the respective `VITE_MOBILE_API_URL`/`BACKEND_URL` values. These are production-mode staging services. Captain onboarding is now mandatory in every mode; backend operator approval unlocks the main Captain UI. Older APK downloads predate this latest web change.

Both debug APKs were compiled with Java 21 and their APK signatures verified. They still require physical-device testing; no phone was connected during this build. CI must have the separate per-role variables configured to reproduce these gateway selections.
