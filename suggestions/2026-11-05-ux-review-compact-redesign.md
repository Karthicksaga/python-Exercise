# UX review of the compact redesign (5 Nov 2026)

Status: **Proposed**. This reviews the preview at https://claude.ai/artifact/78gPbf4hv57Yr89QFL51Ay. Items are ordered by how much they help riders and captains in Madurai, and nothing here is built yet.

## Do first (high impact, small to medium work)
1. **Exact pickup point.** Snap the pickup pin to the nearest named spot (gate, shop or bus stop) and show "Pickup: Nivetha Clinic main gate · 1 min walk". Wrong pickup spots cause most call-backs and waiting fees in Indian cities. Data: places search plus saved spots that captains confirm.
2. **Tamil and English.** Add a language switch in Account, with Tamil copy on the Captain app first: the ride request, slide labels, trip and cash screens. Many captains read Tamil faster, and those screens are read at a glance while driving.
3. **Cash change helper (Captain cash screen).** Add "Rider gave: ₹100 / ₹200 / ₹500" chips that show "Give back ₹23". This saves arguments and arithmetic at the roadside. It runs entirely on the phone, so no server work.
4. **Haptics and sound on key moments.** A short vibration when a slide completes, when a ride request arrives, and on "Captain is here". Today these moments only have sound, which is missed in traffic. Capacitor Haptics is a small plugin.
5. **Night driving mode for the Captain app.** After sunset, switch the on-trip and request screens to the dark map style (the app already has a Night map preference), with dimmer sheets. Bright white sheets dazzle at night.

## Next (clear wins, more design)
6. **Ride request glanceability.** Show three numbers in large text: earning, pickup distance and trip distance. Show the rider's rating only if the server sends it. Let the 15 s timer bar change colour in the last 5 s.
7. **Fare trust.** Tapping the fare on Choose your ride opens the breakdown (base, distance, time, discounts), with "Price locked for 5 min" while booking. An early-finish fare then shows "Charged for 1.2 km of 3.1 km" on both payment screens, so ₹25 against ₹62 is never a surprise.
8. **Matching screen** (not drawn yet). Pulsing rings on the pickup, "Finding a captain near you", and "Free to cancel for 2 min" with a countdown. Keep it in the same compact sheet as Choose your ride, so the screen doesn't jump.
9. **Rider at pickup.** Show the number plate as the largest text (TN22EB2250), the captain's photo, and the pickup code. Share trip and Safety go in one row. Riders look for the plate first, not the name.
10. **Earnings chip → today's breakdown.** Tapping "Today ₹25 · 1 trip" opens trips, cash vs online and the goal. If no goal is set, offer a one-tap goal (₹500 / ₹1,000 / ₹1,500) instead of "no goal set".

## Polish (consistency)
11. **One set of sizes.**
    - Control radius 12, sheet radius 20; buttons 44 (secondary) and 52 (primary); sliders 56.
    - One shadow for floating controls and one for sheets.
    - Write these into `hop-mobile-design` once approved.
12. **States for every screen:**
    - loading: skeleton rows, already used in search
    - offline: a thin banner, "No internet · retrying"
    - errors: plain words and one action
13. **Large text.** Check every redesigned screen at 200% font size. Sheets should grow and scroll, and the slide knobs and labels must not clip.
14. **Fewer words.** For example, "Captains checked when you book" can go if the timing ("4 min away") comes from the server. Show a line only when it is real data.

## How to check
`npm run test:audit` covers flush bars, tap sizes and accessibility. Add each redesigned screen to it as it's built, and add a 200% text pass for item 13.
