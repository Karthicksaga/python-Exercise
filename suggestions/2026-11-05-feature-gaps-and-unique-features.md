# Feature gaps and unique features

- **Date:** 5 November 2026
- **Status:** Proposed. Some items have moved on since; see "Progress" at the end.
- **Scope:** What the Rider and Captain mobile apps (the only apps that ship) can do today, compared with what a ride-hailing launch needs.

## Summary

Hop's feature set is broad: booking, dispatch, payments, onboarding, safety tools, captain tools and an admin console. The main gaps are what turns a demo into a business: calling, revenue, cancellation rules and local language. Many features exist in the backend or the old web app but haven't reached the mobile apps.

## Major gaps (in priority order)

| # | Gap | Evidence |
|---|---|---|
| 1 | Rider and captain can't phone each other | "Call captain" / "Call rider" opens a placeholder (`hop-platform/prototypes/mobile-first/app.js`, modal `call`). `POST /api/rides/{id}/call` returns 503 outside development (`ops.go`, `rideCall`). |
| 2 | No revenue model | Every quote returns `commission_paise: 0` (`quotes.go`). |
| 3 | No cancellation or no-show rules | No cancellation fees and no no-show handling in the backend. A waiting charge exists. |
| 4 | English only | The mobile language picker says "previewed locally". A Chennai launch needs Tamil at least. |
| 5 | SOS stops at dialling 112 | It logs an incident and dials 112. No live operations response, and emergency contacts aren't alerted automatically (no SMS provider). |
| 6 | Not proven in the real world | No physical-device testing yet. Real SMS, Razorpay, push and background tracking are unverified. |
| 7 | No fraud controls or monitoring | Nothing catches fake GPS, promo abuse or duplicate accounts. No metrics, tracing or crash reporting. |
| 8 | Smaller gaps | No iOS app. Shared rides exist in the backend but not in the mobile apps. Fares have no tolls or airport fees. Trip history stops at 50 trips. |

## Unique feature ideas

Each builds on something Hop already has.

1. **Monsoon mode (Chennai).** Live captain GPS shows which streets have stalled; route around likely flooded streets, with a public "no surge above X during rain" promise. Builds on: live GPS, OSRM routing, surge caps.
2. **"Book for Amma": rides for parents without the app.** You book, your parent gets the captain's details and pickup code by SMS, you watch the trip live and pay from your wallet. Builds on: family accounts, ride-for-others.
3. **Safe arrival.** For night or solo rides, the trip isn't "safe" until the rider confirms they're home; if not, emergency contacts are alerted and ops gets a ticket. Builds on: the ride check-in (`rideCheck.ts`) and emergency contacts.
4. **Metro last mile.** An auto timed to your Chennai Metro arrival, with pickup at the right station gate. Builds on: airport and railway pickup points.
5. **Corridor commute pass.** A fixed monthly price on a home-to-office corridor. Builds on: direction-aware matching. This is the parked Hop Commute idea in a simpler form.
6. **Captain fairness dashboard.** Shows captains why a ride went to them or someone else, with a way to appeal. Builds on: the dispatch matching report.

## Recommendation

Fix gaps 1–4 first, starting with a telephony provider and a captain revenue model. Then pick one or two unique bets; Monsoon mode and "Book for Amma" fit a Chennai launch best and reuse the most code.

## Progress since this review

- **Gap 1 (calling), SMS and payments:** deferred until product approval. The plan is in `hop-platform/docs/PROVIDERS-PENDING.md`.
- **Gap 2 (revenue):** the captain monthly pass is built (migration 039; `hop-platform/docs/API.md`, "Captain monthly pass"). It's off by default per zone.
- **Chat:** rebuilt as a reusable module with instant delivery, read receipts and unread counts (migration 040; API.md, "Chat").
