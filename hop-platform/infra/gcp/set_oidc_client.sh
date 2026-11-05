#!/usr/bin/env bash
# Connects operator-portal sign-in to a Google OAuth client (GCP-CICD.md, "Google sign-in").
# Google only lets you create that client in the console, so do that first, then run:
#   bash set_oidc_client.sh <client-id> [operator-email,operator-email]
# It asks for the client secret (never pass it on the command line), stores it as a new version of
# hop-oidc-secret, points deploy.local.json at Google with that client and version, validates the
# config, and copies it to the GitHub staging environment the pipeline reads. Safe to re-run.
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-rider-app-6ed5b}"
REPOSITORY="${REPOSITORY:-Karthicksaga/python-Exercise}"
ENVIRONMENT="${ENVIRONMENT:-staging}"
SECRET="${SECRET:-hop-oidc-secret}"
here="$(cd "$(dirname "$0")" && pwd)"
config="$here/deploy.local.json"
die() { echo "✗ $*" >&2; exit 1; }

client_id="${1:-}"
emails="${2:-}"
[[ "$client_id" =~ ^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$ ]] ||
  die "usage: bash set_oidc_client.sh <client-id ending in .apps.googleusercontent.com> [operator emails, comma-separated]"
[ -f "$config" ] || die "$config not found"

read -r -s -p "Client secret for $client_id: " secret; echo
[ -n "$secret" ] || die "No secret entered"

echo "› Storing the client secret as a new version of $SECRET"
version="$(printf '%s' "$secret" | gcloud secrets versions add "$SECRET" --project="$PROJECT_ID" --data-file=- --format='value(name)')"
unset secret
version="${version##*/}"
[[ "$version" =~ ^[0-9]+$ ]] || die "Could not read the new secret version"

echo "› Updating $(basename "$config")"
python3 - "$config" "$client_id" "$emails" "$SECRET:$version" <<'EOF'
import json, sys
path, client_id, emails, secret_ref = sys.argv[1:]
c = json.load(open(path))
c["api_env"]["OIDC_ISSUER"] = "https://accounts.google.com"
c["api_env"]["OIDC_CLIENT_ID"] = client_id
if emails.strip():
    c["api_env"]["OPERATOR_EMAILS"] = ",".join(e.strip().lower() for e in emails.split(",") if e.strip())
c["api_secrets"]["OIDC_CLIENT_SECRET"] = secret_ref
open(path, "w").write(json.dumps(c, indent=2) + "\n")
EOF
python3 "$here/deploy.py" "$config" --validate-only >/dev/null
echo "✓ Config valid: Google sign-in, client $client_id, secret $SECRET:$version"

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  gh variable set HOP_DEPLOY_CONFIG --repo "$REPOSITORY" --env "$ENVIRONMENT" < "$config"
  echo "✓ Updated HOP_DEPLOY_CONFIG in the GitHub '$ENVIRONMENT' environment"
else
  echo "! gh is not signed in: paste the contents of $config into GitHub → Settings → Environments → $ENVIRONMENT → HOP_DEPLOY_CONFIG"
fi

admin="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["origins"]["admin"])' "$config")"
cat <<EOM

Next:
  1. Check the client's "Authorised redirect URIs" include exactly: $admin/auth/callback
  2. Redeploy: push to master, or re-run the latest "Hop platform checks" workflow.
  3. Sign in at $admin with ${emails:-an email you add to OPERATOR_EMAILS}; listed emails become operators.
EOM
