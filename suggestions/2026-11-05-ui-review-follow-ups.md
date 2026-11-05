# UI/UX review: follow-ups not yet done

- **Date:** 2026-11-05
- **Status:** Proposed
- **Scope:** Rider and Captain apps (`hop-mobile-platform`, renderer in `hop-platform/prototypes/mobile-first`)

## Summary

A screen-by-screen review (53 screenshots at 390×844 with the mock backend) found and fixed map clutter, developer wording ("backend quote" and so on), a sample HOP50 offer in the live wallet, invented Saved places addresses, the ledger header and mixed text sizes on Review your ride. Those are recorded in `hop-mobile-platform/CLAUDE.md`. These items were left for later.

## Proposed, waiting for approval to build

Motion preview: https://claude.ai/artifact/SLiA5Dj7J7hYKDWHfKYdWk (keeping the Hop brand, per the user on 2026-11-05)

- Launch screen: indigo Hop mark (replacing the old gold Android splash), a dot driving pickup to drop-off until the first screen is ready.
- Place search: shimmering placeholder rows, results slide in with the typed letters highlighted, Current location / Home / Work chips.
- Finding a captain: the current step of the progress line sweeps; rings pulse from the pickup.
- Trip moments, decluttered after the user said the first version was congested: ride accepted, captain arrived, trip complete, cash received, payment success. Each sheet has one headline, one line or detail, and at most one action; status chips sit on the map.
- The same declutter should be applied to the live trip screens (captain found, arrived, trip, payment), which still carry many rows.

## Reviewed 2026-11-05 (second audit, 390×844 and 320×640)

Every trip state (rider searching, accepted, arrived, on trip; captain request, pickup, code, on trip), the booking sheets (payment, promo, passenger, options, fare, meeting), payment pages and captain onboarding were screenshotted with test data. Fixes are recorded in `hop-mobile-platform/CLAUDE.md`. Still open:

- Done 2026-11-05: onboarding review on 320 px phones (and the wrong "7 of 4 verified" count), the location message on short maps, and the simplified rider trip sheet. The full local end-to-end run (ride, onboarding, chat, next ride) passes 4/4.
- Still worth a real two-phone test ride on staging after the next APK.

## Found but not fixed

- **Problem banner over short maps:** when location is off, the map status message ("Turn on location…") sits over the route on Review your ride. Consider moving problem messages into the sheet on booking screens.
- **Choose your ride:** every card says "Availability confirmed during matching". The repetition adds noise; show it once under the heading.
- **Driver tools:** "Driving insights" uses the shield icon, the same as Safety. Use a chart or star icon.
- **Saved places form:** the address field says "Select destination in search or enter address", but a typed address has no map position. Prefer a place search field here.

## Open questions

- Should problem messages on map screens move into the sheet (needs design approval)?
