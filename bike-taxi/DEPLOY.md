# Free demo deployment on Render

The application uses open-source Python and SQLite. Render is a hosting service with a free tier, not an open-source hosting platform. Check the current plan terms in Render before confirming deployment; choose only the Free instance. No paid database, disk, custom domain, or payment service is required for this demo.

## Deploy through the dashboard

1. Use the GitHub repository `Karthicksaga/python-Exercise`, branch `feat/hop-bike-taxi`. The app is in `bike-taxi/`, and `render.yaml` is at the repository root.
2. Sign in to Render at https://dashboard.render.com and connect that GitHub repository. Choose **New → Blueprint** and select the repository and branch `feat/hop-bike-taxi`. Render reads `render.yaml`.
3. When prompted, set `DEMO_PASSWORD` to a unique password of at least 16 characters. Enter it only in Render's environment settings; do not commit it or post it in chat. The login username is `demo`.
4. Confirm the service uses **Free**, then deploy. The build runs the API tests before starting the app. Wait for a successful deployment and open the HTTPS URL shown by Render. No URL has been created yet by this workspace.
5. Log in as `demo` using your password. Open a private/incognito window (or a second device), log in with the same password, and choose the driver view. These browsers have separate rider/driver session cookies.
6. Request a ride in the rider window, accept it in the driver window, mark arrival, enter the rider's pickup code, start and complete the trip. Status updates take up to four seconds.

Render supplies `PORT` and `RENDER_EXTERNAL_URL`. The app binds to `0.0.0.0`, accepts same-origin HTTPS actions using that external URL, and marks its session cookies Secure. For another host, set `PUBLIC_ORIGIN` to the exact HTTPS origin (no path) and put TLS termination in front of the app.

If Blueprint setup is unavailable, create a Python Web Service from the repository and copy these settings:

- Branch: `feat/hop-bike-taxi`
- Root directory: `bike-taxi`
- Instance: Free
- Build: `python3 -m unittest -v`
- Start: `python3 server.py`
- Health path: `/healthz`
- Environment: `HOST=0.0.0.0`, `PYTHON_VERSION=3.12.14`, `BIKE_TAXI_DB=/tmp/hop-rides.sqlite3`, and your secret `DEMO_PASSWORD` (at least 16 characters).

## Limits and troubleshooting

This is password-protected staging for trusted testers, not a public ride service. The shared password is an access gate, not verified rider/driver identity. The built-in HTTP server remains suitable only for this small demo. Do not use real passenger data.

Free services can sleep while idle, making the next load slow. The local SQLite database is ephemeral: rides may disappear after restart or deployment. This configuration deliberately does not purchase persistent storage. A real pilot needs persistent storage and the production work listed in README.md.

- Build failed: inspect the Render build logs; all six integration tests should pass.
- Startup says password is missing: set `DEMO_PASSWORD` to at least 16 characters in the service's environment settings and redeploy.
- Login prompt: username is `demo`; use the password stored in Render settings.
- Cross-origin error on booking: confirm `RENDER_EXTERNAL_URL` matches the Render URL you opened; for an alternate hostname set `PUBLIC_ORIGIN` explicitly.
- Testing both sides in ordinary tabs fails: ordinary tabs share the same session; use an incognito window or a second browser.

Deployment still requires your Render account. Pushing this source to GitHub does not deploy the app or create a hosted URL. If you later merge into master, update the Blueprint service branch to master before deploying from that branch.
