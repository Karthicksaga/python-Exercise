# Deployment and operations

For the managed testing setup using Render, the Neon project `rapido`, Upstash, and Auth0, follow [RENDER.md](RENDER.md). That setup uses Render's HTTPS endpoint instead of the Caddy stack below.

## Required services and secrets

Use a VPS or container platform with durable PostgreSQL and Redis, an HTTPS hostname, and an OIDC provider. Keycloak is an open-source option; deploy its production mode against its own durable database behind TLS, with SMTP, verification and operator MFA configured. The local test Keycloak container is not a production identity installation.

Configure a confidential OIDC client with:

- Authorization code flow only; PKCE S256 required.
- Exact callback `https://<app-host>/auth/callback`; no wildcard redirects.
- Scopes `openid profile email`, ID-token `email_verified=true` only after verification, and a name claim.
- Brute-force protection, verified-email signup, recovery policy and MFA for operators.
- Appropriate IdP session lifetimes. Application logout invalidates the Hop session; it does not log out the identity provider globally. To switch identities on a shared device, sign out of the provider too.

Provide a private or contracted OSRM-compatible router and Photon-compatible geocoder. Do not rely on community demonstration endpoints for production traffic. Validate appropriate two-wheeler road restrictions, dataset update policy, India coverage, attribution/licensing, service latency and capacity. The app currently accepts up to 100 km road routes inside one service area's endpoint boundary.

Copy `.env.example` to `.env` and enter secrets locally. Generate independent URL-safe random values for database password, Redis password, OIDC client secret and session key. Avoid committing or printing `.env`. The example is not runnable until real configuration is supplied.

## Container deployment

The backend is API-only. Rider, captain and admin are separate web containers; see [separate deployments](SEPARATE-DEPLOYMENTS.md). Configure `PUBLIC_HOST`, `CAPTAIN_HOST` and `ADMIN_HOST`, matching app origins and an exact OIDC callback per app. Caddy routes each hostname to its frontend, which proxies API/auth requests to the common backend.


```sh
cd hop-platform
cp .env.example .env
# Fill .env securely and point your hostname DNS to this host.
docker compose build
docker compose up -d
```

The migration service runs before the API. The database and Redis are private to the container network; only Caddy exposes 80/443. Caddy obtains TLS certificates for `PUBLIC_HOST`. Persist and back up the named database and identity volumes; a container image is not a data backup. The API runs as an unprivileged user on a read-only filesystem with dropped Linux capabilities.

The schema migration command is transaction-protected and repeatable. Only migration 001 exists in this initial foundation. Future schema changes need numbered forward migrations and a rollback/recovery plan; do not edit an already-applied migration on a live database.

For a build runner with dependency access outside Docker, an alternative runtime image is provided:

```sh
cd web
npm ci
npm run build
cd ../backend
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o ../build-output/api ./cmd/api
cd ..
docker build -f Dockerfile.runtime -t hop-app:local .
docker compose up -d --no-build
```

Use the architecture appropriate to your runtime. The runtime Dockerfile copies only the compiled application, migrations and trusted CA bundle. It does not disable TLS or dependency verification. Keep build artifacts tied to the source commit and dependency lockfiles.

## First operator and activation

1. Sign in through the configured identity provider. A rider account is provisioned from the verified issuer/subject pair.
2. In an authenticated operator maintenance session, promote the account UUID:
   `docker compose exec api /app/api promote-operator <uuid>`.
3. Require MFA for that identity at the provider; sign in again and open Operations.
4. Create inactive areas with reviewed bounds, fare amounts in paise, and local operating decisions. Activation needs a nonempty review reference; this is a record of human review, not automated regulatory verification.
5. Review real driver evidence through your approved secure process. Record licence/insurance expiry and decision notes. Approval alone never supplies real drivers or verification evidence.
6. Validate a small controlled pilot, then activate additional areas. Do not enable an India-sized rectangle as a substitute for state-by-state operational review.

## Monitoring, recovery and scaling

`/healthz` checks the process; `/readyz` checks PostgreSQL and Redis. Neither proves identity, routing, driver supply or customer support is available. Monitor quote errors, booking failures, stale location rates, request expiry, database saturation, incident backlog and OIDC login failures. Server logs omit tokens, pickup codes and exact coordinates.

PostgreSQL is the source of truth; Redis failure fails session checks and rate-limited operations closed. Redis loss signs users out but must not erase trips. The expiry worker runs every 15 seconds; expired requests cannot be accepted even before the worker updates their visible state. Active rides are constrained by database indexes and transactional locks across replicas.

Perform encrypted PostgreSQL backups, point-in-time recovery where available, tested restore drills and retention/deletion operations. Use separate runtime and migration database roles with least privilege in a hardened deployment. The supplied single-host compose is a deployment starting point, not a high-availability topology.

Rate limiting must also exist at your ingress. The API ignores forwarding headers by default. Configure `TRUSTED_PROXY_CIDRS` to the exact private ingress network(s) when behind a reverse proxy; never use `0.0.0.0/0`. Only headers from a trusted immediate peer are used, and the chain is examined from the trusted end. Verify that ingress overwrites/appends the real client address. Without this setting, login limits use the shared peer address. Capacity/SLOs require measurement against your traffic target; no throughput guarantee is claimed.

## Remaining external gates

No production domain, identity tenant, email/SMS provider, production routing/geocoding, operator verification process or hosting account was provisioned in this task. No real rides have been enabled or a production environment published. See TESTING.md for network-blocked verification items.
