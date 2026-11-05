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
| POST /api/operator/areas | Operator | Create/update area, paise pricing and activation reference. Optional `catalog_id` links it to a catalogue district (one zone per district; 409 names the existing zone). Opening bookings (`active: true`) is refused with 409 when the box overlaps another live zone; inactive zones may overlap |
| GET /api/operator/regions?state= | Operator | District catalogue (migration 035, OpenStreetMap ODbL bounds) with `area_id`/`area_name`/`area_active` of the zone using each district plus city limits (migration 036): `city`, `city_source` (`boundary` = OSM city boundary, `approx` = box around the city centre, null = none) and `city_min_lat`…`city_max_lng` |
| GET /api/operator/summary | Operator | Overview counts in one call: `summary` (`sos_active`, `incidents_open`, `drivers_pending`, `oldest_pending_at`, `changes_pending`, `expiring_7d`, `payouts_requested`, `payouts_requested_paise`, `lost_open`, `active_rides`) and `areas` (`categories` enabled, `captains_online`, live `surge_multiplier`/`surge_reason`) |
| POST /api/operator/pricing | Operator | Configure and enable `auto`, `mini`, `sedan`, or `suv` pricing for an area |
| POST /api/operator/drivers/{id} | Operator, not self | `{status:approved|suspended,note}` |
| POST /api/operator/incidents/{id} | Operator | `{status:reviewing|closed,resolution}` |

`request_key` is an idempotency key for booking. Repeat the same key/body after an uncertain network response. Reusing it for a different quote/payment method returns 409. Quotes belong to one rider, cannot be reused for multiple rides, and expire after two minutes. `fare_paise` is an integer; there is no platform commission field clients can increase.

`GET /api/config` returns `vehicles` with enabled categories and their fare rules for each active area. The initial category set is bike, auto-rickshaw, mini cab, sedan, and SUV; only bike is enabled by default. Operators configure the other categories before enabling them. Quotes snapshot category, pricing version, and base/distance/minimum fare components. Drivers apply under one vehicle category and only receive or accept matching requests. Drivers can configure a 500–20000 m pickup radius and minimum acceptable fare; both are checked when offers are listed and revalidated during transactional acceptance. Rental/hourly, outstation and multi-stop trips are priced through the same quote endpoint (see *Trip types, negotiation, dispatch, login and payments* below).

Profiles currently permit display-name editing only; verified sign-in identity and email cannot be changed through this API. Saved locations are private to the account and limited to Indian coordinate bounds. Ratings are available only to participants after completion, are single-submit per participant, and are written to the audit trail.

Driver earnings are calculated from completed ride fares with zero platform commission. Reported-paid amounts reflect the driver's manual cash/UPI receipt report only; they are not gateway-confirmed. The server stores completion time separately from later payment-status changes so period totals remain stable. Receipt history is limited to the 50 most recent completed trips.

`POST /api/quotes` returns the selected route as `route: [{lat,lng}, ...]` in route order. The geometry is saved with the quote and included in participant ride objects from `GET /api/state` and eligible driver offers, so clients can continue drawing the same road route after booking. It is routing-provider geometry, not a straight line; local development uses synthetic fixture geometry and must not be presented as real navigation.

Actions: `accept`, `arrive`, `start`, `complete`, `cancel`, `payment_received`, `payment_disputed`, `cash_paid`, `payment_not_received`. `version` must match the latest trip version. A 409 requires refreshing the trip, not blindly replaying an action. Driver acceptance checks approval, document validity, area, online status, server location age ≤60 seconds, distance ≤3 km, and no active assignment. UPI requests require a driver UPI ID.

Cash and direct UPI (Nov 2026): the rider's `cash_paid` sets `rider_reported_paid`, which lifts the booking block (`402 payment_required`). The Captain's `payment_not_received` sets `driver_reported_unpaid`, which keeps the block; the rider may then pay by Wallet or online, or dispute. The Captain's `payment_received` settles any of these. Only `paid_online`, `driver_reported_received` and `rider_reported_paid` let the rider book again.

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

**Online payments (Razorpay-compatible).** Configure `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET` (and `PAYMENT_API_URL`, default `https://api.razorpay.com/v1`). `POST /api/rides/{id}/pay` (rider, trip started/completed) creates an order for the agreed fare; the browser pays in provider checkout; `POST /api/rides/{id}/pay/verify` (checkout signature) and the public `POST /api/payments/webhook` (`X-Razorpay-Signature`, amount must match the order) mark the ride `paid_online`. Refunds to the card or UPI and reconciliation are not implemented; see `PROVIDERS-PENDING.md`.

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
- `GET /api/drivers/onboarding` — `{draft,documents,has_photo,photo_approved,phone_verified,storage_mode,documents_required,testing_mode,required_documents,optional_documents}` for the caller. `testing_mode` is true in development or with `DEV_ONBOARDING=true` (staging): `apply` then accepts a test application without documents and fills test defaults, and an operator can approve it without accepted documents.
- `POST /api/drivers/onboarding` — saves the application fields plus `step` (0–3); returns `{ok:true}`. Drafts are private and server-side.
- `POST /api/drivers/documents/{kind}` — `{image: base64JPEGorPNG}`; `kind` is identity/license/rc/insurance; max 2 MiB decoded input/output, max 2048 pixels per side. Server validation/re-encoding applies. Only the caller's document can be written.
- `GET /api/drivers/documents/{accountId}/{kind}` — owner/operator only; read is audited before disclosure; returns `{image,content_type}`. Unauthorized callers receive 404.
- `POST /api/drivers/apply` — existing fields plus required `vehicle_make`, `vehicle_model`, `vehicle_color`. Requires verified mobile, portrait and all four document images. Pending applications may be corrected and resubmitted; approved/suspended accounts cannot use this to change status or vehicle.
- `GET /api/admin/drivers` — adds verified-phone state, portrait presence, document-kind list, vehicle descriptors and onboarding version. Existing admin decision endpoint reviews the uploaded evidence together with its checklist.
- `POST /api/rides/{rideId}/offer-seen` — captain display acknowledgement. Does not accept/reserve the ride or prove an FCM notification was delivered.
- `GET /api/rides/{rideId}/receipt` — completed-trip participant only; `{details,issued_at,payment_status,payment_description,refunded_paise,filename,content_type,pdf}` with PDF base64. Snapshot fare facts are immutable; payment/refund annotations reflect current records. Unconfirmed cash/direct-UPI payments remain unconfirmed, captain reports are labelled, and wallet/provider confirmations are distinguished. Captain views omit rider business fields. This produces a trip statement, not a legally applicable supplier GST invoice.

Production media uses `MEDIA_PROFILE_BUCKET` and `MEDIA_KYC_BUCKET` plus attached runtime credentials. See [private media setup](PRIVATE-MEDIA.md). Storage, SMS, Android delivery and tax-provider setup are not implied by a successful local API response.

# Captain document review (migration 034, Nov 2026)

**Required documents** (all must be uploaded and *accepted* before approval): `identity`, `identity_back`, `license`, `license_back`, `rc`, `rc_back`, `insurance`. **Optional:** `police` (police clearance certificate). The list is defined once in `backend/internal/app/documents.go` and returned by `GET /api/drivers/onboarding` (`required_documents`, `optional_documents`).

- `POST /api/drivers/documents/{kind}`: every upload is kept as a version (`driver_document_versions`). The new version is `pending` review; the previous one is marked superseded, never deleted early.
- `GET /api/drivers/onboarding`: each document now carries `review_status` (`pending|accepted|rejected`) and `review_reason`, so the Captain app can show what to fix.
- `GET /api/admin/drivers?status=&area_id=&q=&expiring=1&limit=&offset=`: filtered, paged review queue. Pending applications are ordered oldest-first. The response adds `counts`, `document_reviews`, `submitted_at`, `claimed_name`, `next_expiry`, `gender_ok`, `police_reference`, plus `required_documents` and `rejection_reasons`.
- `POST /api/admin/drivers/{id}/claim` with `{release?}`: claims an application for 30 minutes. Another operator gets `409 "<name> is reviewing this application"`.
- `POST /api/admin/drivers/{id}`: the **only** approval endpoint. It adds:
  - `documents: {kind: {status, reason?, note?}}`. `reason` is one of `blurry|cropped|mismatch|expired|wrong_type|glare`, or a custom `note` of at least 10 characters.
  - `gender_ok`: gender verified against the ID; required for `pink_certified`.
  - `police_reference`: required for `police_ok` unless a `police` document is accepted.

  Rules:
  - A check can't be ticked while one of its documents is rejected.
  - Any rejected document keeps or returns the Captain to `pending` (offline), and notifies them with the document name and reason.
  - Approval records `driver_verifications.evidence`: the exact object keys verified.
  - A decision releases the claim.
- `GET /api/admin/drivers/{id}/documents`: version history with outcomes. `GET /api/admin/document-versions/{version}`: one historical image; every view is audited.
- `POST /api/operator/drivers/{id}`: **retired (410)**. Approval has a single rule set.

**Expiry handling:** `RunCompliance` runs hourly. It sends licence and insurance reminders at 30, 7 and 1 days before expiry, each once per expiry date (`compliance_reminders`). On expiry it takes the Captain offline with a renewal message. Dispatch already excludes expired Captains.

**Retention:** files from abandoned applications are deleted after 30 days. Superseded versions are deleted after 3 years, unless an approval cites them as evidence.

**Security:**
- Client `testing`/`test_mode`/`test_bypass` flags, `X-Testing-Mode` headers and `?testing=` are ignored. Only a server with `APP_ENV=development` relaxes document checks.
- Demo sign-in (`/auth/login?role=…`) needs `APP_ENV=development` **and** `DEMO_LOGIN=true`; production refuses to start with `DEMO_LOGIN`.


# Captain matching (migration 038, Nov 2026)

- Requests are offered in rounds, each **exclusive** to the offered captain(s) for a short window: 1 captain within 3 km (8 s), another 1 within 3 km (8 s), 2 within 6 km (10 s), 4 within 20 km (12 s), then a sweep of 4 every 10 s. In a busy zone (3+ open requests and more requests than free captains) the first two rounds offer to 2.
- Windows shrink for captains who rarely accept (never below 5 s). A decline moves the request on at once. A captain who let a request time out can get it again later, after captains who haven't seen it; one who declined never does.
- A captain holds at most one live offer. Requests due in the same second are matched together (best pairs first, with a swap so no request is left short when another had a spare option).
- Ranking: road time to the pickup when the router answers, otherwise distance ×1.3 at 6.5 m/s plus a turnaround penalty for captains moving away from the pickup; then rating, recent acceptance, idle time and favourites.
- **Next ride:** a captain within 1.2 km of their drop-off, with that drop-off within 2 km of a new pickup, can be offered it (`offer_kind: "next"` in `/api/state` offers). Accepting while on the trip returns `{ok:true,next_ride:true}`: the ride stays `requested`, held for them for 6 minutes (`next_ride_held: true`), and becomes `accepted` for them when they `complete` the current trip. The rider's ride shows `next_ride: true`, `reserved_driver_name` and `next_ride_eta_seconds`.
- Captain offers also carry `offer_expires_at` (end of their window). Accept is honoured up to 3 s after it.
- `GET /api/operator/dispatch-report?days=1..90&area_id=` (operator): `requests`, `matched`, `no_captain`, `cancelled_while_searching`, `still_searching`, `seconds_to_match_median`/`_p90`, `offers_per_matched_ride`, `accepted_pickup_eta_seconds`, `next_rides`, `offer_outcomes`, `eta_sources`, `by_round`.

# Captain monthly pass (migration 039, Nov 2026)

Captains pay a flat price for a period (30 days by default) instead of a per-ride commission. **Off by default:** a zone needs a pass only after an operator turns on `areas.pass_required`. Online payment for the pass waits for the payment gateway (see `PROVIDERS-PENDING.md`).

**Where it's enforced** (shared SQL `passOK` in `passes.go`): going online (`403` with "A monthly pass is needed…"), the offers list in `/api/state`, accepting a ride, and matching. A captain who stays online after their pass ends stops getting requests.

| Endpoint | Who | Notes |
|---|---|---|
| GET /api/drivers/pass | Captain | `required` (their zone), `active` (current period or null), `paid_until` (end of the last queued period), `category`, `price_paise`, `days`, `balance_paise`, `can_buy`, `renew_from`, `renew_days`, `history` (last 12) |
| POST /api/drivers/pass `{price_paise}` | Captain (approved) | Pays from the earnings balance (`driver_ledger` kind `pass`). `price_paise` must equal the current price (409 if it changed). Allowed with no pass or ≤ 7 days left, so a double tap can't buy two months. 409 if the balance is short. The new period starts when the last one ends. |
| GET /api/operator/passes | Operator | `prices`, `areas` (with `pass_required`, `captains`, `with_pass`), `passes` (last 100), `captains` (approved, with `paid_until`), `revenue_month_paise`, `active_passes`, `renew_days` |
| POST /api/operator/pass-prices `{category, price_paise, days}` | Operator | ₹0–₹1,00,000, 1–90 days. Applies to the next purchase. Audited. |
| POST /api/operator/areas/{id}/pass `{required}` | Operator | Turns the requirement on or off for a zone. Audited. |
| POST /api/operator/drivers/{id}/pass `{days, collected_paise, note}` | Operator | Adds a period (e.g. cash at the office or a free trial) without touching the balance. Note ≥ 3 characters. Notifies the captain. Audited. |

Starting prices (placeholders): bike ₹499, auto ₹799, mini ₹1,499, sedan ₹1,799, SUV ₹1,999 for 30 days. The admin console page is **Money → Captain passes**; the Captain app shows a pass card on Earnings when a pass is needed or held.

# Chat (migration 040, Nov 2026)

Chat for any feature. A conversation belongs to something (`kind` + `ref`, e.g. `ride` + ride id) and has participants with roles. The `/api/chats` endpoints work the same for every kind; who may post, and when, is decided per kind by a `chatPolicy` in `chat.go`. Code: `backend/internal/app/chat.go`; app client: `hop-mobile-platform/shared/chat/` (`ChatSession` is UI-free and reusable; `RideChat` is the trip screen).

**Add chat to a new feature:** register a policy in `chatPolicies`, and call `openConversation(ctx, tx, kind, ref, {account: role, …})` when the feature needs a conversation. Nothing else changes: the endpoints, delivery, read receipts and phone alerts all work for the new kind.

| Endpoint | Notes |
|---|---|
| GET /api/chats | Inbox: the caller's conversations with `unread`, `last_message` and the other participants (first names). |
| GET /api/chats/{id}`?before=` | `can_post`, `closed_reason`, `participants` (`role`, `name`, `me`, `last_read_id`, `typing`), the latest 50 `messages` oldest first, `has_more`. `before=<id>` pages back. Participants only (404 otherwise). |
| GET /api/chats/{id}/wait`?after=&seen=&typing=&open=` | Long poll. Returns at once if there are messages after `after`, someone else has read past `seen`, typing differs from `typing` (1/0), or posting opened or closed versus `open` (1/0). Otherwise holds up to 10 s, then returns the current state. Woken by database triggers through the event hub, so it works across API instances and through the native HTTP plugin. |
| POST /api/chats/{id}/messages `{client_id, body}` | `client_id` is a UUID made by the device: a retry with the same id returns the stored message (200) instead of a duplicate (201 for new). 1–1000 characters, control characters removed, 40 per minute. 409 with the reason when the conversation is closed. Sending marks earlier messages as read. |
| POST /api/chats/{id}/read `{message_id}` | Moves the read position forward only, never past the newest message. Wakes the others ("Seen"). |
| POST /api/chats/{id}/typing `{}` | Marks the caller typing for 6 seconds (Redis) and wakes the others. Ignored (`ok: false`) when closed. |
| POST /api/rides/{id}/chat | Opens (or finds) a ride's conversation for its rider or captain. 404 before a captain accepts. |

**Ride chat rules:** open while the ride is accepted, arrived or in progress, and for 30 minutes after completion (lost items). Closed for cancelled rides. History stays readable. Ride rows in `/api/state` carry `chat_unread`.

**Phone alerts:** each message queues a push for the other participants (`push_outbox` kind `chat`), held for 3 seconds. It's skipped if they read it in the app meanwhile. Title "<first name> sent a message", tag `chat-<conversation>` so alerts for one conversation replace each other. Chat no longer writes rows to the notification list.

**Older apps:** `GET/POST /api/rides/{id}/messages` still work, on top of the new tables. Migration 040 copied `ride_messages` into the new tables, marked as read.
