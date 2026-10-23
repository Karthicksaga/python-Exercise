# Validation and practical limits

## Executed in this workspace

- Go build and vet.
- PostgreSQL 17 and Redis 7 integration suites with Go's race detector, using a separate disposable database and Redis DB 15. Assertions cover state transitions, ownership, quote expiry and request idempotency, two drivers racing to accept one ride, double assignment prevention, stale location, driver approvals, five-attempt pickup lockout, payment/report separation, CSRF/session/role checks, and unavailable routing.
- OIDC negative/positive integration checks using signed tokens: wrong nonce, expired token, wrong audience, unverified email, consumed state replay, and successful session creation. A separate browser test used an actual Keycloak 26.4 server.
- Trusted-proxy client-IP parsing tests: a client cannot change its rate-limit identity by injecting forwarding headers from an untrusted peer.
- TypeScript check and optimized React build. Production browser assets are about 80 KB gzipped JavaScript plus styles, without external CDN assets.
- Browser flow in Chromium: real OIDC sign-in for three separate identities, operator activation, driver application/approval, browser geolocation heartbeat, rider address search and quote, pickup-code failure and success, completion without automatic payment confirmation, incident reporting, reload-persistent history and logout. Mobile-width layout had no horizontal overflow; no JavaScript exceptions occurred.
- Database migration applied and rerun successfully.
- Render startup path: `MIGRATE_ON_START=true` applied migration 001 on an empty disposable PostgreSQL database, reached readiness with Redis and a local OIDC discovery fixture, and preserved an account through restart. A missing migration file caused a nonzero exit before serving requests. Go vet and race-enabled backend tests passed after this change. The Render Blueprint was parsed and checked locally; this is not provider-side validation or a hosted Auth0 login test.
- Runtime container assembled from the built artifacts; nonroot user 65532 and read-only filesystem verified, migrations and readiness checked, HTML/JS/CSS served successfully.
- `npm audit --omit=dev --audit-level=high` reported no production dependency vulnerabilities at the time of the run.

The routing and geocoding responses in browser/integration tests are **synthetic fixtures**. They prove integration behavior and error handling, not actual India road coverage, geocoding accuracy, or two-wheeler routing suitability. Browser geolocation was simulated; physical-device GPS/background behavior is not validated.

## Not verified / blocked

- The live endpoint `https://vuln.go.dev/index/modules.json.gz` remains blocked in this workspace. A complete local scan using the official Go vulnerability repository snapshot now passes; see [SECURITY-UPDATE.md](SECURITY-UPDATE.md). CI continues to scan the live database. The remote GitHub Actions result has not been verified here.
- The full source-to-image Docker build could not resolve the workspace proxy from build containers. Host builds with the checked-in lockfiles succeeded; the alternate artifact runtime Dockerfile was built and exercised. Repeat the full Dockerfile build in normal CI.
- No production TLS endpoint, production identity realm, SMTP/SMS delivery, production routing/geocoding, multi-host failover, backup restore drill, traffic load target, external penetration test or physical iOS/Android browser check has been completed.
- CI workflow configuration is committed; a local test run does not establish that the remote GitHub Actions workflow passed.

## Reproduce database tests

Use dedicated disposable PostgreSQL and Redis instances. **The integration fixture drops the PostgreSQL public schema and flushes the selected Redis database. Never use production URLs.**

```sh
cd hop-platform/backend
go vet ./...
TEST_DATABASE_URL='postgres://user:password@localhost:5432/hop_test?sslmode=disable' \
TEST_REDIS_URL='redis://localhost:6379/15' \
go test -race ./... -count=1 -v
```

Without these variables, integration tests are explicitly skipped. Unit-only success is not full backend validation.

## Reproduce browser checks

1. Use a disposable application database and Redis DB, and a local Keycloak at `http://localhost:8180` with realm `hop-dev`. Configure confidential client `hop-web`, exact callback `http://localhost:8080/auth/callback`, PKCE S256, and verified email claims. There is no production auth bypass in the application.
2. Run `infra/prepare_e2e.py` with the local admin password supplied through `HOP_DEV_ADMIN_PASSWORD` (not a committed file). This creates explicitly verified synthetic accounts in the local realm only, saving random credentials under ignored `.local/`.
3. Run `python3 infra/route_fixture.py` on loopback port 8191. Configure the development app with `ROUTING_URL=http://127.0.0.1:8191` and `GEOCODING_URL=http://127.0.0.1:8191/api/`. **Never use this fixture in production.**
4. Build and run the real API and web app with `APP_ENV=development`, `PUBLIC_ORIGIN=http://localhost:8080`, and the local identity/database/Redis configuration. Start with a fresh disposable application database for this browser check.
5. Install Python Playwright and Chromium on the test runner, then run:

```sh
HOP_E2E_USERS="$PWD/.local/e2e-users.json" \
HOP_API_BINARY="$PWD/backend/api" \
DATABASE_URL='<the same disposable app database>' \
python3 infra/browser_check.py
```

The script tests through the browser; the only direct administrative command promotes the first operator. Screenshots are written to `/tmp/hop-production-*.png`. These filenames identify the new architecture, not proof of a production deployment.
