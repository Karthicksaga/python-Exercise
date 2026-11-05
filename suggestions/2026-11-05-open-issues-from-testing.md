# Open issues found during testing

- **Date:** 5 November 2026
- **Status:** Not fixed. Found while building and testing chat and the captain monthly pass.

## 1. Captain's Accept tap sometimes ignored (intermittent)

- **What happens:** the captain taps "Accept ride" while the request is live, but no accept request reaches the server. 15 seconds later the request screen is still showing ("Only you have this request · 6 s to accept") and the server still lists the offer.
- **How often:** about 3 in 15 runs of `e2e/chat.e2e.mjs`. In an isolated test, 6 instant accepts out of 6 worked, so it wasn't reproduced on its own.
- **What it isn't:** chat code doesn't run on the captain's side before Accept. The app's single action lock (`LiveJourney.run`) was free whenever it was logged.
- **Next step:** `chat.e2e.mjs` now prints the screen text and live offers when this happens. Watch for it during phone testing too. Start with the click path in `LiveJourney.click` (`action === "accept"`).

## 2. Sample name on the captain's request card

- **What happens:** the request card shows "Estimated fare (Demo Rider)", a sample name from the design preview, instead of the real rider's name.
- **Where:** the captain `request` screen in `hop-platform/prototypes/mobile-first/app.js`, which isn't overwritten by the live adapter.
- **Why it matters:** project rules say sample people must never appear in live screens.

## 3. Chat design changes waiting for approval

Built in `hop-mobile-platform/shared/chat/RideChat.ts` and the chat section at the end of `style.css`:

- Message statuses under your own bubbles: Sending… / Sent / Seen / Not sent · Tap to retry.
- An unread count on the trip screen's Message button.
- A "<name> is typing…" line.
- Quick-reply copy: "Wearing blue shirt" (preview text) became "Please wait 2 minutes", and captains got "Stuck in traffic".

The captain monthly pass card and sheet on Earnings (`LiveAccount.ts`) are also new screens that need design approval.

## 4. Test setup limits (not product bugs)

- **Rider quote limit:** back-to-back runs with the same rider hit it (15 per minute). `chat.e2e.mjs` now uses a new rider per repeat.
- **Captain sign-in code limit:** the fixed test captain (`9000000002`) hits it (5 per 10 minutes) after about 4 back-to-back sign-ins.
- **Public services:** the free place-search (Photon) and routing (OSRM demo) services time out now and then, which fails the ride tests. Set `HOP_E2E_GEOCODING_URL` / `HOP_E2E_ROUTING_URL` to private services for stable runs.
