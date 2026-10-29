# Hop requirements review — 29 October 2026

This is the review baseline. Implementation has since progressed; see [current implementation status](IMPLEMENTATION-STATUS-2026-10-29.md) for the follow-up.

## Outcome

The mobile implementation is suitable for further controlled testing, but the full requirements are **not complete**. Browser regression success does not establish feature completeness or production readiness.

Scope: active Rider/Captain entry points in `hop-mobile-platform`, the shared canonical renderer in `hop-platform/prototypes/mobile-first`, Android CI, and the original Rider screens 2–5 request plus subsequent mobile requests. This is a source and automated-test review, not a live production or physical-device acceptance test. The separate web app remains a separate implementation; its features cannot be counted as completed mobile features.

## Implemented, with automated coverage

- Shared approved mobile renderer, locally bundled Outfit/Inter, isolated login/payment/recovery previews, and standalone app startup.
- Pickup/destination search, saved Home coordinates, city selection, measured foreground location, Google Maps with OSM fallback, route overlays and stale-position removal.
- Backend quote and booking submission, quote IDs, duplicate-request protection, city-booking reset after rental selection, matching and cancellation.
- Captain incoming offers, versioned acceptance, arrival/start/completion actions, server-verified pickup code, real chat and in-app notifications.
- Payment adapter: backend order/settlement status, wallet actions, receipt reporting, assigned-Captain UPI QR, uncertain-order retry handling. Provider/device acceptance remains pending.
- Captain onboarding: server drafts, configured operating cities, real private image uploads, phone verification, submission, and backend approval before going online. No mobile neighbourhood-zone approval workflow.
- Development-only optional onboarding fields/documents/declaration. Final backend submission and duty eligibility are still enforced. This is not an end-to-end approval bypass.
- Android workflow source supports Rider/Captain debug APKs, signed release APK/AAB, checksums and GitHub Actions artifacts. Four build-helper tests pass. No native workflow execution or artifact upload was performed in this review.
- Hop Commute is now hidden from home and review navigation. The navigation guard remains active against old links.

## Requirements still incomplete or conflicting

1. **Frontend fare and route fallback conflicts with the original requirements.** `shared/journey/LiveJourney.ts` contains `calculateFallbackEstimates`, `applyFallbackRoute`, and `applyFallbackEstimates`. API failures can show hardcoded frontend fares and a direct-line route while copy calls them backend estimates/road distance. Final booking still requires a backend quote, but the displayed estimate is not always server-authoritative. Treat this as a high-priority correction before broader testing; this review does not silently change pricing behavior.
2. **Ride history is partial.** The live `activity` adapter renders status, fare, endpoints and payment links from backend rides. It does not implement the original Ongoing/Upcoming/Past tabs, date/time, category/Captain details, pagination, contextual support and per-ride rebooking. The original full history acceptance criteria are unmet.
3. **Advanced booking parity is incomplete.** The live request guard rejects extra stops, promo/offer/passenger overrides and non-immediate/non-solo bookings. Scheduled, shared, rental/outstation, fare negotiation, voice booking and all original rider preferences are not verified as connected mobile features. Some controls still have prototype behavior.
4. **Some account and Captain content remains prototype-only.** Full profile editing, safety/support, history details, earnings/ledger, payout and cockpit integration are incomplete. Some canonical account/tools copy still refers to statewide operation despite city-based live onboarding; do not treat this copy as actual authorization. The reference onboarding retains explicit demo behavior; only normal live entry points use the real adapter.
5. **Original desktop scope is not validated by mobile screenshots.** The original request includes a two-column desktop workspace, preserved web navigation, nine widths from 320 to 1920px, zoom/keyboard behavior and light/dark themes. Current mobile visual tests cover canonical screen comparisons at 390px and short-phone checks at 320px. The full desktop, theme, large-text and keyboard matrix was not run in this review.
6. **Device/provider acceptance remains open.** Native foreground permission prompts, two-device tracking, background tracking, push delivery/Firebase, UPI app switching, checkout handoff, actual settlement/refunds and release installation need physical-device/provider verification. Background tracking is not implemented as a completed feature.
7. **CI delivery is configured, not demonstrated.** Repository variables/secrets, a phone-reachable HTTPS backend, signing and Firebase setup are required. Successful GitHub execution and downloadable native outputs are not established by local web builds.

## Evidence

- `shared/design/mountPrototype.ts` and both app `main.ts` files: active shared renderer and explicit preview isolation.
- `shared/journey/LiveJourney.ts`: plan/fallback, request guard, activity rendering, trip actions and duty approval checks.
- `shared/onboarding/CaptainOnboarding.ts`: optional development validation and real server persistence/uploads/submission.
- `shared/payments/LivePayment.ts` and payment tests: server confirmation and retry behavior.
- `tests/design.spec.mjs`, `tests/journey.spec.mjs`, `tests/maps.spec.mjs`, `tests/payments.spec.mjs`, `tests/onboarding.spec.mjs`, `tests/prototypes.spec.mjs`: fixture-based browser coverage, not real-device proof.
- `.github/workflows/hop-mobile.yml`, `scripts/ci.test.mjs`: native build/distribution configuration and helper validation.

## Recommended completion order

Correct misleading fare/route fallbacks; finish history and retained booking functionality; replace remaining live prototype actions/copy; complete device/provider acceptance and a real GitHub artifact build; then run the original desktop/accessibility matrix where still applicable.

## Executed verification for this review

- Type checking: passed.
- Rider and Captain production web builds: passed.
- Browser suite: 38 passed, including hidden Commute in live/reference modes and an old-link navigation-guard check.
- Android build-helper tests: 4 passed.
- `git diff --check`: passed.

These results do not close the feature gaps or device/native delivery checks listed above.
