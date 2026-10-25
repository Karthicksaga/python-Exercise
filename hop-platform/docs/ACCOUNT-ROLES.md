# Using Rider and Captain with one account

Every rider account can book rides. An approved driver profile adds Captain access; it does not remove Rider access or create a second identity. Each app keeps its own session cookie and uses the common backend account. Operator routing remains unchanged.

- Offline drivers book normally in Rider, on the website or Android.
- Online drivers see “Go offline and book” before booking. The booking transaction takes them offline and creates the rider request together. A failed booking rolls back availability changes. Retrying a successful booking returns the original ride.
- Accounts driving an accepted, arrived or in-progress trip cannot create rider bookings.
- Accounts with a live rider request or an accepted, arrived or in-progress rider trip cannot go online or accept driver requests. Expired requests do not block going online.
- Completing or cancelling the rider trip does not put Captain online. The driver must choose “Go online” again.
- Scheduled rider bookings stay pending while the account is online or handling a driver trip. Dispatch resumes when it is offline and free, within the existing scheduling window; otherwise the existing schedule-expiry behavior applies.

Booking, acceptance, online/offline transitions and location updates share an account-scoped PostgreSQL transaction advisory lock. These checks apply across browser tabs, Android apps, devices and API instances, rather than depending on frontend state. Location pings update an already-online driver and never restore availability automatically. The Redis live-location fast path remains, with server availability checked under the transition lock.

Migration 028 sends a commit-time account event when availability changes. Open websites refresh through their existing SSE connection; Android uses its existing polling recovery. Captain stops its tracking when it observes offline status. Its background Android service also checks authenticated availability every ten seconds while connected, including while stationary, and stops on offline status or invalid authentication. Network loss can delay observing the change; the backend blocks location uploads immediately and retains its existing freshness expiry.

Deploy the updated API, migration 028 and frontend builds together, and reinstall the updated Android APKs. Older clients that try to go online by posting location alone must be updated to call `POST /api/drivers/online` explicitly first. `GET /api/drivers/availability` returns only the authenticated account’s online status.

Integration tests cover driver-as-rider booking, explicit offline confirmation, retained approval, idempotent retry, stale background pings, returning to Captain, and simultaneous booking/acceptance or booking/online requests. Validate both apps together on physical Android devices before releasing.
