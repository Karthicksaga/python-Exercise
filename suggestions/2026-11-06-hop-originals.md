# Hop originals: UX ideas other ride apps don't have (6 Nov 2026)

Status: **Approved; phase 1 built 6 Nov 2026** (fair wait clock, pickup beacon, fare story; see hop-mobile-platform/CLAUDE.md). Shown in the prototype https://claude.ai/artifact/SSuyWApGcrtBFFugtqA1r1 (marked NEW). Nothing is built in the apps.

## What others already have
From a web scan, Nov 2026:
- Uber India: Price Lock, Wait & Save, airport priority, audio recording.
- Bolt: audio recording, trip sharing, SOS, "vehicle stopped too long" check-in, women-only rides, rider photo.
- Rapido, Ola, Uber and Namma Yatri: zero-commission subscriptions for auto drivers.

Hop already has trip sharing, SOS, RideCheck and price lock, so these ideas target the gaps.

| Idea | Screen | Why it's different | Needs |
|---|---|---|---|
| **Pickup beacon** | Rider "Captain is here"; Captain pickup | The rider's screen glows the trip colour (teal) and the captain is told "look for a teal phone". It solves finding each other at a crowded gate or at night, which no app handles. | Phone only (colour per trip from the server). |
| **Fair wait clock** | Rider "here"; Captain code | Both sides see the same free-wait countdown, then ₹1/min. Waiting-fee disputes end because nobody is guessing. | Server already tracks arrival time; show `free_wait_seconds`. |
| **Language bridge** | Chat; ride notes; quick replies | Each person reads messages in their own language (Tamil ↔ English shown). | A translation service on the chat API. |
| **Ride notes** | Review → Captain request and pickup | "Quiet ride · Luggage · Help boarding · On a call", shown to the captain in their language. | One optional field on the ride. |
| **Fare story** | Pay screen | The fare explained as a short timeline: locked price, wait, route, final. Directly fixes the "₹25 vs ₹62" confusion. | Data the server already has (quote, early-finish, wait). |
| **Arrival alert** | Rider on trip, Paid | One switch: a family contact gets "Deepa reached … ✓" when the trip ends, without watching a live map. | SMS or WhatsApp to an emergency contact. |
| **Speak your destination** | Where to | Voice search in English, Tamil or Hindi. | Speech-to-text and places search. |
| **Chai break** | Captain Drive | After about 4 h online, a gentle 15-min break with requests paused and the captain's place kept. | A dispatch pause flag. |
| **Home by 9 pm** | Driver tools | A time-based go-home mode: from 8 pm, only rides that bring the captain closer to home. | Dispatch filter by heading. |
| **SMS backup** | Rider on trip | Trip updates fall back to SMS when the internet drops. | SMS provider (see PROVIDERS-PENDING). |

## Unhappy paths in the prototype (25 screens, "When things go wrong")
- **Rider:**
  - location off; outside the service area; no captain found (try bike, schedule, notify)
  - cancel: free in the first 2 min, or ₹20 once the captain is there (red slide)
  - captain cancelled (priority rematch, no charge); no internet on trip (SMS backup)
  - RideCheck off-route check; SOS (112 shown as text, live location, audio)
  - trip ended early (fare story, ₹25 of ₹77); online payment failed; captain says unpaid
  - low rating with reasons and "don't match me again"
- **Captain:**
  - location off; request expired; rider cancelled (₹20 for the drive)
  - rider not here (₹30 claim slide); finish early (₹25, or ask for the full fare)
  - cash not received (report slide); no internet on trip (saved, syncs later)
  - insurance expired (can't go online); licence photo rejected (tips, retake)
  - payout failed (fix UPI ID); account on hold (fair review); SOS
- **Fees and policies** (₹20 cancel, ₹30 no-show, ₹1/min after 3 min free wait): example values to agree with operations before building.
