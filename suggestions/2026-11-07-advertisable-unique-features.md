# Unique features we can advertise (7 Nov 2026)

Status: **Proposed**

## Why
Hop needs a few promises that are easy to say in one line, easy to prove in the app, and that the big apps (Uber, Ola, Rapido, Namma Yatri) don't make.

Already built and advertisable today:
- Fair wait clock, pickup beacon and fare story
- Ride notes in the captain's language, language bridge in chat, voice destination
- Arrival alert
- Chai break and Home by
- Slide to confirm
- 3D map with landmarks ("near Central Station Bus Terminus")

Earlier ideas still open (5 Nov review): Monsoon mode, Book for Amma, Safe arrival, Metro last mile, Commute pass, Captain fairness dashboard. This list doesn't repeat them.

## New ideas, best advertising value first
| # | Idea | Ad line | What it is | Why it stands out | Builds on | Effort |
|---|---|---|---|---|---|---|
| 1 | **Price promise** | "The price you see is the price you pay — or we pay the difference." | If the final fare is above the locked quote for any reason other than the shown wait time or a rider-changed route, the difference goes back to the wallet automatically, with no complaint needed. | Others lock prices but you still have to dispute extras yourself. Here the fare story already proves every rupee, so the refund can be automatic. | Price lock, fare story, wallet | S–M |
| 2 | **Meter-honest auto fare** | "See the government meter fare next to ours." | The auto fare screen shows the official Tamil Nadu meter fare for the same distance beside Hop's fare. | Meter refusal is a daily Chennai fight. Showing both is a trust signal no app shows today. | Route distance, quotes | S (needs the current official tariff from operations) |
| 3 | **Accepted means coming** | "Once your captain accepts, they come." | If a captain cancels after accepting, the rider gets priority rematch plus a small wallet credit, and that captain's acceptance rate is visible to them in Driver tools. | Captain cancellations are the top complaint about ride apps in India. A guarantee with a credit is easy to advertise. | Priority rematch (prototype), wallet | M |
| 4 | **Book without internet** | "No smartphone? SMS 'HOP Adyar to Central'." | Book by SMS or a missed call; trip updates come back by SMS (SMS backup is built). | Reaches parents and feature-phone users. As far as we know, no Indian ride app books by plain SMS. | SMS updates, places search | M (needs the SMS provider) |
| 5 | **Your usual captain** | "Ride again with the auto anna you trust." | After a 5-star trip, "Save Murugan as a favourite". Next booking offers him first if he's within a few minutes. | Matches how Chennai already uses "our auto". Big apps match strangers every time. | Ratings, dispatch rounds (offer first, then the normal round) | M |
| 6 | **Train-aware pickup** | "Your auto waits for your train, not the timetable." | Book a pickup for a train arrival at Chennai Central or Egmore. The pickup moves with the train's delay, and the captain is told which gate. | Uber tracks flights; no one does Indian trains. | Scheduled rides, station pickup points | M–L (needs a reliable train-status source; there's no official public API, so check licensing first) |
| 7 | **Captain comfort map** | "The app that remembers captains are people." | On the captain map, an optional layer of public toilets, drinking water and tea stalls (OpenStreetMap data), plus fuel and CNG on long trips. | Builds on chai break; a strong recruiting message for captains. | The new 3D map's landmark layer | S |
| 8 | **Left something behind?** | "Hop checks the back seat for you." | At trip end the captain gets "Check the back seat" with one tap for "Found something". The rider gets a lost-item card with the captain's chat for 24 hours. | Lost phones are common. A built-in flow beats "call support". | Chat, trip end | S |

## How to advertise them safely
- Before any "only app" claim, re-check the competitors in the week of the campaign, and keep the evidence: Indian advertising standards (ASCI) require it.
- Promises with money (1, 3) need written rules (limits, abuse checks) agreed with operations before launch.

## Recommendation
- Lead the launch with **1 (Price promise)**, **2 (Meter-honest fare)** and **3 (Accepted means coming)**. They target the three biggest complaints (surprise fares, meter fights, cancellations), and Hop already has most of the plumbing.
- Then **5 (Usual captain)** for loyalty, and **7 (Captain comfort map)** for captain recruitment.
- Build in that order, and prototype first as before.
