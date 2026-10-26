# Hop platform — Go backend and React web prototype

This repository currently contains a Go API and a React/TypeScript rider, driver, and operator web prototype. The target product now calls for separate Flutter customer/captain apps and a React admin portal; the migration path and target architecture are documented in [ARCHITECTURE.md](docs/ARCHITECTURE.md). The older Python prototype in `../bike-taxi` is a separate demo.

The current code is a tested implementation foundation, not the complete requested product and **not approved for public passenger service**. Phone OTP (needs an SMS provider webhook), online payments (need gateway keys), driver verification, push delivery, Flutter customer/captain apps, mobile background tracking, refunds/reconciliation, and launch operations still require provider configuration or implementation. See `docs/API.md` for trip types, fare negotiation, scheduled dispatch, OTP and payments.

## What is implemented

- React/TypeScript rider, driver, history, support, and operator interfaces responsive to mobile browser sizes.
- Go API with PostgreSQL persistence, migrations, transaction-protected booking/acceptance, and database uniqueness constraints.
- OIDC authorization-code sign-in with PKCE and nonce, verified email, server-side Redis sessions, HttpOnly/Secure production cookies, origin/CSRF checks, session rotation and logout.
- Operator-managed service areas and pricing. Production starts with **no active areas**.
- Per-area bike, auto-rickshaw, mini cab, sedan, and SUV fare rules; operators explicitly configure and enable non-bike categories before they appear to riders. Quotes snapshot category pricing and expose a fare breakdown.
- Photon-compatible address search and OSRM-compatible road quotes; account-bound quotes expire after two minutes. No approximate-distance fallback exists.
- Idempotent ride creation, five-minute request expiry, a 3 km default driver acceptance radius, and one active trip per rider/driver.
- Customer display-name editing, private saved Home/Work/Favorite locations, and one audited 1–5 star review per participant after a completed trip.
- Driver-configurable pickup radius (500 m–20 km) and minimum acceptable fare; both are enforced for offers and rechecked during acceptance.
- Captain earnings dashboard with daily/weekly/monthly and all-time completed-fare totals, payment-report totals, and recent ride receipts; direct-payment reports are explicitly not gateway-verified.
- Driver application/review, document expiry, fresh accurate location, explicit online availability and participant-only trip information.
- Six-digit pickup codes, attempt limits, controlled status transitions, cancellation reasons, separate direct-payment reporting/disputes, and transactional audit events.
- Incident reports and operator responses; immediate emergencies are directed to India's 112 service.
- Docker deployment configuration, persistent PostgreSQL/Redis volumes, TLS reverse proxy, graceful shutdown, readiness checks and CI configuration.

## Stack

| Component | Technology |
|---|---|
| Backend | Go 1.27.3 or newer patched release, net/http, pgx |
| Web/mobile browser | React 19, TypeScript, Vite |
| Database | PostgreSQL 17 |
| Sessions and rate limits | Redis 7 |
| Identity | OIDC provider; tested locally with Keycloak 26.4 |
| Address and road services | Photon-compatible API and OSRM-compatible API |
| Deployment | Docker and Caddy; no cloud vendor dependency |

See [the architecture and requirements](docs/ARCHITECTURE.md), [deployment instructions](docs/DEPLOYMENT.md), [testing evidence](docs/TESTING.md), and [API contract](docs/API.md).

For Render with Neon PostgreSQL, Upstash Redis, and Auth0 login, use the [Render setup guide](docs/RENDER.md) and the repository-root `render.yaml`. This provisions only the application service; the external accounts and credentials must be configured separately.

## Developer startup

Use the existing checkout. The platform lives under `/workspace/python-Exercise/hop-platform` in this workspace.

Prerequisites: Go matching `backend/go.mod`, Node 24, PostgreSQL 17, Redis 7, and a configured OIDC development realm. Optional Docker can provide the services. No passwords or provider secrets are checked in.

```sh
cd hop-platform/web
npm ci
npm run build   # builds rider, captain and admin into web/dist/{rider,captain,admin}
# dev: npm run dev -> rider :5173, captain :5174, admin :5175
cd ../backend
go build -o api ./cmd/api
# Set DATABASE_URL to your development database before applying migrations.
./api migrate
# Set all runtime variables described below, then:
./api
```

Open the address represented by `PUBLIC_ORIGIN` on the machine hosting the application. Each frontend serves its own UI and proxies `/api` and `/auth` to the common API-only Go server. The backend does not serve frontend assets. The cloud onboarding workspace does not automatically expose a browser preview.

Development runtime variables:

- `APP_ENV=development`
- `DATABASE_URL=postgres://<user>:<password>@<host>:5432/<database>?sslmode=disable` for a private local database only.
- `REDIS_URL=redis://<host>:6379/0` for a private local Redis only.
- `PUBLIC_ORIGIN=http://localhost:8080` (exact origin, no trailing slash).
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`: your OIDC provider. Register exactly `PUBLIC_ORIGIN/auth/callback`, require PKCE S256 and verified email.
- `SESSION_KEY`: at least 32 random characters. Protect it and retain it across deploys; it derives pickup codes.
- `ROUTING_URL`: your OSRM-compatible server; `GEOCODING_URL`: your Photon-compatible `/api/` endpoint.
- Optional `ADDRESS=:8080`, `ALLOWED_ORIGINS=https://captain.example.com,https://admin.example.com` (extra origins allowed to sign in and POST; with `APP_ENV=development` any localhost port is allowed).

### Google Maps and Places for local development

The booking map and live address suggestions use the Google Maps JavaScript API and Places API (New). Create a Google Cloud key with billing enabled, restrict its website referrers to `http://localhost:8080/*` and your real app domains, and restrict enabled APIs to Maps JavaScript API and Places API (New). The browser key is visible to clients by design, so referrer and API restrictions are required; do not commit it or paste it into chat.

```sh
cd web
cp .env.example .env.local
# Set VITE_GOOGLE_MAPS_API_KEY in .env.local; optionally set your VITE_GOOGLE_MAP_ID.
npm run build
```

Rebuild and redeploy the affected frontend after changing its map settings. Without a key, the app keeps its local fixture search and shows setup instructions instead of attempting to load map tiles. Google Maps does not provide this app's fare route: `ROUTING_URL` still needs a real, supported road-routing service. The local `route_fixture.py` returns synthetic geometry and fares and is only for development.

There is **no development-login bypass**. Accounts are created only after signed identity-token verification. Create a first account through sign-in, obtain its account UUID from `/api/me`, then use an authenticated maintenance session to run:

```sh
./api promote-operator <account-uuid>
```

Reload the app and open Operations. Configure and activate an area, then review driver applications. In production, operators must record real operational/verification references and use identity-provider MFA. Test data and synthetic verification references are never launch approval.

### Live trips, push alerts and vehicle changes

- **Road routing:** for realistic dev routes set `ROUTING_URL=https://router.project-osrm.org` (public demo server, development only; production needs your own OSRM).
- **Live ETA:** riders see "driver arrives in N min" (pickup) and time-to-destination during the trip; vehicle cards show nearby drivers via `GET /api/nearby`.
- **Push alerts:** `GET /api/stream` is a server-sent-events stream (new ride requests for drivers, ride status for riders, notifications). Users click "Enable alerts" for system notifications when the tab is in the background. It is not a mobile/Web Push (FCM/APNs) service.
- **Vehicle change:** approved drivers request a new vehicle (`POST /api/drivers/vehicle`); an operator approves it under Operator → Vehicle change requests, after which the driver goes offline and re-registers.

### Feature status

See [docs/FEATURES.md](docs/FEATURES.md) for built features and open work, and [docs/SCALING.md](docs/SCALING.md) for the scaling design.

### Demo data for local booking

Booking stays closed until an operator creates a service area. For a ready-to-use local demo, run `infra/dev_seed.sql` against your **local development** database. It adds active areas for seven metros, pricing for all five vehicle types, ten online demo drivers around central Bengaluru, and promotes the `e2e-operator-*` account. Re-run it to refresh driver locations, which go stale after a few minutes. Never run it against a real environment.

## Testing

```sh
cd backend
go vet ./...
# These URLs must point to disposable test services. The test suite resets the database schema and Redis DB.
TEST_DATABASE_URL='postgres://.../hop_test' TEST_REDIS_URL='redis://.../15' go test -race ./... -count=1
cd ../web
npm ci
npm run build
npm audit --omit=dev --audit-level=high
```

Tests without the integration variables explicitly skip the database suites; that is not a readiness result. The integration tests were run with real PostgreSQL and Redis during implementation. Browser checks use real Keycloak and synthetic address/route fixtures; see the testing document for exact evidence and limitations.

## Before a real pilot

- Select and configure production identity, SMTP/phone verification policy, MFA, routing/geocoding and a domain. No real provider credentials are included.
- Review state-specific operating requirements and driver/vehicle/insurance evidence; establish support coverage, customer terms, privacy and retention processes.
- Replace rectangular test boundaries with verified operational boundaries if required by the launch area; verify the routing profile is appropriate for permitted two-wheeler travel. Endpoint checks alone do not prove the whole road route remains inside an operating boundary.
- Validate on physical Android and iOS browsers. Foreground location does not provide native background tracking. Native apps remain a later phase.
- Complete backup/restore, monitoring/alerting, load testing, dependency/security scans, penetration testing and rollout procedures.
- Implement retention/deletion automation and protected verification-document storage if documents will be collected directly. This version uses operator-issued verification references only.

The code stack uses open-source components. Hosting, identity delivery, routing datasets, support and operations have costs even when platform commission is zero. Do not use the old free/ephemeral demo deployment for real rides.

## Independent app deployments

See [separate deployments](docs/SEPARATE-DEPLOYMENTS.md) for the common API and independently built rider, captain and admin containers, app-specific authentication callbacks, local Docker configuration and shared package ownership.

## Android apps

The rider and captain React UIs also build as separate Capacitor Android apps. See [Android setup and verification](docs/ANDROID.md) for APK builds, device connectivity, native login, foreground tracking, Firebase and release configuration.
# Trust and onboarding update

Migration 031 adds verified profile-mobile ownership, private photos/documents, resumable captain onboarding, vehicle descriptors, business-profile fields and PDF trip statements. Dispatch now distinguishes explicit declines from offers won by another captain and supports bounded road-matrix ranking with fallback.

Apply all migrations and release the backend plus rider/captain/admin clients together. Configure real SMS for verification and two private GCS buckets for production uploads; no storage resources are provisioned by the app. Development images are held in process memory and are not durable. See [private media: security, retention and cost](docs/PRIVATE-MEDIA.md), [API additions](docs/API.md), and [feature status](docs/FEATURES.md). Personal-vehicle carpool expansion is on hold.
