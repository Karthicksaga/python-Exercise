# Independent web deployments, common backend

Each app builds and deploys independently. The three apps consume `@hop/shared` as an npm workspace dependency with explicit package exports. Shared source is bundled into each build; it is not a separately hosted runtime service. An app deployment cannot replace another app's assets.

Each app serves `/api/*` and `/auth/*` through its own gateway to the same Go backend. The gateway overwrites `X-Hop-App` with its fixed identity. The backend selects only configured app origins, uses app-specific login/session cookies, and completes OIDC on that app's `/auth/callback`. No cross-origin cookie sharing or browser API URL is needed. Keep the API on a private network behind these gateways in production. CSRF and role checks are unchanged.

## Existing development servers

Ports remain rider 5173, captain 5174, admin 5175, API 8080. Restart the API and all Vite servers after this configuration change. Each app reads its own `.env.local`. Register these exact OIDC callbacks for `hop-web`:

- `http://localhost:5173/auth/callback`
- `http://localhost:5174/auth/callback`
- `http://localhost:5175/auth/callback`

Use `RIDER_ORIGIN`, `CAPTAIN_ORIGIN`, `ADMIN_ORIGIN` to override the development defaults. Never register wildcard redirect origins in production.

## Local Docker

The independent Docker stack uses **5273 / 5274 / 5275** and API **8081** so it can coexist with the current Vite servers. It reuses existing local infrastructure and does not replace database, Redis, or Keycloak containers.

1. Copy `.env.docker.example` to `.env.docker.local`. Fill the backend's actual credentials and stable session key, plus each app's own browser map settings. Host services are reached through `host.docker.internal`.
2. The issuer hostname `auth.hop.localhost` resolves to loopback in the browser and is mapped to the host gateway in the API container. Use a local Keycloak realm that advertises this issuer; a fixed Keycloak frontend URL must agree. Configure `hop-web` with the three callbacks below.
3. Add exact OIDC callback URLs:
   - `http://localhost:5273/auth/callback`
   - `http://localhost:5274/auth/callback`
   - `http://localhost:5275/auth/callback`
4. From `hop-platform`, run:

```sh
docker compose --env-file .env.docker.local -f compose.apps.yaml up --build -d
```

Open rider at `http://localhost:5273`, captain at `http://localhost:5274`, admin at `http://localhost:5275`. The API's port is for health/diagnostics, not a frontend landing page.

Build/redeploy only one frontend:

```sh
docker compose --env-file .env.docker.local -f compose.apps.yaml up --build -d --no-deps rider
```

Replace `rider` with `captain` or `admin` as needed. Stop this stack with the same Compose arguments and `down`; existing infrastructure is outside the stack.

## Production

Deploy one `Dockerfile.api` container and one `Dockerfile.web` image per app (`HOP_APP=rider|captain|admin` build argument). Supply `HOP_APP` at runtime to each web gateway and `BACKEND_UPSTREAM` pointing to the private common API. Set each app's build-time `VITE_RIDER_URL`, `VITE_CAPTAIN_URL`, `VITE_ADMIN_URL` to its own HTTPS deployment URLs. Set matching backend app origins and register their exact callback URLs at the identity provider. Each image receives only its own Google Maps browser key at build time; backend secrets never enter web images. Terminate HTTPS at ingress and preserve the incoming Origin header.

## API-only backend

The Go server no longer serves HTML, JavaScript, CSS, service workers, or SPA routes. Requests to `/`, `/admin`, `/captain` and asset paths return JSON 404 responses; `/api`, `/auth`, `/healthz` and `/readyz` remain backend responsibilities. All backend Dockerfiles package only the API binary, migrations and certificates. `compose.yaml` routes each production hostname to its own frontend container. `compose.apps.yaml` provides the parallel local Docker setup described above.

An already running older API binary must be replaced before this change is visible on port 8080. The Docker backend remains on port 8081 until that cutover. Existing callback registration and environment setup are still required before sign-in can complete.
