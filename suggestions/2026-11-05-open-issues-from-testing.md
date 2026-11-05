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

## 4. Operator portal sign-in is broken on staging

- **What happens:** "Sign in" on the staging operator portal (`https://hop-staging-admin-qp262su4sq-el.a.run.app`) goes to Google, which answers "Error 401: invalid_client — The OAuth client was not found".
- **Cause:** staging's `OIDC_CLIENT_ID` is the placeholder `hop-web`, which `hop-platform/infra/gcp/setup_gcp.py` writes into the generated config. No real Google OAuth client was ever created for staging. The `hop-oidc-secret` secret has nothing real to pair with.
- **Effect:** nobody can sign in to the operator portal on staging, so captain approvals, zones, pricing, passes and refunds can't be managed there. The Rider and Captain apps are unaffected (they use phone codes).
- **Status (5 Nov):** code side done (not yet deployed): Google-compatible `prompt`, `OPERATOR_EMAILS`, deploy validation, `infra/gcp/set_oidc_client.sh`, steps in `hop-platform/docs/GCP-CICD.md`. Waiting on the Google OAuth client, which must be created in the console. A second blocker was found on the way: the API sent `prompt=login`, which Google rejects.
- **Fix:** create a Google OAuth client (Web application) with the staging callback URLs, put its ID in the deploy config and its secret in `hop-oidc-secret`, redeploy, sign in once, then promote that account to operator. Separately, `setup_gcp.py` should stop writing a placeholder that passes validation; `deploy.py` only checks that the ID isn't empty.

## 5. Test setup limits (not product bugs)

- **Rider quote limit:** back-to-back runs with the same rider hit it (15 per minute). `chat.e2e.mjs` now uses a new rider per repeat.
- **Captain sign-in code limit:** the fixed test captain (`9000000002`) hits it (5 per 10 minutes) after about 4 back-to-back sign-ins.
- **Public services:** the free place-search (Photon) and routing (OSRM demo) services time out now and then, which fails the ride tests. Set `HOP_E2E_GEOCODING_URL` / `HOP_E2E_ROUTING_URL` to private services for stable runs.

## 6. From phone testing on 5 November (not fixed yet)

- **Captain button alignment:** reported along with the camera bug, but no captain screenshot yet. Needs a screenshot of the affected screen. The camera itself is fixed: `@capacitor/camera` was missing from the captain's native project.
- **Razorpay "Payment could not be completed":** the checkout now fits the screen and pre-fills the verified mobile number, but the payment itself failed on Canara Bank netbanking. Check whether staging uses test keys (`rzp_test_…`, where only Razorpay's test methods succeed) or live keys. Payments stay deferred until product approval (`hop-platform/docs/PROVIDERS-PENDING.md`).
- **Rotate the Google OAuth client secret:** it was pasted into a chat. Add a new secret on the client, re-run `infra/gcp/set_oidc_client.sh`, then delete the old secret.
