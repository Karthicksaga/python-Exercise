# API contract

All business endpoints are same-origin JSON. Unsafe requests require `Content-Type: application/json`, exact `Origin: PUBLIC_ORIGIN`, an authenticated HttpOnly session cookie, and `X-CSRF-Token` returned by `/api/me`. Unknown JSON fields, oversized bodies and multiple JSON values are rejected. Errors are `{ "error": "human-readable message" }` with non-2xx status.

| Method/path | Access | Purpose |
|---|---|---|
| GET /api/config | Public | Active service areas, enabled vehicle pricing and platform fee |
| GET /auth/login | Public, rate limited | Begin OIDC + PKCE sign-in |
| GET /auth/callback | One-use state and nonce | Verify identity and rotate local session |
| GET /api/me | Signed in | Account and session-bound CSRF token |
| POST /api/profile | Signed in | Update display name; verified identity/email remain provider-managed |
| POST /auth/logout | Signed in + CSRF | Revoke local session |
| POST /api/locations | Signed in | Save or update an owned Home, Work, or Favorite location |
| POST /api/locations/{id}/delete | Owner | Remove an owned saved location |
| GET /api/places?area_id=UUID&q=text | Signed in | Area-filtered address search |
| POST /api/quotes | Signed in | Road quote; pickup/dropoff `{lat,lng,label}`, `area_id`, and optional `vehicle_category` (defaults to `bike`) |
| POST /api/rides | Signed in | `{quote_id,request_key,payment_method}`; UUID request key, cash/upi |
| GET /api/state | Signed in | Own trips, driver profile, eligible nearby offers, own incidents |
| POST /api/rides/{id}/actions | Trip participant / eligible driver | `{action,version,code?,reason?}` |
| POST /api/rides/{id}/rating | Completed ride participant | `{score:1..5,comment?}`; one rating per participant |
| POST /api/drivers/apply | Signed in | Application; cannot self-approve |
| POST /api/drivers/location | Approved driver | `{lat,lng,accuracy}`; server-received time controls freshness |
| POST /api/drivers/offline | Signed in | Stop new request eligibility |
| POST /api/drivers/preferences | Driver | `{pickup_radius_meters,minimum_fare_paise}`; pickup radius 500–20000 metres and minimum fare 0–1000000 paise |
| GET /api/drivers/earnings | Driver | Daily, current-week/month and all-time completed-fare totals plus the 50 most recent completed ride receipts |
| POST /api/incidents | Ride participant | `{ride_id,message}` |
| GET /api/operator | Operator | Areas, reviews, incidents and recent audit events |
| POST /api/operator/areas | Operator | Create/update area, paise pricing and activation reference |
| POST /api/operator/pricing | Operator | Configure and enable `auto`, `mini`, `sedan`, or `suv` pricing for an area |
| POST /api/operator/drivers/{id} | Operator, not self | `{status:approved|suspended,note}` |
| POST /api/operator/incidents/{id} | Operator | `{status:reviewing|closed,resolution}` |

`request_key` is an idempotency key for booking. Repeat the same key/body after an uncertain network response. Reusing it for a different quote/payment method returns 409. Quotes belong to one rider, cannot be reused for multiple rides, and expire after two minutes. `fare_paise` is an integer; there is no platform commission field clients can increase.

`GET /api/config` returns `vehicles` with enabled categories and their fare rules for each active area. The initial category set is bike, auto-rickshaw, mini cab, sedan, and SUV; only bike is enabled by default. Operators configure the other categories before enabling them. Quotes snapshot category, pricing version, and base/distance/minimum fare components. Drivers apply under one vehicle category and only receive or accept matching requests. Drivers can configure a 500–20000 m pickup radius and minimum acceptable fare; both are checked when offers are listed and revalidated during transactional acceptance. Rental/hourly, outstation and multi-stop trips are priced through the same quote endpoint (see *Trip types, negotiation, dispatch, login and payments* below).

Profiles currently permit display-name editing only; verified sign-in identity and email cannot be changed through this API. Saved locations are private to the account and limited to Indian coordinate bounds. Ratings are available only to participants after completion, are single-submit per participant, and are written to the audit trail.

Driver earnings are calculated from completed ride fares with zero platform commission. Reported-paid amounts reflect the driver's manual cash/UPI receipt report only; they are not gateway-confirmed. The server stores completion time separately from later payment-status changes so period totals remain stable. Receipt history is limited to the 50 most recent completed trips.

`POST /api/quotes` returns the selected route as `route: [{lat,lng}, ...]` in route order. The geometry is saved with the quote and included in participant ride objects from `GET /api/state` and eligible driver offers, so clients can continue drawing the same road route after booking. It is routing-provider geometry, not a straight line; local development uses synthetic fixture geometry and must not be presented as real navigation.

Actions: `accept`, `arrive`, `start`, `complete`, `cancel`, `payment_received`, `payment_disputed`. `version` must match the latest trip version. A 409 requires refreshing the trip, not blindly replaying an action. Driver acceptance checks approval, document validity, area, online status, server location age ≤60 seconds, distance ≤3 km, and no active assignment. UPI requests require a driver UPI ID.

`start` requires the rider's six-digit `pickup_code`. The code is only returned to its rider while accepted/arrived. Five wrong attempts lock that ride's start action; cancellation/support remains possible. Never log or embed pickup codes in analytics.

Completion leaves payment `unconfirmed`. Drivers can report receipt; riders can dispute it. A disputed payment cannot be overwritten by the driver. This is a report, not payment-provider verification. Incident resolution is audited separately.

Most-recent limits: 50 participant trips, 20 offers, 20 own reports, 100 operator records. These are bounded initial views; paginated archive/search endpoints are a required addition for larger operations. Region boundaries currently validate trip endpoints against a reviewed rectangle; they are not legal-state polygon or full-route containment validation.

## Rider companion endpoints (migration 007)

All require a session and CSRF token except `GET /api/share/{token}`.

| Endpoint | Purpose |
|---|---|
| `GET /api/companion` | Preferences, in-app notifications, referral code/points, family, favorite drivers, scheduled rides, lost items. Also settles referral rewards once the referred rider has a completed ride. |
| `POST /api/preferences` | Language (en/hi/ta/te/kn/ml/bn/mr/gu/pa), accessibility needs, notification opt-in. |
| `POST /api/notifications/read` | Mark all notifications read. |
| `POST /api/rides/{id}/sos` | Active-ride SOS (optional `lat`/`lng`); creates an operator incident. Does not contact emergency services — call 112. |
| `POST /api/rides/{id}/share`, `/share/revoke` | Rider creates/revokes a 6-hour live-trip link. |
| `GET /api/share/{token}` | Unauthenticated, rate-limited view: status, labels, driver first name, vehicle number, driver location. Never exposes the pickup code. |
| `POST /api/rides/{id}/lost-items` | Report an item after a ride has ended; also opens an incident. |
| `POST /api/referrals/redeem` | Apply a friend's code before your first completed ride; 100 points each on first completion. |
| `POST /api/family/invite`, `/{id}/respond`, `/{id}/delete` | Invite a registered rider by email (max 6), accept/decline, remove. |
| `POST /api/favorite-drivers`, `/{id}/delete` | Favorite the driver of one of your completed rides (`ride_id`). |
| `POST /api/scheduled-rides`, `/{id}/cancel` | Store a future ride plan (15 min–30 days ahead, inside an active area). |

`POST /api/rides` (migration 008) also accepts optional `passenger_name` + `passenger_phone` (10-digit Indian mobile) to ride for someone else, `family_member_id` (an accepted family member; they are notified), and `favorite_first` (offers are reserved for the rider's favorite drivers for 60 seconds, enforced in both the offer list and acceptance). The driver sees passenger details only after accepting.

Client-only: voice booking uses the browser Speech Recognition API to fill vehicle/pickup/drop (rider still confirms the fare), and navigation/booking/safety labels are translated for hi/ta/te/kn/ml.

Not yet implemented: push delivery (notifications are in-app only), translation of every screen and of bn/mr/gu/pa.

## Trip types, negotiation, dispatch, login and payments (migrations 009–010)

**Quotes.** `POST /api/quotes` accepts `trip_type` (`city` default, `rental`, `outstation`):
- `city` + optional `stops` (max 3, inside the area): adds `stop_fee_paise` per stop.
- `rental` + `rental_hours` (1–12): `hourly_paise × hours`, includes `included_km_per_hour × hours` km (no routing; destination ignored).
- `outstation` + `round_trip`/`trip_days` (1–10): destination may be anywhere in India (`GET /api/places?scope=india`), ≥40 km, `outstation_per_km_paise` per km (×2 for round trip) plus `outstation_allowance_paise` per day.
Products are off until an operator sets them: `POST /api/operator/trip-pricing` (`area_id`, `category`, `stop_fee_paise`, `hourly_paise|null`, `included_km_per_hour`, `extra_km_paise`, `outstation_per_km_paise|null`, `outstation_allowance_paise`). `GET /api/config` exposes these fields.

**Fare negotiation.** `POST /api/rides` accepts `offer_paise` (70–150% of the quote). Eligible drivers counter with `POST /api/rides/{id}/bids {amount_paise}` (same bounds, ≥ their minimum fare); the rider picks one with `POST /api/rides/{id}/bids/{bid}/accept`, which fixes the fare and reserves the ride for that driver for 60 s. `fare_paise` on rides, earnings and receipts is the agreed fare; `quoted_fare_paise` is the original.

**Scheduled rides.** A worker (15 s tick) turns a scheduled ride into a normal request 15 minutes before pickup (price re-quoted at dispatch). If the time was missed by >10 min, the rider already has an active ride, or quoting fails, the schedule becomes `failed` with `failure_reason`; either way the rider gets a notification. `POST /api/scheduled-rides` accepts `payment_method` (`cash`/`upi`).

**Phone OTP login.** `POST /auth/otp/request {phone}` and `POST /auth/otp/verify {phone, code}` (same-origin only). Codes are 6 digits, valid 10 min, 5 attempts, stored only as an HMAC; request is limited to 5/10 min per number and 20/h per IP, with a 30 s resend gap. Delivery uses MSG91 when `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` are set (DLT-approved template with an `##otp##` variable), otherwise a provider-neutral webhook: `SMS_WEBHOOK_URL` receives `{"to":"+91…","message":"…"}` with `Authorization: Bearer $SMS_WEBHOOK_TOKEN`. Without it, production returns 503; in development the code is returned as `dev_code`.

**Online payments (Razorpay-compatible).** Configure `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET` (and `PAYMENT_API_URL`, default `https://api.razorpay.com/v1`). `POST /api/rides/{id}/pay` (rider, trip started/completed) creates an order for the agreed fare; the browser pays in provider checkout; `POST /api/rides/{id}/pay/verify` (checkout signature) and the public `POST /api/payments/webhook` (`X-Razorpay-Signature`, amount must match the order) mark the ride `paid_online`. Refunds and reconciliation are not implemented.

## Driver tools
- `POST /api/drivers/go-home` `{lat,lng}` starts go-home mode (409 after 2 uses a day); `{off:true}` stops it.
- `POST /api/drivers/goal` `{daily_goal_paise}` sets the daily earnings goal.
- `GET /api/drivers/demand` cells now include `drivers` (online drivers in the same ~1 km cell).
- Rides include `wait_charge_paise`; `driver` state includes `home_until`, `home_uses`, `daily_goal_paise`.
# Trust, onboarding and trip statements (migration 031)

All endpoints below use existing session authorization; POSTs require the existing CSRF token and approved Origin. Responses are private/no-store. Android uses the existing native authenticated JSON transport.

- `POST /api/profile/phone/request` — `{phone}` (10-digit Indian number); account-bound, purpose-separated OTP challenge; 30-second resend cooldown. Only explicit development mode can return `dev_code`.
- `POST /api/profile/phone/verify` — `{phone,code}`; at most five attempts per challenge; atomically records exact-number ownership and replaces the profile contact. Codes are single-use and expire in ten minutes. Number collisions do not merge accounts. Changing a phone-login identity requires support.
- `GET /api/profile` — adds `id`, `phone_verified`, `has_photo`, `photo_approved` and optional business fields to `details`.
- `POST /api/profile` — adds optional `company_name`, `business_gstin`, `cost_centre`, `work_email`. These are rider-supplied details, not independently verified business identity. The `phone` field cannot change a number; use OTP endpoints. Name changes to approved captain accounts require identity re-review.
- `POST /api/profile/photo` — `{image: base64JPEGorPNG}`; decoded input/output at most 512 KiB; server re-encodes as JPEG. Approved captains return to pending review and go offline; an active captain trip blocks replacement.
- `POST /api/profile/photo/delete` — removes a rider portrait reference. Captains must upload a replacement instead.
- `GET /api/profile/photo/{accountId}` — `{image,content_type}` for the owner, an operator, or an assigned rider with an approved captain portrait during/recently after the trip. Never returns a public object URL.
- `GET /api/drivers/onboarding` — `{draft,documents,has_photo,photo_approved,phone_verified,storage_mode}` for the caller.
- `POST /api/drivers/onboarding` — saves the application fields plus `step` (0–3); returns `{ok:true}`. Drafts are private and server-side.
- `POST /api/drivers/documents/{kind}` — `{image: base64JPEGorPNG}`; `kind` is identity/license/rc/insurance; max 2 MiB decoded input/output, max 2048 pixels per side. Server validation/re-encoding applies. Only the caller's document can be written.
- `GET /api/drivers/documents/{accountId}/{kind}` — owner/operator only; read is audited before disclosure; returns `{image,content_type}`. Unauthorized callers receive 404.
- `POST /api/drivers/apply` — existing fields plus required `vehicle_make`, `vehicle_model`, `vehicle_color`. Requires verified mobile, portrait and all four document images. Pending applications may be corrected and resubmitted; approved/suspended accounts cannot use this to change status or vehicle.
- `GET /api/admin/drivers` — adds verified-phone state, portrait presence, document-kind list, vehicle descriptors and onboarding version. Existing admin decision endpoint reviews the uploaded evidence together with its checklist.
- `POST /api/rides/{rideId}/offer-seen` — captain display acknowledgement. Does not accept/reserve the ride or prove an FCM notification was delivered.
- `GET /api/rides/{rideId}/receipt` — completed-trip participant only; `{details,issued_at,payment_status,payment_description,refunded_paise,filename,content_type,pdf}` with PDF base64. Snapshot fare facts are immutable; payment/refund annotations reflect current records. Unconfirmed cash/direct-UPI payments remain unconfirmed, captain reports are labelled, and wallet/provider confirmations are distinguished. Captain views omit rider business fields. This produces a trip statement, not a legally applicable supplier GST invoice.

Production media uses `MEDIA_PROFILE_BUCKET` and `MEDIA_KYC_BUCKET` plus attached runtime credentials. See [private media setup](PRIVATE-MEDIA.md). Storage, SMS, Android delivery and tax-provider setup are not implied by a successful local API response.
