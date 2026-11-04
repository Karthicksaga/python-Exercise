# Rider + Captain end-to-end tests

Two tests drive both apps against a real Hop API:

- `onboarding.e2e.mjs`: a new captain signs up in the Captain app (details, portrait, vehicle, every required document), submits, waits in review with nothing unlocked, an operator accepts each document and approves, and the captain can go online.
- `ride.e2e.mjs`: one complete ride. Sign-in by phone code, captain online and sharing GPS, booking with real place search and road routes, accept, drive to the pickup, arrive, pickup code, trip, complete. Then cash: the rider taps "I've paid my Captain" (which lets them book again), the captain confirms it, and each side rates the other.

## Local

```sh
npm run test:e2e
```

`e2e/run-local.sh` does everything and cleans up afterwards:
1. Wipes and migrates the e2e database.
2. Starts its own Redis (port 6390) and a stand-in sign-in provider (8189).
3. Builds and starts the API in development mode (8081).
4. Makes an operator and approves a test captain through the API (`seed.mjs`).
5. Runs both tests with the apps' dev servers (5183, 5184) pointed at that API.

One-time setup: create `e2e/.env.e2e` (gitignored):

```sh
HOP_E2E_DATABASE_URL='postgres://USER:PASSWORD@127.0.0.1:5432/hop_e2e?sslmode=disable'
```

- The database name must end in `_e2e`: it is wiped on every run.
- Needs Go, Node, `psql` and `redis-server` on the PATH.
- Place search (Photon) and routing (OSRM demo server) use public services by default. Set `HOP_E2E_GEOCODING_URL` and `HOP_E2E_ROUTING_URL` to use your own.

## Staging

```sh
HOP_E2E_OPERATOR_PHONE=90000xxxxx npm run test:e2e:staging
```

The local apps talk to the staging API (origins from `hop-platform/infra/gcp/deploy.local.json`). Each run signs up a brand-new captain and rider on fresh `9000xxxxxx` numbers, so existing accounts are never touched. The test captain is left offline. Staging must keep `DEV_SMS=true` so the code `123456` works.

One-time setup: an operator account for the approvals.
1. Sign in once to the staging Rider or Captain app with the number you want as the test operator.
2. Promote that account (Cloud SQL, as a database admin):
   ```sql
   UPDATE accounts SET role='operator' WHERE issuer='phone' AND subject LIKE '%90000xxxxx';
   ```
   or run `./api promote-operator <account UUID>` with the staging `DATABASE_URL`.

## Notes

- Test servers accept the code `123456` and never send an SMS.
- The tests simulate the captain's GPS moving along the way (with a little jitter while standing still, as a real receiver reports; Chrome's simulation otherwise goes silent and the server marks the captain out of date after 20 s), and read fares, codes, names and times from the server instead of fixing them in the test.
- The onboarding test unticks "Optional onboarding for testing", so the real document checks run.
- This is separate from `npm run test:design`, which uses mocked responses and needs no backend.
