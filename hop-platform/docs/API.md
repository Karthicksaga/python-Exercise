# API contract

All business endpoints are same-origin JSON. Unsafe requests require `Content-Type: application/json`, exact `Origin: PUBLIC_ORIGIN`, an authenticated HttpOnly session cookie, and `X-CSRF-Token` returned by `/api/me`. Unknown JSON fields, oversized bodies and multiple JSON values are rejected. Errors are `{ "error": "human-readable message" }` with non-2xx status.

| Method/path | Access | Purpose |
|---|---|---|
| GET /api/config | Public | Active service areas and platform fee |
| GET /auth/login | Public, rate limited | Begin OIDC + PKCE sign-in |
| GET /auth/callback | One-use state and nonce | Verify identity and rotate local session |
| GET /api/me | Signed in | Account and session-bound CSRF token |
| POST /auth/logout | Signed in + CSRF | Revoke local session |
| GET /api/places?area_id=UUID&q=text | Signed in | Area-filtered address search |
| POST /api/quotes | Signed in | Road quote; pickup/dropoff `{lat,lng,label}` and `area_id` |
| POST /api/rides | Signed in | `{quote_id,request_key,payment_method}`; UUID request key, cash/upi |
| GET /api/state | Signed in | Own trips, driver profile, eligible nearby offers, own incidents |
| POST /api/rides/{id}/actions | Trip participant / eligible driver | `{action,version,code?,reason?}` |
| POST /api/drivers/apply | Signed in | Application; cannot self-approve |
| POST /api/drivers/location | Approved driver | `{lat,lng,accuracy}`; server-received time controls freshness |
| POST /api/drivers/offline | Signed in | Stop new request eligibility |
| POST /api/incidents | Ride participant | `{ride_id,message}` |
| GET /api/operator | Operator | Areas, reviews, incidents and recent audit events |
| POST /api/operator/areas | Operator | Create/update area, paise pricing and activation reference |
| POST /api/operator/drivers/{id} | Operator, not self | `{status:approved|suspended,note}` |
| POST /api/operator/incidents/{id} | Operator | `{status:reviewing|closed,resolution}` |

`request_key` is an idempotency key for booking. Repeat the same key/body after an uncertain network response. Reusing it for a different quote/payment method returns 409. Quotes belong to one rider, cannot be reused for multiple rides, and expire after two minutes. `fare_paise` is an integer; there is no platform commission field clients can increase.

Actions: `accept`, `arrive`, `start`, `complete`, `cancel`, `payment_received`, `payment_disputed`. `version` must match the latest trip version. A 409 requires refreshing the trip, not blindly replaying an action. Driver acceptance checks approval, document validity, area, online status, server location age ≤60 seconds, distance ≤3 km, and no active assignment. UPI requests require a driver UPI ID.

`start` requires the rider's six-digit `pickup_code`. The code is only returned to its rider while accepted/arrived. Five wrong attempts lock that ride's start action; cancellation/support remains possible. Never log or embed pickup codes in analytics.

Completion leaves payment `unconfirmed`. Drivers can report receipt; riders can dispute it. A disputed payment cannot be overwritten by the driver. This is a report, not payment-provider verification. Incident resolution is audited separately.

Most-recent limits: 50 participant trips, 20 offers, 20 own reports, 100 operator records. These are bounded initial views; paginated archive/search endpoints are a required addition for larger operations. Region boundaries currently validate trip endpoints against a reviewed rectangle; they are not legal-state polygon or full-route containment validation.
