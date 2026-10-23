# Python exercises and Hop bike-taxi application

The current bike-taxi implementation is in **[hop-platform](hop-platform/README.md)**: Go API, React/TypeScript mobile-friendly web, PostgreSQL, Redis, and OIDC identity.

Read its [architecture](hop-platform/docs/ARCHITECTURE.md) and [deployment instructions](hop-platform/docs/DEPLOYMENT.md) before deploying. It is a tested implementation foundation with explicit production release gates, not a currently launched passenger service.

The repository-root `render.yaml` deploys the current Go application with external Neon, Upstash, and Auth0 services. Follow the [Render setup guide](hop-platform/docs/RENDER.md); creating provider accounts alone does not deploy the app.

`bike-taxi/` is the earlier Python demo. Existing Python exercise directories are retained.
