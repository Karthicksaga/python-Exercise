# Hop Rider and Captain UI/UX audit — 3 November 2026

This is a local implementation and validation report for the December 2026 beta preparation. No staging deployment, real SMS, ride booking or payment was performed. Browser integration tests use controlled API/GPS/provider fixtures; the application continues to use the existing APIs. It is not a production-release certification.

## Architecture and scope

The active apps are `apps/rider` and `apps/captain` in `hop-mobile-platform`. They mount the shared approved renderer in `hop-platform/prototypes/mobile-first` through TypeScript adapters. These are Capacitor web applications, not React Native applications. The older `hop-platform/web` UI is deprecated and was not substituted for the active mobile apps. Unmounted earlier feature renderers were not treated as active routes.

The audit used the Hop mobile design skill, approved branding, locally bundled Outfit/Inter fonts, current backend contracts and actual rendered screens. Playwright MCP was unavailable; the repository's Chromium Playwright tooling was used. No new UI framework or animation dependency was introduced.

## Screens and states reviewed

- Rider: Home; pickup/destination search; choose a ride; fare/route review; matching; Captain assignment/tracking; trip receipt; statement; ride history; wallet; transactions; account; saved places; family/favourite Captains; preferences; safety; support; notifications; rewards; personal/business details; privacy; chat; trip planning; sign-in.
- Captain: Drive dashboard/online-offline; incoming request; pickup navigation; pickup-code verification; active trip; cockpit; payment collection; earnings; tools; vehicle/documents; onboarding; insights; demand; transactions; statement; trip history; account; preferences; safety; support; notifications; personal details; privacy; chat; sign-in.
- Onboarding steps, OTP validation and errors, pending approval, authentication failures, empty history, wallet failure/retry, payment pending/verified/failure, routing failure, stale telemetry, notification permission errors, cancellation and other recovery paths are exercised by the regression suite.
- Forty-nine named modal definitions were enumerated and captured for each role in reference mode: add-place, appearance, bids, break, business, call, cancel, cancel-schedule, contacts, counter, delete-account, document, edit-place, email, export, family-invite, fare, favourite, goal, language, lost-item, map, meeting, navigation, options, passenger, payment, payout, personal-more, pickup, privacy-info, promo, referral, report, ride-taken, ridecheck, service-area, share, signout, sos, sos-info, stops, support-chat, support-contact, topup, vehicle-change, vehicle-default, verify and voice. Reference-only dialog captures do not prove backend functionality.
- Commute remains deliberately disabled. Unsupported advanced actions remain explicitly unavailable; they were not activated or simulated as successful operations.

Coverage has two levels: all discoverable screen definitions were inspected and rendered in reference mode, while live adapters and transactions were exercised with controlled fixtures in the reachable workflows. Browser screenshots do not establish end-to-end service delivery or native device correctness.

## Root causes and implemented fixes

1. Layered page/intro padding and legacy selectors produced excessive top gaps and inconsistent card insets. Shared live spacing and card rules now establish one inset and one divider between rows.
2. Many icon, text, map and secondary controls were smaller than 44px. Live buttons now have a shared minimum touch area, route fields are larger, and six Captain pickup-code inputs fit the 320px screen with 44px targets.
3. Secondary labels and form controls were too small. Live form, row and tab typography now follows a readable hierarchy and responds to larger-text mode; long content can wrap.
4. The desktop shell was capped at 500px. Live tablet/desktop shells can use 1120px, with readable content widths, two-column login, constrained dialogs and a map-side panel. Reference mode keeps its approved mobile canvas.
5. Map sizing assumed sheets were always below the canvas. Desktop maps now use the available area beside the side panel; mobile maps retain internally scrolling sheets and compact control groups.
6. The welcome illustration occupied too much space; shortening its container could let the vehicle overlap the heading. Login uses a compact hero and an explicitly bounded illustration. Short-height layouts reduce decoration, and the primary action stays within the keyboard-visible shell.
7. Chat quick replies overflowed at 320px. They now wrap in both the canonical renderer and live apps.
8. Dark mode could lose to inline light card backgrounds. Live card, notice, input and payment surfaces now use theme colors, with visible focus indicators.
9. Wallet loading/failure could leave sample balances and transactions visible. Unknown balances show an em dash, sample history is cleared, and loading/error/retry states are explicit. The ledger also distinguishes unavailable data from a real zero balance.
10. Live privacy/personal screens retained prototype-oriented copy. They now explain real account actions. Captain history now says “Back to driving” for its existing return-to-drive action.
11. Captain demand targeted a content container that does not exist on its map screen, leaving illustrative content in place. It now decorates the actual sheet and displays server data or an honest empty/error state. No simulated demand heatmap was added.
12. Captain insights read top-level numbers, but the backend returns a nested totals array. The screen now renders completed trips, distance, average fare/pickup, rating, best fare and available day/destination/payment/type summaries with units.
13. Loading and saved status announcements could appear together after profile saves. Saved feedback waits for the data refresh rather than duplicating the loading announcement.
14. Network, timeout and HTTP fallback messages could expose transport/status-code wording. Shared feedback now offers a clear next step, retains backend validation messages and logs transport diagnostics. No error is converted to success.
15. Decorative wallet shine and offer-icon loops were excessive. They were removed, while screen/sheet/login/transaction motion remains. Vehicle selection gets a short compositor-friendly transition. OSM vehicle movement still interpolates measured backend GPS; reduced motion and hidden pages bypass interpolation. No acceptance, GPS or payment state is fabricated.
16. Bottom navigation now exposes the active destination through `aria-current`. Live page titles no longer call the application a prototype replica.

## Shared components improved

Existing header, screen container, action bar, bottom navigation, list/card rows, inputs, icon/text buttons, modal sheets, map controls, preferences, empty/error states and motion controller were reused. `shared/design/responsive.css` centralizes the live responsive foundations; role accents and approved reference presentation are retained.

## Files changed in this audit

- `apps/rider/src/main.ts`, `apps/captain/src/main.ts`: live-only responsive stylesheet registration.
- `shared/design/responsive.css`: responsive layout, controls, typography, focus, themes, safe-area/sheet and login rules.
- `shared/design/MotionController.ts`: selected-vehicle feedback.
- `shared/design/mountPrototype.ts`: application titles.
- `shared/account/LiveAccount.ts`: real loading/error states, demand/insights adapters, copy and status-announcement corrections.
- `shared/history/LiveHistory.ts`: Captain empty-state action label.
- `shared/journey/LiveJourney.ts`: safe, truthful Captain rider/pickup labels. The earlier vehicle-default fix remains present.
- `shared/maps/PrototypeMap.ts`, `shared/maps/osm.ts`: desktop map sizing and reduced-motion GPS rendering.
- `shared/services/client.ts`: friendly transport and HTTP feedback.
- `tests/responsive-foundations.spec.mjs`, `tests/api-feedback.spec.mjs`: responsive, keyboard, touch-target, analytics, OTP and failure-state regressions.
- `tests/support/mockBackend.mjs`: extracted existing test fixture; production code does not import it.
- `tests/live-screens.spec.mjs`, `tests/motion.spec.mjs`, `tests/personal.spec.mjs`, `tests/design.spec.mjs`: updated shell expectations, fixture reuse, reliable animation observation and approved copy expectation.
- `scripts/audit-ui.mjs`, `scripts/capture-ride-states.mjs`: repeatable local screen inventory, measurements and screenshots.
- `hop-platform/prototypes/mobile-first/style.css`, `app.js`: chat wrapping and active-navigation semantics. Existing unrelated changes to `app.js` were preserved.
- Repository `.gitignore`: excludes raw local audit output.

Pre-existing edits to `AGENTS.md` and earlier preference/vehicle-selection changes were preserved. No backend implementation, API schema, authentication protocol, quote/idempotency flow or settlement rule was changed.

## Before and after evidence

Baseline images were taken before this audit's shared redesign; earlier preference fixes from this chat were already present. Paired images use the same 390×844 viewport and controlled backend fixture.

- Preferences: [before](ui-ux-audit-evidence/before-rider-live-preferences-390x844.png), [after](ui-ux-audit-evidence/after-rider-live-preferences-390x844.png).
- Wallet unavailable/malformed-response state: [before](ui-ux-audit-evidence/before-rider-live-wallet-390x844.png), [after](ui-ux-audit-evidence/after-rider-live-wallet-390x844.png). The baseline fixture deliberately has no authoritative balance; the corrected UI shows an error instead of sample money.
- Captain tools: [before](ui-ux-audit-evidence/before-captain-live-tools-390x844.png), [after](ui-ux-audit-evidence/after-captain-live-tools-390x844.png).
- Additional post-fix views: [login](ui-ux-audit-evidence/rider-live-auth-390x844.png), [desktop map](ui-ux-audit-evidence/rider-live-home-1280x800.png), [short-phone pickup verification](ui-ux-audit-evidence/captain-live-arrived-320x640.png), [Captain payment](ui-ux-audit-evidence/captain-live-completed-390x844.png).

Full local evidence and machine-readable inventories are stored at `/tmp/hop-ui-ux-audit-2026-11-03`. Selected report images are retained in this repository's docs directory; raw captures in the temporary directory are not durable release artifacts.

## Responsive and automated validation

- Responsive profiles: 320×640, 390×844, 430×932, 768×1024, 1280×800, 1920×1080 and 844×390 landscape. Additional screenshot profiles exercise dark mode with larger text at 320×640 and 390×844.
- Screenshot audit: **818 views** — 441 reference screen/profile combinations, 279 live account/dashboard combinations and 98 standard-phone reference dialog captures. No horizontal overflow or JavaScript page errors were recorded. This is not a count of 818 unique screens.
- Live workflow screenshots: **60 views** covering signed-out authentication, requested/accepted/arrived/in-progress/completed states, chat and Captain cockpit at 320px, 390px and desktop widths. Chat did not overflow.
- Baseline: 173 standard-phone captures before this audit's shared changes.
- Strict responsive tests cover 31 live dashboard/account screens across seven profiles, 44px application control targets, desktop map geometry, keyboard-visible primary actions, larger-text settings scrolling, authoritative wallet failure states, nested insights data and six accessible pickup-code inputs.
- Accessibility limits: the measurement audit still identifies compact Leaflet/OpenStreetMap attribution links in 18 live captures. These third-party inline credit links were retained. Reference-only controls also retain their original smaller geometry; their counts are not reported as live application control compliance. A formal screen-reader and WCAG contrast audit remains outstanding.
- Typecheck passed for both apps. Both web production builds passed. Both final Android debug builds and APK v2 signature verification passed. `git diff --check` passed.

**Final complete browser suite: 159 passed (2.3 minutes), using two workers and persistent local servers.** Command: `npm run test:design -- --workers=2`. The strict reference threshold and baselines were preserved; the reference harness was corrected to use the same container grid alignment as the application. [Full test log](ui-ux-audit-evidence/playwright-final.txt).

## Android and remaining release work

Java 21, the Android SDK and an API 35 emulator were available. Both final debug APKs compiled and their signatures were verified. Earlier builds of both apps were installed for the native attempt; Rider was launched and an actual native screenshot/WebView endpoint was captured. The final builds have not been re-tested in the emulator. The emulator displayed **System UI isn’t responding**; native keyboard, navigation-bar, rotation, permission, gesture and performance verification could not be completed reliably. The emulator was stopped rather than treating this as a passing device test. [Native failure screenshot](ui-ux-audit-evidence/android-system-ui-anr.png). Final debug APK signatures were verified with the Android SDK apksigner tool (v2 signatures).

No signed release, physical-device run, SMS delivery, real two-device trip, background tracking, notification delivery, payment-provider settlement or refund/reconciliation test was performed. Those remain beta acceptance gates. Browser fixture success and debug compilation are not proof of production readiness. The unchanged migration limitations documented in the project README still apply, including archive pagination and unavailable advanced operations.

## Subsequent launch-page concepts

At the user's subsequent request, isolated animated Rider and Captain launch concepts were added under `prototypes/launch`. They are review-only and do not replace the live sign-in screens. See the [prototype notes](../prototypes/launch/README.md). Three responsive profiles, continuous motion, pause, local form previews, reduced motion and zero API calls were checked separately from the 159-case application regression suite.
