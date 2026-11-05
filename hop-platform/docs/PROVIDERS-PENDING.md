# Pending provider integrations: payments, SMS, calling

Status on 5 November 2026: **on hold until the product is approved.** Hop is in end-to-end testing and is not public, so these three stay unconnected. Testing uses the development stand-ins described below. Pick this up after approval and before any public launch.

Each section says what already works, what's missing, and the steps to finish it.

| Feature | Code ready | Missing | Rough effort |
|---|---|---|---|
| Online payments (Razorpay) | Mostly | Live keys, webhook registration, device testing, refunds to card or UPI, automatic captain payouts | 3–5 days plus Razorpay KYC |
| Real SMS (OTP) | Mostly | One config bug fix, DLT registration, provider account | 1 day plus 1–2 weeks of DLT approval |
| Rider ↔ captain calling | Placeholder only | A masked-calling provider, backend integration, app buttons | 4–6 days plus provider KYC |

Accounts with Indian providers (Razorpay, MSG91, Exotel) need business KYC, and that usually takes longer than the code. Start the paperwork as soon as the product is approved.

---

## 1. Online payments (Razorpay)

### What works today
- The server creates a Razorpay order (`createPaymentOrder`, [payments.go](../backend/internal/app/payments.go)). The app opens Razorpay's standard checkout ([checkout.ts](../../hop-mobile-platform/shared/payments/checkout.ts)), and the server only marks a payment paid after checking Razorpay's HMAC signature (from checkout or from the webhook). Amounts must match the recorded order.
- Webhook `POST /api/payments/webhook` handles `payment.captured`, `order.paid` and `payment.failed`, with signature `X-Razorpay-Signature`.
- Rider wallet top-up uses the same flow (`purpose='wallet'` in `online_payments`).
- In development (`APP_ENV=development` or `DEV_PAYMENTS=true`) the server returns key `rzp_test_mock`. The app sees this and refuses to open checkout, so no money moves. Cash, direct UPI (QR / `upi://`) and Wallet work without Razorpay, and those are what end-to-end testing uses.

### What's missing
1. **Keys and webhook.** No real `PAYMENT_KEY_ID` / `PAYMENT_KEY_SECRET` / `PAYMENT_WEBHOOK_SECRET` anywhere.
2. **Checkout inside the Android app.** Checkout runs in the Capacitor WebView. UPI-intent payments (GPay, PhonePe) need the WebView to hand `upi://` and `intent://` links to Android, and this hasn't been tested on a phone. If it fails, switch to Razorpay's Android SDK through a small Capacitor plugin.
3. **Refunds go to the Hop wallet only.** `operatorRefund` ([ops.go](../backend/internal/app/ops.go)) credits the rider's wallet. Refunding to the original card or UPI needs Razorpay's refund API (`POST /payments/{id}/refund`) and handling of the `refund.processed` / `refund.failed` webhooks.
4. **Captain payouts are manual.** An operator sends money themselves and types the reference into the payout queue. Automatic payouts need RazorpayX (a separate product with its own KYC).
5. **No daily reconciliation** comparing Razorpay settlements with `online_payments`.
6. **Monthly pass bought online.** The captain monthly pass is paid from earnings or granted by an operator for now (see API.md, "Captain monthly pass"). Paying for it by Razorpay would add a `purpose='pass'` order.

### Steps to go live
1. Finish Razorpay account KYC. Get **test** keys first (`rzp_test_…`).
2. Add the keys to Secret Manager and reference them in `api_secrets` in `infra/gcp/deploy.local.json` (names: `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET`; `RAZORPAY_*` also works).
3. In the Razorpay dashboard, add webhook `https://<api-host>/api/payments/webhook` with events `payment.captured`, `order.paid`, `payment.failed` and the same secret.
4. On a real Android phone, with test keys: pay a ride by card, by UPI collect and by UPI intent, top up the wallet, and close the app halfway through checkout (the webhook must still settle it).
5. Build items 3–5 above if needed for launch.
6. Switch to **live** keys (`rzp_live_…`). Test mode is detected from the `rzp_test_` prefix, so nothing else changes.

---

## 2. Real SMS for sign-in codes

### What works today
- OTP codes for login (`/auth/otp/*`) and phone changes (`/api/profile/phone/*`) are 6 digits, stored as an HMAC, valid for 10 minutes, rate-limited ([otp.go](../backend/internal/app/otp.go), [profile_phone.go](../backend/internal/app/profile_phone.go)).
- Two delivery paths are written:
  - **MSG91 flow API** with a DLT template containing `##otp##`.
  - **A generic webhook** (`SMS_WEBHOOK_URL` + `SMS_WEBHOOK_TOKEN`) that receives `{"to","message"}`, so any provider can be put behind it.
- In development (or `DEV_SMS=true`) the code comes back in the response as `dev_code`, and `123456` always works. Without a provider, production returns 503.

### What's missing
1. **Bug: MSG91 settings are never loaded.** `Config` has `MSG91AuthKey` / `MSG91TemplateID`, and `deploy.py` passes `MSG91_AUTH_KEY` / `MSG91_TEMPLATE_ID`, but `ConfigFromEnv` ([config.go](../backend/internal/app/config.go)) never reads them. MSG91 can't turn on until this is fixed:
   ```go
   c.MSG91AuthKey, c.MSG91TemplateID = os.Getenv("MSG91_AUTH_KEY"), os.Getenv("MSG91_TEMPLATE_ID")
   ```
   Add a config test with it.
2. **DLT registration (TRAI rule).** Every commercial SMS in India must use a registered sender header and template. Without DLT, messages are silently dropped.
3. **Android SMS autofill.** Add the app hash to the template so Android's SMS Retriever can fill the code without the SMS-read permission.
4. **Other messages.** Only OTPs send SMS today. Alerts to emergency contacts, "your captain is on the way" for ride-for-others, and trip-share links all need their own DLT templates and new call sites.

### Steps to go live
1. Register the business on a DLT portal (Jio, Airtel or Vodafone Idea), get a 6-letter sender header (e.g. `HOPRDE`), and register the OTP template, e.g. `##otp## is your Hop sign-in code. It expires in 10 minutes. Do not share it. <app hash>`.
2. Create an MSG91 account, link the DLT entity, and create a flow using that template.
3. Fix the config bug above. Add `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` to Secret Manager and `api_secrets`.
4. On staging, set `DEV_SMS` to false and test sign-in on Jio, Airtel and Vi numbers. Check delivery time (target under 10 s), resend after 30 s, and the 5-per-10-minute limit.
5. Watch MSG91's delivery report for the first week.

---

## 3. Rider ↔ captain calling (masked numbers)

### What works today
- `POST /api/rides/{id}/call` ([ops.go](../backend/internal/app/ops.go) `rideCall`) checks that the caller is on the ride and that the ride is accepted, arrived or in progress, then rate-limits to 10 calls per 5 minutes. In development it stores a **made-up** number in `call_sessions` (`simulated=true`). Everywhere else it returns 503.
- In the apps, "Call captain" / "Call rider" opens a placeholder that says no call is placed ([app.js](../prototypes/mobile-first/app.js), modal `call`). Chat (`/api/rides/{id}/messages`) is the working contact channel.

### What's missing
1. **A provider.** Exotel or Knowlarity (Indian numbers, DLT-ready); Twilio is not recommended for Indian numbers. The usual approach is **click-to-call**: the server asks the provider to ring the caller's real number, then bridges the call to the other person. Neither person ever sees the other's number.
2. **Backend.**
   - Replace the simulated branch in `rideCall` with the provider's click-to-call API. Send both real numbers from `verified_phones`, with a maximum call length.
   - Add a provider status webhook (answered, missed, duration) that updates `call_sessions`, and drop the `simulated` flag for real calls.
   - Allow calls only while the ride is active, plus 30 minutes after completion for lost items.
   - New config: `CALL_PROVIDER_SID`, `CALL_PROVIDER_TOKEN`, `CALL_PROVIDER_CALLER_ID` (the virtual number).
3. **Apps.** Wire the call buttons to `POST /api/rides/{id}/call` and show "We're calling you now, pick up to connect" plus a clear error if it fails. Only the backend decides whether a call is possible; never place a call by `tel:` to the other person's number.
4. **Records.** Keep call logs (not recordings) for disputes and safety reviews. Recording calls needs consent wording and a retention policy first.

### Steps to go live
1. Create an Exotel account (business KYC), buy one virtual number, and register its DLT voice template if asked.
2. Build backend items 2 and app items 3 behind a config check: calling turns on only when the provider settings are present, and otherwise the app keeps showing "use chat".
3. Test on two real phones on different networks: rider calls captain, captain calls rider, an unanswered call, a call after the trip ends (must be refused), and the rate limit.

---

## Release checklist after approval
- [ ] Razorpay KYC done, test keys working on a real phone, webhook registered
- [ ] MSG91 config bug fixed, DLT sender and template approved, OTP delivered on all three networks
- [ ] Exotel integrated, both directions of calling tested on two phones
- [ ] `DEV_SMS` and `DEV_PAYMENTS` are **off** in the deployed config
- [ ] Live keys swapped in, and one small real payment refunded end to end
