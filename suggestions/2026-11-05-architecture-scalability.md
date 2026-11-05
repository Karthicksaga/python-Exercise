# Architecture: making Hop scale

- **Date:** 5 November 2026
- **Status:** Proposed. Nothing in this document is built yet.
- **Scope:** Go API (`hop-platform/backend`), Rider and Captain apps (`hop-mobile-platform`), and the GCP staging setup (`hop-platform/infra/gcp`).

## Summary

Keep the current shape: one Go service with clear internal modules, Postgres as the source of truth, and Redis for fast-changing data. The correctness foundations are solid. What blocks scale is the runtime setup. The biggest single problem is that every open app asks for its full state every 2 seconds. With today's deploy limits the system tops out at roughly a few hundred open apps. That figure is an estimate until a load test measures it.

## What's already right (keep it)

- **One service, many modules**, with separate roles for the API and background jobs (`HOP_ROLE=api|worker|all`). Splitting into microservices now would add failure points without adding capacity.
- **Correctness under load:**
  - Idempotency keys on bookings and chat messages, and versioned ride actions.
  - Advisory locks and leases for dispatch, and `SKIP LOCKED` for the push queue.
  - Money stored in integer paise.
- **Hot paths off the database:** captain GPS pings go to Redis (geo index) and reach Postgres only as a checkpoint every 10 seconds (`geo.go`, `docs/SCALING.md`).
- **Event-driven building blocks:**
  - Database triggers send NOTIFY signals, which wake waiting requests through the event hub (`events.go`).
  - A transactional push queue (`push_outbox`).
  - Change-driven long polling for chat (`chat.go`).

## What limits scale today

| # | Problem | Where | Effect |
|---|---|---|---|
| 1 | Every open app requests `/api/me` + `/api/state` every 2 s, changed or not | `hop-mobile-platform/shared/maps/liveFeed.ts` (`schedule`, 2000 ms) | About 1 request per second per open app, and half of them are heavy state queries. Load grows with open apps, not with activity. |
| 2 | API capped at 1–2 Cloud Run instances of 1 vCPU / 512 MB | `infra/gcp/deploy.py` (`--max-instances`) | Hard ceiling regardless of traffic. |
| 3 | Database pool left at the library default (4 connections per instance) | `backend/cmd/api/main.go` (`pgxpool.New`) | About 4 queries in flight per instance; everything else queues. |
| 4 | Cloud Run default of 80 open requests per instance | `deploy.py` (no `--concurrency`) | Held chat requests (10 s each) use up slots quickly. |
| 5 | All background jobs on one always-on worker | `deploy.py` (worker `--max-instances=1`) | Throughput ceiling and single point of failure for dispatch, push, expiry and compliance. |
| 6 | No metrics, tracing, alerting, crash reporting or load tests | — | Slowdowns and outages can't be seen or predicted. |
| 7 | One region, one database; HA, point-in-time recovery and restore drills not confirmed | Cloud SQL `hop-postgres`, asia-south1 | A zone or instance failure takes Hop down; recovery is untested. |
| 8 | Fast-growing tables have no partitions or retention | `ride_offers`, `audit_events`, `chat_messages`, `notifications`, `push_outbox` | Slower queries and vacuum over time. |
| 9 | Admin analytics and dispatch reports run on the live database | `operator.go`, `ops_features.go` | Heavy reads compete with rides. |

### Rough capacity math (to be confirmed by a load test)

These are assumptions to show orders of magnitude, not measurements.

- 10,000 open apps make about 5,000 `/api/state` requests a second.
- At about 10 ms of database time each, that is about 50 vCPU-seconds of database work per second.
- Four pooled connections at 10 ms each allow about 400 state requests a second per API instance. Today's ceiling is 1–2 instances, so roughly 400–800 a second, or about 800–1,600 open apps under ideal conditions. Real queries are slower than ideal, so a few hundred is the practical figure.
- Captain GPS: 2,000 online captains is about 1,000 Redis writes a second, which is easy.

## Target architecture

```
Phones / admin ──► Cloud Armor (WAF, edge rate limits, OTP bot protection) ──► Load balancer
                     ├─► API service       stateless, autoscaled: commands + snapshots
                     └─► Realtime service  change-driven long polling now, WebSocket later
API/Realtime ──► PgBouncer ──► Postgres (primary + HA standby + read replica, monthly partitions)
             ──► Redis (geo index, sessions, rate limits, presence, per-user state version)
Postgres outbox ──► Pub/Sub ──► Workers, split by city:
                                dispatch · push/SMS · receipts · expiry · fraud
Postgres changes (Datastream) ──► BigQuery (analytics, admin dashboards, dispatch reports)
Routing: own OSRM per region + route cache, Google only at quote and accept (with daily caps)
Everything ──► OpenTelemetry ──► Cloud Monitoring / Trace, alerts, error reporting
```

### Key decisions

1. **Organise by city ("cells").** Rides, captains, dispatch and Redis keys are naturally per city. Each city's work can move to its own workers and, later, its own database without a rewrite. Accounts, identity and payments stay shared across cities.
2. **Postgres decides; everything else can be rebuilt.** Redis, Pub/Sub and BigQuery can be lost and rebuilt. Events are delivered at least once, and every consumer ignores duplicates (the `client_id` pattern from chat).
3. **Push changes instead of polling.** Make `/api/state` change-driven like chat: the app holds a request that returns only when its ride or offers change. A per-user version number in Redis, bumped by the existing triggers, lets idle requests skip the database entirely.
4. **Separate real-time from commands.** Held connections and short commands scale differently, so they get separate Cloud Run services with their own concurrency and instance limits.
5. **Move wake-up signals off Postgres later.** Postgres NOTIFY takes a global lock at commit and becomes a bottleneck at high write rates. At national scale, switch the signals to Redis pub/sub or Pub/Sub.
6. **Keep analytics off the live database.** Copy changes to BigQuery; admin dashboards and reports read from there.

### Not yet

Kubernetes, Kafka, or a microservices split. Each brings large running costs, and none removes a current bottleneck. Revisit when a measured limit points to one of them.

## Roadmap

### Phase 0: before the pilot (about 1–2 weeks)

| Work | Done when |
|---|---|
| Change-driven `/api/state` (`/api/state/wait` with a per-user version in Redis); remove 2-second polling from `liveFeed.ts` | An idle open app makes about 1 request every 10 s, with no database query when nothing changed |
| Explicit database pool (e.g. 20 per instance) plus Cloud SQL connection pooling or PgBouncer; the LISTEN connection stays direct (`DATABASE_LISTEN_URL`) | Pool size is set in config and visible in metrics |
| Cloud Run: `--concurrency≈500`, a higher `--max-instances` | Load test shows no request queueing at the target load |
| OpenTelemetry metrics and traces, error reporting, crash reporting in the apps, alerts on error rate and latency | A dashboard shows request rate, errors and p95 per endpoint |
| k6 load test of booking, matching, trip and chat as a release gate | A declared target (e.g. 5,000 open apps, 500 live trips) passes on staging |
| Cloud SQL HA, point-in-time recovery, one restore drill | Restore time is measured and written down |

### Phase 1: pilot to a few cities (about 1–2 months)

- A separate realtime service for held requests.
- Dispatch workers claim cities through leases, so dispatch scales sideways and survives a worker loss.
- Monthly partitions and retention for `ride_offers`, `audit_events`, `chat_messages`, `notifications` and `push_outbox`.
- A read replica for history, receipts and admin.
- Analytics copied to BigQuery.
- Cloud Armor in front of the API.
- Self-hosted OSRM (code ready in `hop-platform/infra/osrm/`) plus a route cache.
- Canary releases (Cloud Run traffic splitting) and feature flags.

### Phase 2: national (when traffic demands it)

- One cell per region; Redis Cluster keyed by city.
- Wake-up signals moved off Postgres NOTIFY.
- Database split by city (Citus or AlloyDB) or one database per region.
- Disaster recovery in Delhi (asia-south2).
- WebSockets for live trips.

## Open questions

- What traffic target should Phase 0's load test declare (cities, peak open apps, live trips)?
- Is Cloud SQL already configured for HA, and what tier is it?
- What is the budget ceiling for always-on capacity? The always-on worker (about US$50/month) was rejected earlier.
