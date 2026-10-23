# Hop: India-wide, zero-commission bike-taxi platform

## Confirmed requirements

- India-wide product architecture; launch only in explicitly activated service areas.
- Go backend, responsive mobile-friendly web first. Native Android/iOS are later clients of the same API.
- Riders pay drivers in cash or direct UPI. Platform commission is zero; no payment collection, wallet, escrow, or payment-success claims.
- Real service intent: persistent accounts, driver approval, booking integrity, operational controls, and traceable decisions.

## Product decisions

An India-wide launch is an operational rollout, not one global switch. Service areas carry state, boundaries, fare versions, and activation state. Operators must determine the applicable rules, vehicle/driver eligibility, insurance, safety/support coverage, and commercial terms per area. No city is auto-enabled in production.

Rider journey: sign in through a verified identity provider → choose active area and locations → receive a time-limited road-distance quote → request ride with an idempotency key → driver accepts → share pickup code at pickup → travel → complete → settle directly → history/support.

Driver journey: sign in → submit application and vehicle details → operator reviews evidence and expiry dates → approval → consent to foreground location → receive nearby requests while location is fresh → accept atomically → arrive → verify pickup code → complete. Opening a driver tab does not confer driver privileges.

Operator journey: separate application role → manage areas → review drivers → inspect trip/audit records → receive incident reports. Identity-provider administrators and application operators are distinct roles. First operator promotion uses an authenticated database maintenance command; public clients cannot promote themselves.

## Stack and tradeoffs

| Layer | Choice | Why |
|---|---|---|
| Responsive client | React, TypeScript, Vite | Typed UI, small deployment surface, browser/mobile-browser support |
| HTTP API | Go standard net/http | Concurrency, bounded requests, cancellation/timeouts, simple deployment |
| Identity | OpenID Connect authorization code + PKCE; Keycloak recommended | Mature identity lifecycle, MFA, recovery, email/phone verification without inventing password security |
| Browser sessions | Opaque HttpOnly cookie; Redis-backed server sessions | Tokens never enter browser localStorage; logout/revocation and expiry |
| Durable state | PostgreSQL | Transactions, uniqueness constraints, durable audit and history |
| Ephemeral state | Redis | Sessions, atomic request limits, authentication challenges |
| Routing | OSRM-compatible service adapter | Real road distance with bounded request time; self-hostable; no production dependency on a public demo router |
| Location | Browser geolocation, recent driver heartbeat | Permission-based; stale drivers excluded; mobile web cannot promise background tracking |
| Delivery | Docker, reverse proxy with TLS, CI tests | Reproducible deployment and explicit external configuration |

A modular monolith is the initial architecture. Separate microservices would add failure modes before traffic justifies them. PostgreSQL owns trip transitions; Redis is not the source of truth for trips. Polling every few seconds is the initial status transport; SSE/WebSockets can be added without changing trip consistency rules. No fleet-size or latency guarantees are claimed without representative load tests.

## State and consistency

`requested → accepted → arrived → in_progress → completed`; cancellation is allowed before trip start. A request expires if no driver accepts before its deadline. Partial unique indexes prevent multiple active trips per rider or driver. Transaction locks serialize acceptance and transitions. A request idempotency key returns the original trip on retries and rejects reuse for a different quote. Quotes are account-bound, immutable, short-lived and contain pricing version and route source. Server time governs expiry.

Driver availability requires approval, unexpired review documents, active service area, explicit online state, sufficiently accurate location, and a recent server-received heartbeat. Location timestamps supplied by the browser never extend freshness. Accept validates proximity and availability again; seeing a request is not a reservation.

Amounts use integer paise; commission is always zero in this release. Completion and direct-payment reporting are separate facts. The app cannot independently confirm a cash or external UPI payment.

## Security and privacy boundaries

Use verified OIDC issuer, client, redirect URI, PKCE, one-use login state, nonce, signed-token verification, and email verification. Native clients will need their own public client and token contract; web cookies are not a native mobile authentication design.

Production startup requires TLS public origin, secrets, PostgreSQL, Redis, identity and real routing configuration. Same-origin mutations require a session-bound CSRF token and matching Origin. Roles and ownership are checked server-side. Customer details are disclosed to assigned participants only. Raw sessions, codes, authorization headers and coordinates are not logged. Pickup codes use HMAC with a separate key and limited attempts.

Rate limits apply to authentication, quotes, bookings and transitions. They are defense-in-depth, not a substitute for edge protection, identity-provider controls or fraud operations. Operator MFA must be enforced at the identity provider. Do not store verification document files until private storage, retention and access policies are configured. Store review references accessible only to operators.

## Deliberately outside the first implementation

Native background tracking, verified phone/SMS provider, automatic KYC/document checks, integrated payment confirmation, nationwide road dataset hosting, call masking, push notifications, support staffing, automatic incident response, anti-fraud models, retention automation, disaster-recovery drills and external penetration testing. Incident reporting must never be advertised as an emergency dispatch service. An API or UI button alone does not establish operational readiness.

## Release gates

1. Functional and concurrency tests against actual PostgreSQL and Redis; browser checks on desktop and mobile sizes.
2. Identity-provider configuration, account verification/MFA and real routing validation in staging.
3. Operator review of activated states/areas, driver verification evidence, support process and privacy terms.
4. TLS, managed secrets, monitored backups and restore drill, migration rehearsal, rate limits, dependency/security scanning.
5. Real iOS Safari and Android Chrome location/permission testing, accessibility review, load tests with a declared traffic target.
6. Controlled pilot with approved drivers before widening areas.

This document is an engineering plan, not a statement of legal approval or a promise that nationwide operations are ready.
