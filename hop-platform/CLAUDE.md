# Hop platform: Go API + canonical mobile renderer

- `backend/`: Go module `hop`. Entry point is `cmd/api`, all code is in `internal/app/`, and migrations are numbered in `migrations/`.
- `prototypes/mobile-first/`: the canonical Rider/Captain UI, imported by `../hop-mobile-platform`. UI rules are in `../hop-mobile-platform/CLAUDE.md`.
- `web/`: older React web UI. Deprecated for mobile, so don't use it as a design reference.
- `web/apps/admin/`: the operations console (Design 03, Nov 2026; approved preview in `prototypes/admin-03/`).
  - `src/AdminApp.tsx` is the shell and hash routes (`#zones/<id>`, `#reviews/expiring`); one file per page in `src/screens/`.
  - `src/ui.tsx` holds the small UI kit, `src/lib.ts` the formatters, `src/types.ts` the API shapes.
  - Styles live only in `src/admin.css`, using the same tokens as the mobile apps. The console doesn't load `@hop/shared/style.css`. Mantine stays loaded only for shared map pieces.
  - Maps go through `@hop/shared/mapkit`. `MapRect` and `MapRectEditor` draw and edit zone boxes on Google or OSM.
  - The server rejects unknown JSON fields, so send exactly the fields a handler decodes.
- `docs/API.md`: the request/response contract. Read it before opening handlers.

## Backend map (`backend/internal/app/`)
| Area | Files |
|---|---|
| Server, routing, config | `server.go`, `config.go` |
| Auth, sessions, OTP | `auth.go`, `otp.go`, `profile_phone.go` |
| Quotes, places, rides | `quotes.go`, `places.go`, `rides.go`, `trips.go`, `journey.go`, `shared.go` |
| Dispatch | `dispatch.go`, `dispatch_eta.go`, `live.go`, `events.go`, `push.go`, `mobile_push.go` |
| Captains | `drivers.go`, `drivertools.go`, `demand.go`, `onboarding.go`, `media_store.go` |
| Money | `money.go`, `payments.go`, `receipts.go` |
| Rider extras | `companion.go`, `customer.go`, `profile.go`, `experience.go` |
| Operator/admin | `admin.go`, `operator.go`, `ops.go`, `ops_features.go` |

Tests sit next to the code (`*_test.go`). Integration tests need PostgreSQL and Redis.

```sh
cd backend && go build ./... && go test ./...
# Integration tests are skipped unless pointed at disposable services (DB name must end in _test; it is wiped):
TEST_DATABASE_URL=postgres://…/hop_integration_test TEST_REDIS_URL=redis://127.0.0.1:6390/15 go test ./... -p 1
```

Captain document rules (required/optional kinds, rejection reasons, review claims, expiry job) live in `internal/app/documents.go`; approval is only `POST /api/admin/drivers/{id}` (`admin.go`). Never trust client-sent testing flags; only `Config.Development` relaxes checks, and demo login needs `Config.DemoLogin`.

Zones (`areas`) are lat/lng rectangles. Two live zones may not overlap (`saveArea`, 409). `region_catalog` (migration 035) lists districts operators can start a zone from, with city limits from migration 036 (`city_source` is `boundary` or `approx`). Add a state with `backend/scripts/fetch_districts.py`, and its city limits with the script's `--cities` mode. Run it once and commit the generated migration; never call OpenStreetMap at runtime.

Money is stored in integer paise. Ride status changes go through versioned actions (`POST /api/rides/{id}/actions` with `version`). Keep both rules.
