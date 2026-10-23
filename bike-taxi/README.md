# Hop — zero-commission bike taxi MVP

Independent prototype inspired by the bike taxi model, not affiliated with Rapido. Riders pay drivers directly; the platform fee is zero. This is a local demo, not a public transport service.

## Run

Requires Python 3.10+; validated with Python 3.12. No application packages, API keys, paid services, or build step are needed.

```sh
cd /workspace/python-Exercise/bike-taxi
python3 server.py
```

The server listens on loopback port 8000. Open its local address in a browser on the same machine. Use a normal browser window for the rider and a separate private window for the driver. Tabs in the same browser session share identity. The cloud onboarding interface does not provide a public preview.

1. Select pickup and destination, review the estimated fare, and request a ride.
2. In the other browser session, choose “I’m a driver” and accept the request.
3. Mark arrival, enter the code shown to the rider, and start the ride.
4. Complete the ride. Both sessions retain the trip in their history.

The UI refreshes every four seconds. Data persists in `rides.sqlite3`. Browser cookies identify demo participants; deleting cookies loses access to that participant's history. `PORT` and `BIKE_TAXI_DB` can override the port and database path.

## MVP requirements and implementation

| Requirement | Current implementation |
| --- | --- |
| Rider booking | Six sample Chennai locations, estimated distance/time/fare, one active booking |
| Driver workflow | Available requests, accept, arrive, verify pickup code, complete |
| Ride state | Server-controlled transitions, cancellation before start, persistent history |
| Payment model | Rider pays driver directly; zero platform commission; no payment collection or confirmation |
| Location | Sample coordinates and a clearly marked illustration; no GPS or road routing |
| Identity | Separate anonymous browser sessions for demonstration; no verified users or drivers |
| Interface | Responsive web app with rider/driver views, status updates, error messages |

Fare formula: approximate straight-line distance × 1.3, then ₹15 + ₹8/km with a ₹25 minimum. This is a sample estimate, not a road distance or published commercial tariff. Chennai is an editable sample city, not a launch decision.

## Architecture

Vanilla HTML/CSS/JavaScript → same-origin JSON API → Python standard-library HTTP server → SQLite. No third-party application dependencies. SQLite transactions and unique indexes prevent duplicate active rider bookings and double assignment of a driver. Pickup codes are returned only to the owning rider. This architecture supports local development; the standard-library HTTP server and demo cookies are not production infrastructure or authentication.

API: `GET /api/state`, `POST /api/quote`, `POST /api/rides`, `POST /api/action`.

## Validation

```sh
python3 -m unittest -v
node --check static/app.js
```

Six API/deployment integration tests cover lifecycle, authorization, wrong pickup codes, duplicate bookings, driver availability, cancellation, input validation, static assets, and database persistence. Tests use a temporary database.

Optional browser end-to-end test (requires Playwright and system Chromium or a Playwright Chromium installation):

```sh
python3 test_browser.py
```

This test uses isolated rider/driver browser contexts and a temporary database on port 8011, checks mobile width, completes a ride, rejects a wrong code, and checks history after reload. Screenshots are saved under `/tmp/bike-taxi-*.png`.

## Two-day scope

Day 1: the working booking-to-completion prototype, direct-payment model, responsive interface, database, and integration checks. This implementation provides that foundation.

Day 2: review the actual rider/driver flow with testers, choose the launch city and fare policy, improve usability, and prepare a controlled staging deployment. Public release is a separate milestone, not a two-day promise.

Before real rides: verified accounts and driver onboarding (licence, vehicle, insurance), role enforcement, secure expiring sessions, TLS and a production server, rate limiting including pickup-code attempts, real location/routing and matching, trip sharing and support/SOS operations, privacy/retention controls, monitoring/backups, and confirmation of local bike-taxi operating requirements. Direct payment also needs an agreed cash/UPI and dispute process. No payment credentials or real passenger data should be entered into this demo.

No commission does not mean no operating costs: maps, messaging, hosting, verification, and support need a funding model. Keep those costs separate from the driver's fare.

## Hosted demo

See [DEPLOY.md](DEPLOY.md) for the prepared Render Free deployment, password protection, and ephemeral storage limitations. The repository-root `render.yaml` configures the service and its `bike-taxi` root directory.
