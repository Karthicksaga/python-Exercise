# Compact UI redesign (proposal, 5 Nov 2026)

Status: **Approved and partly built (5 Nov 2026)**: slide to accept/complete, captain online switch, cash change helper, folded vehicle rows and early-finish question are in the apps. Still to build: pickup-spot screen (needs server data), merging Review into Choose your ride, rider home header. Preview: https://claude.ai/artifact/78gPbf4hv57Yr89QFL51Ay (six phone screens; the Captain Drive switch can be tapped).

Phone testing showed that the controls take too much room: a floating bottom nav card, a full-width "Take a break · Go offline" button, large header pills, and "Unavailable" vehicle rows. The map ends up under half the screen.

## What changes
| Screen | Today | Proposed |
|---|---|---|
| Rider home | Logo pill, calendar and bell; search card; Home/Work cards, trip-type chips and "usual ride" in the sheet | One 44 px header row (logo, bell). Search "Where to?" sits right under it with a "Now" chip, so scheduling moves into search. The sheet holds Home/Work and one recent trip. Map ≈ 65% of the screen. |
| Where to | Boxed pickup/destination card with labels above, a separate "Add a stop" / "Now" row | Pickup and destination as two underlined lines joined by a route line. "+" (stop) sits inside the destination field. Home / Work / Pick on map chips. Results show the typed letters highlighted and the distance. |
| Choose your ride | Title pill, a large route card and 5 vehicle rows (3 "Unavailable") | Back button plus a one-line route pill (tap to edit). 2 available vehicles, then "Mini cab, Sedan and SUV aren't available for this trip" in one line. One bottom row: payment chip (Cash) and "Book Auto · ₹77". |
| Captain drive | "You're online" pill, earnings pill, 4 map buttons, a large "Take a break · Go offline" button | An **Online switch** in the header (green track; tap to go offline). A dark earnings chip ("Today ₹25 · 1 trip"), one map button, a sheet line "Looking for rides" and the daily goal bar. Turning the switch on also starts location sharing, so the separate GPS button can go. |
| Captain on trip | Turn banner, sheet with 3 round actions, a "Full-screen navigation" link and Complete trip | A dark turn card (distance and street, safety button). Sheet row: destination, ETA pill, Message and Google Maps icon buttons. Complete trip. |
| Cash received | Large headline, grey tick, receipt table, rating and Done | A green tick and "Cash received ₹25.00, added to today's earnings". Short route, star rating, then "Rate 5 stars & go online" or "Skip rating". |

## Rules behind it
These rules now also live in `.agents/skills/hop-design-review/SKILL.md`:
- The bottom nav is docked and 64 px.
- Top chrome is at most 112 px.
- One primary action per screen.
- An on/off state is a switch, not a button.
- Input focus has no box.
- No server words on screen.

## Needs a decision
1. Approve as a whole, or screen by screen.
2. Captain switch: going online also shares location, so the separate GPS control would be removed. Today, reopening the app while online needs that GPS tap (`PrototypeMap.ts`, "tap GPS sharing so riders can find you"). With the switch, sharing would resume on app open while online, after the captain has given location permission once.
3. Rider home: the trip types (City / Hourly rental / Outstation) move into the search screen.

## Feedback round 1 (5 Nov 2026)
The user liked the direction. Changes made to the preview:
- **Pickup / Drop map labels:** kept, but smaller (20 px tall, 10 px text).
- **Choose your ride:** keeps the real vehicle pictures (auto, bike). Unavailable cars are one dimmed "Cars" row with the car picture, not three "Unavailable" rows.
- **Captain on trip:** the sheet now fits its content, with no empty band under "Complete trip". Message and Google Maps are two equal labelled buttons in one row, instead of small icons squeezed beside the destination.

## Feedback round 2: route choosing animation
The current animation stays: the route draws from pickup to drop-off, a light travels along it, and the pins pop in. One addition: alternative routes show as grey lines with tap tags ("13 min Fastest", "15 min 2.8 km"). Tapping a tag makes that route indigo, the draw-in plays again, and the summary under "Choose a ride" changes. The live app already has alternatives (`hop-route-pick`, `setAlternatives` in `osm.ts`), so this mainly restyles the tags. Reduced motion shows the finished route at once.

## Feedback round 3: slide actions, cash screen
- **Slide to accept** (new Ride request screen) and **slide to complete trip** (On trip) replace the tap buttons.
  - Complete needs 85% of the slide, so a pocket tap or a road bump can't end a trip early. Today's ₹25 early-finish ride was likely an accidental tap.
  - Accept needs 70%, because the offer is on a 15-second timer.
  - Releasing early snaps the knob back. The knob is a real button: Enter or Space confirms, for keyboard and screen-reader users.
- **Cash received:** "Rate 5 stars & go online" is replaced by "Back to rides". It mixed two actions, assumed 5 stars, and captains are still online after a trip anyway. Stars start grey and are marked optional.

## Feedback round 4: pickup spot and cash change (UX review items 1 and 3)
- **Rider · Confirm pickup spot** (new, between Where to and Choose your ride):
  - The map shows up to 3 named spots near the pickup (Main gate, Bus stop, Pharmacy side entrance).
  - Tapping a spot on the map or in the list moves the pin, redraws the walking line and updates "Meet your captain at…".
  - Show this step only when GPS isn't already at a named spot.
  - Data: places search plus spots captains confirm after pickups. That needs a small server table, not built yet.
- **Captain · Collect cash** now comes before "Cash received":
  - The captain taps what the rider gave (Exact / ₹100 / ₹200 / ₹500) and sees "Give back ₹23".
  - Then they tap "Cash received" (or "Rider didn't pay").
  - The received step shows the optional star rating (now tappable) and "Back to rides".
  - All of it runs on the phone; the server work is the existing payment_received action.

## Feedback round 5: keep the vehicle ride preview
The user likes the animation where the booked vehicle drives from pickup to drop-off. It is unchanged in the app (`RoutePreview.ts`, started by `PrototypeMap.startRoutePreview` on the Review screen, with a replay badge).

The redesign books straight from Choose your ride, so the preview moves to that screen:
- After the route draws in, the chosen vehicle drives pickup → drop-off once.
- "Replay ride" plays it again, and so does picking another route.
- Reduced motion skips it.

When building, keep `RoutePreview` and change `isConfirmScreen()` to also match the Choose screen once Review is merged into it.
