# Hop platform — Go backend, mobile-friendly web

The new application for the confirmed product direction: **India-wide architecture, Go backend, mobile-friendly web first, zero platform commission, cash/direct UPI paid to drivers**. The older Python prototype in `../bike-taxi` is a separate demo and is not the production architecture.

This is an implemented production foundation, **not yet approved for public passenger service**. The release gates below distinguish working software from configuration and operating capabilities that are still needed.

## What is implemented

- React/TypeScript rider, driver, history, support, and operator interfaces responsive to mobile browser sizes.
- Go API with PostgreSQL persistence, migrations, transaction-protected booking/acceptance, and database uniqueness constraints.
- OIDC authorization-code sign-in with PKCE and nonce, verified email, server-side Redis sessions, HttpOnly/Secure production cookies, origin/CSRF checks, session rotation and logout.
- Operator-managed service areas and pricing. Production starts with **no active areas**.
- Photon-compatible address search and OSRM-compatible road quotes; account-bound quotes expire after two minutes. No approximate-distance fallback exists.
- Idempotent ride creation, five-minute request expiry, a 3 km driver acceptance radius, and one active trip per rider/driver.
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
npm run build
cd ../backend
go build -o api ./cmd/api
# Set DATABASE_URL to your development database before applying migrations.
./api migrate
# Set all runtime variables described below, then:
./api
```

Open the address represented by `PUBLIC_ORIGIN` on the machine hosting the application. The Go server serves the compiled web UI and API from the same origin. The cloud onboarding workspace does not automatically expose a browser preview.

Development runtime variables:

- `APP_ENV=development`
- `DATABASE_URL=postgres://<user>:<password>@<host>:5432/<database>?sslmode=disable` for a private local database only.
- `REDIS_URL=redis://<host>:6379/0` for a private local Redis only.
- `PUBLIC_ORIGIN=http://localhost:8080` (exact origin, no trailing slash).
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`: your OIDC provider. Register exactly `PUBLIC_ORIGIN/auth/callback`, require PKCE S256 and verified email.
- `SESSION_KEY`: at least 32 random characters. Protect it and retain it across deploys; it derives pickup codes.
- `ROUTING_URL`: your OSRM-compatible server; `GEOCODING_URL`: your Photon-compatible `/api/` endpoint.
- Optional `ADDRESS=:8080`, `WEB_DIR=../web/dist`.

There is **no development-login bypass**. Accounts are created only after signed identity-token verification. Create a first account through sign-in, obtain its account UUID from `/api/me`, then use an authenticated maintenance session to run:

```sh
./api promote-operator <account-uuid>
```

Reload the app and open Operations. Configure and activate an area, then review driver applications. In production, operators must record real operational/verification references and use identity-provider MFA. Test data and synthetic verification references are never launch approval.

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
