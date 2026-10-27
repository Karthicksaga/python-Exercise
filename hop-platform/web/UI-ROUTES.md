# UI remediation and verification checklist

Checked items below mean browser fixture rendering was exercised, not real service integration. Rider and Captain destinations use tab state rather than separate pathname routes. All twelve main tabs were exercised in both themes at 320, 360, 390, 430, 768, 1024, 1280, 1440 and 1920px.

## Rider

- [x] Book a ride: shared shell, location gate and location-enabled map/form stage.
- [x] Your rides: empty state plus completed/cancelled cards with long addresses.
- [x] Support: action cards, support panels and dark theme.
- [x] Profile: hero, avatar palette, metrics, details, verification/photo, contacts, saved places, preferences, role switch and account actions.
- [x] Wallet: balance, amount controls, promo and history empty states.
- [x] Safety & more: notifications, accessibility/preferences, favorites, scheduling and related panels with deterministic empty data.
- [x] Sign-in landing: both themes at 320/1024; semantic phone control.
- [x] Booking choose/confirm: both themes at 320/768/1024/1920; quote rendering and forward navigation.
- [x] Accepted live-trip rendering: both themes at 320/1024.
- [ ] Public `?share=` view: source inventoried; valid/expired token browser checks still needed.
- [ ] OTP sent, invalid, expired and verified states; external OAuth/browser return.
- [ ] Matching, arrival, in-progress, cancellation dialogs, negotiation, shared trip, settlement/dispute, ratings and receipts with live services.
- [ ] Populated wallet, referrals, family, schedules, notifications, lost items and all error states.

## Captain

- [x] Drive: approved offline driver, duty controls, requests empty state and map container.
- [x] Earnings: earnings/payout UI with deterministic fixture data.
- [x] Vehicle: settings/preferences and form layout.
- [x] My trips: empty plus completed/cancelled trip history.
- [x] Support: help cards and support state.
- [x] Profile: shared profile UI and Captain role-specific text/actions.
- [x] Sign-in landing: both themes at 320/1024.
- [x] Onboarding vehicle/credentials step: both themes at 320/1024.
- [ ] Account, document upload/preview and review/submit onboarding steps: source inventoried; complete device interaction coverage still needed.
- [ ] Online requests, accept/reject, pickup PIN, live driving, destination arrival, payment collection and background tracking with real services.

## Admin

The following views have source inventory and successful TypeScript/production builds. Dedicated operator fixtures and viewport rendering remain outstanding for each:

- [ ] Live Dispatch Map (`live-map`).
- [ ] Rides Management (`rides`).
- [ ] Executive Analytics (`analytics`).
- [ ] Driver reviews (`drivers`).
- [ ] KYC & documents (`verification`).
- [ ] Service areas (`areas`).
- [ ] Emergency SOS (`sos`).
- [ ] Lost & Found (`lost-found`).
- [ ] Incidents (`incidents`).
- [ ] Driver scores (`safety`).
- [ ] Audit log (`audit`).
- [ ] Fares & categories (`pricing`).
- [ ] Surge & peak (`surge`).
- [ ] Promo codes (`promos`).
- [ ] Payouts & refunds (`payments`).
- [ ] Operator restricted/sign-in state and operator dialogs.

## Release evidence

- [x] Source inventories and responsive architecture guide.
- [x] Browser fixture regression automation and CI screenshot artifacts.
- [x] Both Capacitor Android debug APKs build.
- [ ] Approved pixel baselines committed and enforced.
- [ ] Real staging end-to-end business-flow validation.
- [ ] Full Android device matrix, keyboards, permission states, lifecycle/background behavior and physical-device coverage.

See UI-AUDIT.md for the final limited Android emulator smoke results; a limited smoke check does not complete the Android release checklist.
