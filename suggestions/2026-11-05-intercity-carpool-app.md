# Intercity carpool app (BlaBlaCar-style) next to Hop

- **Date:** 2026-11-05
- **Status:** Proposed. Clickable prototype for review: `hop-mobile-platform/prototypes/pool-01/` (preview: https://claude.ai/artifact/5ZaY6MAChe4VJCmMmqbt2W). No app or backend code yet.
- **Scope:** A third app for seat-sharing between cities, with its own backend, run from the same operator console

## Summary

Possible, and a good fit: Hop already has the hard shared parts (phone sign-in, captain document checks, chat, push alerts, maps, payments groundwork, operator console). A carpool app differs from Hop rides in its core: trips are published days ahead, passengers book seats, and the price is a share of fuel cost, not a fare.

## Market and legal facts (web search, 2026-11-05)

- India is BlaBlaCar's largest carpooling market (about a third of its global activity, 12.1 million passenger journeys in H1 2026). It charges nothing in India; passengers pay drivers directly.
- MoRTH's Motor Vehicle Aggregator Guidelines 2025 let states allow private (non-transport) motorcycles on aggregator apps. Reporting found nothing extending this to private cars. Paid carpooling in private cars is a grey area decided state by state.
- So: get a legal opinion for Tamil Nadu before launch, keep prices to cost-sharing (no profit for drivers), and don't take a commission on private-car seats until that opinion says it's allowed.

## Recommended architecture

| Part | Shared with Hop or separate | Why |
|---|---|---|
| Accounts and phone sign-in | Shared | One person, one account across apps; reuses OTP and sessions. |
| Driver verification (licence, RC, insurance, photo) | Shared | Same documents and the same operator review queue. |
| Operator console | Shared, new "Pool" section | Same operators, same Google sign-in. |
| Chat, push alerts, maps | Shared code (`shared/chat`, `shared/maps`, FCM) | Already reusable by design. |
| Trips, seats, bookings, pricing, reviews | Separate service and database | Different model: scheduled trips, seat inventory, cost-sharing caps. Keeps Hop's matching and money rules untouched. |
| Payments | Separate ledger, shared provider | Cash or direct UPI first (as BlaBlaCar does in India); online later through the same payment provider. |

- New Go service `hop-pool` (own Cloud Run service and its own database on the existing Cloud SQL instance, to keep costs low).
- It trusts Hop sign-in by checking the session with the main API (or a short-lived signed token), so there is no second login.
- The operator console calls both APIs; operator rights stay in the main API.
- One new mobile app for both roles ("Find a ride" and "Offer a ride"), built with the same renderer approach and design tokens.

## What could make it stand out

- Verified drivers using Hop's existing document checks.
- Women-only rides.
- Book a Hop bike or auto to the pickup point and from the drop-off: no competitor links intercity seats with city rides.
- Focus on Tamil Nadu routes first (Madurai, Chennai, Coimbatore, Trichy).

## Open questions

- Working name: "Hop Pool" or something else?
- Cars only, or also intercity bikes?
- Cash/UPI to the driver only at first, or online payment from day one?
- Legal opinion for Tamil Nadu before any build?
