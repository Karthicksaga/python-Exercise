# Scaling architecture

Target: millions of riders and hundreds of thousands of concurrent drivers. Order of work follows measured hot paths.

## Hot paths (per concurrent driver / rider)

| Path | Rate | Before | Now |
|---|---|---|---|
| Driver location ping | 1 per 2 s per driver | 1 Postgres UPDATE each | Redis only; Postgres checkpoint + revalidation every 10 s |
| `/api/nearby` | 1 per 6 s per browsing rider | Haversine scan of `drivers` | Redis `GEOSEARCH` per category, Postgres only to exclude busy drivers (fallback to bounded SQL if Redis is empty) |
| `/api/rides/{id}/position`, `/nav` | 1 per s / 3 s per trip party | Join on `drivers` | Reads the Redis ping first, SQL fallback |
| Accept / arrive / start | rare | Read `drivers.lat/lng` | `syncDriverLocation` flushes the newest ping to Postgres first, so proximity checks are exact |

Measured locally: 479 pings produced 2 `drivers` row updates (p50 8.7 ms, p99 22 ms per ping, through the real API with auth and CSRF).

## Redis layout (`geo.go`)

- `geo:<category>`: GEO set of driver ids.
- `drv:loc:<id>`: hash lat, lng, acc, at (ms), cat. TTL 90 s.
- `drv:ok:<id>`: validated meta (category, pickup radius). TTL 30 s, forces revalidation (approval, documents, service area).
- `drv:flush:<id>`: 10 s checkpoint throttle (SETNX).
- Going offline, a vehicle change, or a failed validation removes the driver from every key.

Failure mode: if Redis is unavailable the location handler falls back to the original direct Postgres update; nearby falls back to SQL.

## Next steps (see `FEATURES.md` S-01..S-09)

1. Event-driven SSE (largest remaining per-connection DB cost).
2. Dispatch candidates from Redis GEO, shard keys per city.
3. Postgres: PgBouncer, read replica for history/receipts, monthly partitions for event tables.
4. Stateless API behind a load balancer, with SSE on a separate pool; Redis Cluster keyed per city.
5. Own OSRM and geocoder; OSRM table API for ETA ranking.

## Configuration added
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Web Push. Generate with `hop-api vapid-keys`; users tap "Enable alerts" in the UI. Requires migration 016.
- `DATABASE_LISTEN_URL` — optional direct Postgres URL for the LISTEN connection when the main URL goes through PgBouncer.
