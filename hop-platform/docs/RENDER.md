# Render testing deployment with Neon, Upstash, and Auth0

This deploys the current Go API and mobile-friendly React website as one Docker web service. The repository-root `render.yaml` selects the free application plan and branch `feat/production-web-foundation`. It does not create paid databases or other provider resources. Check the providers' current allowances in their dashboards; free-tier availability and continued eligibility are not guaranteed.

Signing in to a provider using GitHub authorizes that provider. It does not give this coding workspace access to your account. No provider passwords, database URLs, or tokens belong in chat, GitHub, or this document. Enter them directly in Render's environment settings.

## 1. Neon: use the existing project `rapido`

In Neon, open `rapido` and create a separate branch for testing if your plan permits, or use a new empty database in that project. Do not point this deployment at an existing unrelated application's database. The project name is not necessarily the database name; use the database and role shown in Neon's connection dialog.

Choose a **direct connection** with connection pooling disabled for this initial small deployment. Copy the PostgreSQL connection URI into Render as `DATABASE_URL`, preserving the SSL parameters Neon supplies. This app uses the PostgreSQL wire protocol; it does not use Neon's HTTP API or a Neon API key. The first startup applies schema migration 001 inside a transaction with an advisory lock. Later restarts leave the existing schema and trips intact. Migration failure prevents the server from starting.

## 2. Upstash: create a Redis database

Use an eligible free Redis database near the Render region. In its connection settings choose a standard **Redis/TLS** connection, not the REST endpoint or REST token. Set Render's `REDIS_URL` to the provider-supplied URL, with the structure:

```text
rediss://default:<URL-encoded-password>@<endpoint>:<port>/0
```

Keep TLS enabled and use database 0. The app uses sessions, `GETDEL`, and Lua rate-limit operations. Watch the provider's command allowance during testing: the current web UI polls state and driver location updates generate requests. Exhausted allowances can prevent login or booking.

## 3. Auth0: create the application

Create an Auth0 **Regular Web Application** for the Go server. Use authorization-code login and a confidential client with client-secret authentication; the server sends PKCE S256. Enable an appropriate database or social connection for testers, verified-email signup, and an email delivery method. The app requires the ID token's `email_verified` claim to be true.

Copy these settings directly into Render:

| Render variable | Auth0 setting |
| --- | --- |
| `OIDC_ISSUER` | Exact issuer from discovery, normally `https://YOUR-TENANT.REGION.auth0.com/` including the trailing slash |
| `OIDC_CLIENT_ID` | Application Client ID |
| `OIDC_CLIENT_SECRET` | Application Client Secret |

Once Render assigns the public hostname, set Auth0 **Allowed Callback URLs** to exactly:

```text
https://YOUR-ACTUAL-SERVICE.onrender.com/auth/callback
```

Use the actual hostname, without a wildcard. Application logout currently clears the local session only; it does not sign out of Auth0 globally. Use separate browser profiles for rider, driver, and operator testing. Configure MFA for the operator identity using the controls available in your identity plan before enabling real service.

## 4. Routing and address search

These four hosting accounts do not provide road routing or geocoding. Booking additionally requires:

| Render variable | Required service |
| --- | --- |
| `ROUTING_URL` | Base URL of a reachable OSRM-compatible routing service |
| `GEOCODING_URL` | Full Photon-compatible search endpoint, including `/api/` when appropriate |

Use providers that allow your intended traffic and cover the test area. Do not insert invented URLs just to make configuration pass. The local route fixture is synthetic, binds to loopback, and is not a publicly reachable provider. Map-provider keys for unrelated APIs cannot be substituted without implementing an adapter. Provider selection remains necessary before end-to-end booking tests; the application requires these settings and fails closed when route requests fail.

## 5. Create the Render service

In Render, choose **New → Blueprint**, select `Karthicksaga/python-Exercise`, and explicitly select branch **`feat/production-web-foundation`**, with Blueprint path `render.yaml`. Do not use the old `feat/hop-bike-taxi` branch. Review that the service plan is **Free** before applying.

The Blueprint prompts for the external settings above and `PUBLIC_ORIGIN`. Use the actual Render HTTPS origin without a trailing slash. If the hostname is only assigned after creating the service, update `PUBLIC_ORIGIN` and the Auth0 callback before retrying deployment. An initial failed deployment with incomplete configuration is not a reason to disable authentication or switch to development mode.

The Blueprint generates a random `SESSION_KEY` and sets:

```text
APP_ENV=production
ADDRESS=:10000
MIGRATE_ON_START=true
```

Keep the generated session key stable across deployments. It derives pickup codes. The application binds on port 10000; Render terminates HTTPS, and the Go server serves both the React build and API. Caddy and the Compose database containers are not used here. The image's normal entrypoint runs migrations then starts the API; do not override the Docker command or add a separate pre-deploy job.

For manual Web Service creation instead of a Blueprint, use Docker, root directory `hop-platform`, Dockerfile `./Dockerfile`, Docker context `.`, the same branch, the Free plan, health-check path `/readyz`, and all environment variables from `render.yaml`. Generate your own random session key of at least 32 characters in this manual path.

Leave `TRUSTED_PROXY_CIDRS` unset unless you have verified Render's exact ingress-only proxy ranges. Do not trust all IP addresses. Without trusted ranges, login throttling can group testers behind the same proxy; this must be resolved and tested before a wider rollout.

## 6. Verify and create the first operator

Wait for a successful Render deploy and verify:

1. `/healthz` returns HTTP 200 and `/readyz` returns HTTP 200. Readiness checks database and Redis, not the complete ride workflow.
2. The website opens over HTTPS on a phone and desktop.
3. Auth0 login completes after email verification. While signed in, opening `/api/me` returns your own account UUID.
4. Promote only your intended operator account using the maintenance command in [DEPLOYMENT.md](DEPLOYMENT.md). If the hosting plan has no shell, the following transaction can be run by the database owner in Neon's SQL editor, connected to this deployment's database. Replace the UUID with that account's UUID first:

```sql
BEGIN;
WITH promoted AS (
  UPDATE accounts SET role = 'operator'
  WHERE id = 'REPLACE-WITH-YOUR-ACCOUNT-UUID'::uuid
  RETURNING id
)
INSERT INTO audit_events(action, detail)
SELECT 'operator_promoted', jsonb_build_object(
  'account_id', id::text, 'source', 'neon_owner_maintenance'
) FROM promoted;
COMMIT;
```

The statement must affect exactly one account. This is owner-only maintenance, not a public app endpoint. Reload the app and open Operations. Do not send database credentials to testers.

5. Create a small test area and separate rider/driver accounts, approve the test driver, then exercise quote → request → accept → arrive → pickup code → complete. Check cash/direct UPI reporting, cancellation, and history after reload. Use synthetic identities and no real passengers during this validation.

Free hosts can sleep or pause services. First requests and login can fail while dependencies wake; retry after readiness succeeds. Do not use artificial keep-alive traffic to evade free-plan limits. A successful testing deployment is not evidence of continuous dispatch availability or production approval.

## Deployment evidence

This configuration is prepared for deployment. No Render service URL, Neon connection, Upstash database, or Auth0 tenant has been accessed from this workspace. Public deployment, hosted login, and real road/address results remain unverified until the provider settings are supplied through their dashboards and the checks above succeed.
