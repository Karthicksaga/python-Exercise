# Hop mobile implementation follow-up — 29 October 2026

The source-level gaps identified in the earlier review have been addressed in the active mobile adapters where supported by the existing backend. This is not a production acceptance or physical-device sign-off. The separate desktop web application was not rewritten.

## Implemented

- **Authoritative prices/routes:** removed hardcoded frontend fares and straight-line route fallbacks. Unavailable routing or estimates clears the geometry and prices, disables Continue and offers Retry. Disabled/missing vehicle prices cannot be selected. Route alternatives come from the server and their index is included in the quote. Discounts and confirmation amounts use server values.
- **Advanced booking:** server payloads for up to three resolved stops, rental hours, outstation days/return trips, promos, women-driver eligibility, shared/favourite-first dispatch, fare negotiation and named/accepted-family passengers. Voice recognition fills destination search for review; it never books automatically. Device/browser availability is handled explicitly.
- **Scheduling:** existing scheduled-city endpoint with actual coordinates and ISO pickup time, Cash/UPI only. Unsupported combinations are rejected rather than silently stripped. Uncertain schedule creation is remembered to prevent blindly creating another plan.
- **Ride history:** Ongoing/Upcoming/Past, empty states, dates, category, Captain/vehicle and amounts, local ten-row pages over the server-provided latest 50 trips, tracking, cancellation confirmation, scheduled cancellation, fresh per-trip rebooking, incident reports, payment links and private statement downloads. Keyboard arrow/Home/End navigation is supported by history tabs.
- **Profile and account:** live identity/name, business fields, exact-number phone verification, portrait preview/upload, default vehicle/payment, language/accessibility/notification preferences, saved destinations, emergency contacts, family/favourites, referral display/redemption and explicit account export/deletion controls. Rejected saves retain entered fields. Unsupported demo actions are blocked.
- **Safety/support:** selected-trip incident and lost-item reports, operator SOS and revocable trip-share links. An operator incident is not an emergency-services call. Unsupported chat/escalation actions do not claim delivery.
- **Wallet and Captain operations:** wallet balance/ledger, provider-backed top-up with uncertain-order protection, real earnings, driver ledger and payout requests, pickup-radius/minimum-fare preferences, daily goal and go-home/offline actions. Payout submission is not settlement.
- **Cockpit:** approved renderer with actual backend guidance and trip ETA/distance; synthetic speed, speed-limit, compass and lane readings are removed from live mode. Missing measurements display unavailable markers.
- **Native export:** account data and private trip PDFs use Capacitor cache files and the OS share sheet, with ordinary downloads on the web.
- **UI:** Outfit/Inter and canonical shared rendering preserved; city wording replaces statewide authorization and the Captain self-approval button is removed. Hop Commute stays hidden with navigation blocked. Optional onboarding is development-only, and backend approval still gates driving. Dark-mode upload-card contrast and native file-picker layout are corrected.
- **Phone builds:** APK/release scripts reject absent/insecure/emulator backend origins; they cannot silently produce a phone build pointing at an emulator backend.

## Open release and backend work

- No Android device is connected (`adb devices -l` returned an empty list). Native permissions, foreground tracking on two phones, checkout/app switching, native share, push/Firebase, signing/install/update and provider settlement still require device/provider sandbox acceptance.
- The user supplied the Rider staging gateway, and the matching documented Captain gateway was separately verified. Both returned HTTP 200 from `/api/config`. Each app now has its own ignored Android configuration, and both debug APKs were built and signature-verified. These gateways report `development: false`, so development-only optional onboarding remains disabled and operator approval still gates driving.
- The local GitHub CLI has no authenticated account. The connected GitHub query returned no PR-triggered runs for the checked-out commit (it does not establish the status of push/manual runs). No new native workflow run or artifact publication was performed as part of this follow-up. GitHub Actions needs repository configuration and a real HTTPS backend; local web builds do not establish native delivery.
- Existing backend contracts remain unchanged. They bound participant history to 50 trips and expose no full archive pagination. Local pagination does not claim access to older records.
- Background location, supplier tax invoices, provider refund/reconciliation, complete translations, real emergency-service escalation and full cockpit telemetry remain distinct backend/device/product work. Unavailable data is not simulated.
- Nine mobile-container widths are exercised from 320 to 1920px with dark/large-text checks on the new forms/history. This does not certify the original separate desktop web app's two-column layout or every OS keyboard/zoom combination.

## Verification

Final checks executed successfully:

- `npm run typecheck`: passed for Rider and Captain.
- `npm run build`: both production web builds passed.
- `npm run test:design -- --timeout=30000`: **61 passed**, including canonical screenshot comparisons, both payment roles, route/fare failures and retry, actual route alternatives, history actions, advanced booking payloads, optional onboarding, cockpit guidance, dark/large-text layouts at nine widths, keyboard tabs and hidden Commute.
- `node --test scripts/ci.test.mjs`: **5 passed**, including the local APK guard against emulator backend URLs.
- `git diff --check`: passed.
- Profile screenshot was visually inspected after fixing upload layout and dark-mode contrast.

The canonical pixel tolerance was not widened. Live animation CSS is loaded only outside explicit reference mode; payment regressions now select the Past tab before opening completed-trip payment controls.

API, GPS and provider cases use controlled fixtures; they do not send real SMS, reports or charges. Both local debug APKs have now been produced against their verified role-specific staging gateways. APK signatures, package IDs and bundled JavaScript/native backend origins were checked. Downloads and SHA256SUMS are staged in `/private/tmp/hop-phone-builds-2026-10-29/`. No GitHub artifact publication was performed. Physical-device/provider acceptance remains open.

### Android build follow-up

- Rider: `com.hop.rider`, staging Rider gateway, `assembleDebug` passed (Java 21).
- Captain: `com.hop.captain`, separately verified staging Captain gateway, `assembleDebug` passed (Java 21).
- Both APK signatures verified using Android `apksigner`; package IDs and embedded API/native tracking origins checked in the APK contents.
- Checksums and metadata are included with the APKs. No device installation, SMS, payment or live ride was performed.
- CI now supports `HOP_RIDER_API_URL` and `HOP_CAPTAIN_API_URL`, with legacy `HOP_API_URL` fallback for a genuinely shared API. The variables were not changed remotely.
- Build-helper regression suite: 5 passed after the CI configuration update.

### Login, motion and CI follow-up — 30 October 2026

- Signed-out Rider and Captain launches display login; valid sessions continue to their respective home screens. Session failures remain gated without sending SMS.
- Shared application motion adds short screen/card/login/sheet entrances and tactile controls, respecting reduced-motion preferences. See `MOTION.md`.
- Final typecheck and both web builds passed. Full mobile regression suite: **73 passed**. Android build-helper suite: **5 passed**. Both debug APKs rebuilt, signature-verified, and checked for the correct package IDs and role-specific JavaScript/native staging origins.
- Updated downloads, SHA256SUMS and build metadata: `/private/tmp/hop-phone-builds-2026-10-30/`. Physical-device acceptance remains open.
- Fixed missing CI backend configuration: debug workflows default to their respective staging gateways when repository variables are absent; per-app/shared variable overrides remain available. Release workflows require an explicit origin. Both staging URLs passed `prepare-ci.mjs` locally. No remote workflow rerun or publication was performed in this follow-up.
- Local UI testing subsequently switched to the local backend at port 8081 by user request. Verified `development: true` through both Vite proxies, backend `APP_ENV=development`, `DEV_SMS=true`, `DEV_PAYMENTS=true`, and generated development OTPs for both roles. No SMS provider is configured locally. Local browser configuration is persisted in ignored `.env.local` files; Android staging origins remain separate.
- Development proxy regression run: **73 passed**; typecheck and both web builds passed.

### Search pickup follow-up

The live journey now clears the canonical review-only pickup/destination values at initialization. The search pickup starts empty and becomes a selected location only through an explicit place selection, map pin, current-location action or real trip state. Reference previews retain their approved demo addresses. Startup regression coverage checks empty route fields and preserves a typed pickup query across a modal re-render.

### Mandatory Captain onboarding and verification layout

The latest request supersedes optional onboarding: signed-in Captains without backend status `approved` stay on onboarding, with no map or main navigation. All required account/vehicle/document steps and consent are enforced in development too. Submitted applications show review status with a backend refresh action. Approval unlocks Drive, Earnings, Trips and Account; failed status checks do not unlock access.

The verified mobile number is read-only. Its confirmation icon and text align together with bounded wrapping instead of spreading across the card. Responsive checks cover 320, 390 and 768px. Wallet empty-history rendering now identifies its payment-options footer separately, preventing repeated footer text on subsequent updates. Pickup search starts empty and includes the same address-search hint as destination.

The current local browser apps include these changes; earlier exported APKs predate mandatory onboarding and need rebuilding before phone acceptance of this flow.

Final verification for this follow-up: typecheck passed, both production web builds passed, and **78 mobile regression tests passed**. Coverage includes pending-to-approved Captain navigation, mandatory onboarding in development, verified-phone alignment at three widths, empty-wallet notices and pickup search startup. The 390px onboarding screenshot was visually inspected.

### Rider search cleanup

Removed the visible Search city selector from Rider search; service-area selection and the Chennai search regression remain active beneath the UI. Search results now have a distinct section heading and one empty/loading/error message, eliminating the duplicated SEARCH REAL PLACES text.

### Notification sound follow-up

Replaced repeated raw tones with short layered sine chimes, smooth amplitude envelopes and dynamic compression. Ride requests, acceptance and online/offline transitions retain distinct cues. Audio uses one gesture-unlocked context, cleans up completed audio nodes and suppresses overlapping request alerts. Offline rendering of the actual request cue produced finite audio with peak amplitude 0.368 (below clipping); listenable preview is `/private/tmp/Hop-notification-preview.wav`. Browser autoplay restrictions still require interaction before sound can play. Native OS push notification-channel audio is separate from these in-app cues.

### Notifications and trip planning UI

The live notification inbox now has All/Unread filters, readable date/time labels, notification icons, unread indicators, separate device-alert controls, and explicit loading/empty/error states. Read status changes locally only after the backend confirms marking notifications read. The Android push channel retains the phone's default sound; the new synthesized chimes apply to in-app ride/status cues. Device sound and background push acceptance remain physical-phone work.

Plan a ride now groups journey settings and optional pickup time into cards with friendly trip-type names and one anchored save action. Existing rental/outstation/scheduling validation and backend payloads remain in place. The shared reference preview is unchanged.

### Live map preferences

Map preference switches now target live provider APIs instead of prototype toggle state. Google Maps supports traffic and satellite; OpenStreetMap disables those unavailable layers with an explanation. Low-data mode limits buffered/zoom-updating raster tiles on OpenStreetMap and extra layers/detail on Google (actual savings vary). Night mode affects the map while leaving route/marker overlays clear. Preferences persist across screen re-renders during the app session. No traffic or imagery data is simulated.

Final combined verification: typecheck and both web builds passed. The full 83-test run passed 82 checks; the remaining outstation test still used the previous “Round trip” accessible label. After updating it to the new “Include a return trip” label, that test passed on targeted rerun with unchanged booking payload assertions. Focused notification/planning UI tests and fallback map preference tests also passed. Google layer API behavior was checked with a provider stub; real Google imagery/traffic and Android system sound still require provider/device acceptance. Notification and planning screenshots were visually inspected.
