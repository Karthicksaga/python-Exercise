# Live booking integration checks

The normal browser suites use deterministic API fixtures. This separate suite uses
real Maps, Places and quote endpoints without route interception.

Run against a development environment with a test account, an active service area,
Google Maps configured, and browser location permission granted in the saved state:

```sh
HOP_LIVE_RIDER_URL=http://localhost:5173 \
HOP_LIVE_STORAGE_STATE=/private/tmp/hop-test-account.json \
HOP_LIVE_DESTINATION='a real address within the service area' \
npx playwright test --config=playwright.live.config.ts
```

The storage state contains authentication credentials; keep it outside the repository.
The suite defaults to verifying autocomplete, Google Maps rendering, quotes, and refresh.
Set `HOP_LIVE_CREATE_RIDE=1` only for a disposable development account when a real
booking is intended. This creates a ride; cancel it through the development app afterward.
No staging or production account is selected automatically. Missing configuration
is reported as a skipped test, never as a successful live integration check.

Pickup instructions require backend migration `033_pickup_instructions.sql` before
running the updated API. Existing booking clients may omit the optional field.
