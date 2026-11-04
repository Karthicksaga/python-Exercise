#!/usr/bin/env bash
# Runs the Rider + Captain end-to-end tests against STAGING (see e2e/README.md).
# The local Rider and Captain apps talk to the staging API through their Vite proxy. Each run
# signs up a brand-new test captain (and rider) on fresh 90000xxxxx numbers, so it never touches
# existing accounts. Staging must accept the test sign-in code (DEV_SMS=true).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/.."
config="../hop-platform/infra/gcp/deploy.local.json"
origin() { python3 -c "import json,sys;print(json.load(open('$config'))['origins'][sys.argv[1]])" "$1"; }
: "${HOP_STAGING_URL:=$(origin rider)}"
: "${HOP_E2E_ADMIN_URL:=$(origin admin)}"
: "${HOP_E2E_OPERATOR_PHONE:?Set HOP_E2E_OPERATOR_PHONE to a staging operator account (one-time setup in e2e/README.md)}"
case "$HOP_STAGING_URL" in *staging*) ;; *) echo "Refusing: $HOP_STAGING_URL is not a staging URL" >&2; exit 1 ;; esac

if ! curl -fsS "$HOP_STAGING_URL/api/config" | python3 -c "import json,sys; sys.exit(0 if not json.load(sys.stdin).get('development') else 1)"; then
  echo "Staging API is unreachable (or unexpectedly in development mode): $HOP_STAGING_URL" >&2; exit 1
fi
stamp="$(date +%s)"
export BACKEND_URL="$HOP_STAGING_URL" HOP_E2E_ADMIN_URL HOP_E2E_OPERATOR_PHONE
export HOP_E2E_NEW_CAPTAIN_PHONE="90001${stamp: -5}" HOP_E2E_RIDER_PHONE="90002${stamp: -5}"
# The ride test uses the captain the onboarding test just had approved.
export HOP_E2E_CAPTAIN_PHONE="$HOP_E2E_NEW_CAPTAIN_PHONE"
echo "Staging: $HOP_STAGING_URL · new captain $HOP_E2E_NEW_CAPTAIN_PHONE · rider $HOP_E2E_RIDER_PHONE"
npx playwright test -c playwright.e2e.config.mjs e2e/onboarding.e2e.mjs e2e/ride.e2e.mjs "$@"
