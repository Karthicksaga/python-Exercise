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
