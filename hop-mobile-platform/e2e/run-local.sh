#!/usr/bin/env bash
# Rider + Captain end-to-end test against a real, local and disposable Hop backend.
# Needs: Go, Node, psql, redis-server and a PostgreSQL database whose name ends in _e2e
# (it is wiped on every run). Settings come from e2e/.env.e2e (see e2e/README.md).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
backend="$(cd "$root/../hop-platform/backend" && pwd)"
[ -f "$here/.env.e2e" ] && . "$here/.env.e2e"
: "${HOP_E2E_DATABASE_URL:?Set HOP_E2E_DATABASE_URL in e2e/.env.e2e}"
db_name="${HOP_E2E_DATABASE_URL##*/}"; db_name="${db_name%%\?*}"
[[ "$db_name" == *_e2e ]] || { echo "Refusing to wipe '$db_name': the e2e database name must end in _e2e" >&2; exit 1; }
redis_port="${HOP_E2E_REDIS_PORT:-6390}"
work="$(mktemp -d)"
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; redis-cli -p "$redis_port" shutdown nosave >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

echo "› Resetting $db_name"
psql "$HOP_E2E_DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "SET client_min_messages=warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
echo "› Starting Redis on $redis_port and the sign-in stub"
redis-server --port "$redis_port" --save "" --appendonly no --daemonize yes --logfile "$work/redis.log"
python3 -I "$here/oidc-stub.py" 8189 & pids+=($!)
echo "› Building and migrating the API"
(cd "$backend" && go build -o "$work/hop-api" ./cmd/api)
export APP_ENV=development ADDRESS=127.0.0.1:8081 DATABASE_URL="$HOP_E2E_DATABASE_URL" REDIS_URL="redis://127.0.0.1:$redis_port/0" \
  PUBLIC_ORIGIN=http://127.0.0.1:8081 RIDER_ORIGIN=http://127.0.0.1:5183 CAPTAIN_ORIGIN=http://127.0.0.1:5184 ADMIN_ORIGIN=http://127.0.0.1:5175 \
  SESSION_KEY="$(openssl rand -hex 32)" OIDC_ISSUER=http://127.0.0.1:8189 OIDC_CLIENT_ID=hop-e2e OIDC_CLIENT_SECRET=unused \
  ROUTING_URL="${HOP_E2E_ROUTING_URL:-https://router.project-osrm.org}" GEOCODING_URL="${HOP_E2E_GEOCODING_URL:-https://photon.komoot.io/api}"
# The API reads its migrations relative to the backend folder.
(cd "$backend" && "$work/hop-api" migrate >/dev/null)
(cd "$backend" && exec "$work/hop-api" > "$work/api.log" 2>&1) & pids+=($!)
for _ in $(seq 1 60); do curl -fs http://127.0.0.1:8081/api/config >/dev/null 2>&1 && break; sleep 0.5; done
curl -fs http://127.0.0.1:8081/api/config >/dev/null || { echo "API did not start:"; tail -20 "$work/api.log"; exit 1; }
echo "› Approving the test captain"
HOP_E2E_DATABASE_URL="$HOP_E2E_DATABASE_URL" node "$here/seed.mjs" 9000000001 9000000002
echo "› Running the end-to-end tests"
cd "$root"
status=0
npx playwright test -c playwright.e2e.config.mjs "$@" || status=$?
mkdir -p test-results/e2e && cp "$work/api.log" test-results/e2e/api.log
[ "$status" = 0 ] || { echo "API log (last 30 lines; full log in test-results/e2e/api.log):"; grep -v "status=401" "$work/api.log" | tail -30; }
exit "$status"
