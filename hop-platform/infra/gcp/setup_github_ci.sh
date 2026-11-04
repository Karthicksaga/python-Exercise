#!/usr/bin/env bash
# One-time: lets GitHub Actions deploy staging without a service-account key (GCP-CICD.md §4).
# Safe to re-run. Needs gcloud signed in as a project owner/IAM admin.
#   - Workload Identity pool "hop-github" + provider "github", accepting only this repository's
#     hop.yml workflow on master.
#   - The "staging" GitHub environment may act as hop-deploy.
#   - hop-api may send Android pushes (Firebase Cloud Messaging) as itself, with no key file.
#   - hop-deploy's remaining permissions from §3 (Service Usage Consumer, Cloud Build source bucket,
#     read access to the private media buckets' metadata).
# Then prints the three GitHub environment variables to set (and sets them if `gh` is signed in).
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-rider-app-6ed5b}"
REPOSITORY="${REPOSITORY:-Karthicksaga/python-Exercise}"
ENVIRONMENT="${ENVIRONMENT:-staging}"
PREFIX="${PREFIX:-hop-staging}"
here="$(cd "$(dirname "$0")" && pwd)"
ids="$(curl -fsS "https://api.github.com/repos/$REPOSITORY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["id"], d["owner"]["id"])')"
REPOSITORY_ID="${ids% *}" OWNER_ID="${ids#* }"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
DEPLOY="hop-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
POOL="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/hop-github"
q() { "$@" --quiet >/dev/null; }

echo "› Workload Identity pool and GitHub provider"
gcloud iam workload-identity-pools describe hop-github --project="$PROJECT_ID" --location=global >/dev/null 2>&1 ||
  q gcloud iam workload-identity-pools create hop-github --project="$PROJECT_ID" --location=global --display-name='Hop GitHub deployments'
condition="assertion.repository_id=='${REPOSITORY_ID}' && assertion.repository_owner_id=='${OWNER_ID}' && assertion.ref=='refs/heads/master' && assertion.workflow_ref=='${REPOSITORY}/.github/workflows/hop.yml@refs/heads/master'"
provider=(--project="$PROJECT_ID" --location=global --workload-identity-pool=hop-github
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id'
  --attribute-condition="$condition")
if gcloud iam workload-identity-pools providers describe github --project="$PROJECT_ID" --location=global --workload-identity-pool=hop-github >/dev/null 2>&1; then
  q gcloud iam workload-identity-pools providers update-oidc github "${provider[@]}"
else
  q gcloud iam workload-identity-pools providers create-oidc github "${provider[@]}" --issuer-uri=https://token.actions.githubusercontent.com
fi

echo "› GitHub '$ENVIRONMENT' environment may deploy as hop-deploy"
q gcloud iam service-accounts add-iam-policy-binding "$DEPLOY" --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/${POOL}/subject/repo:${REPOSITORY}:environment:${ENVIRONMENT}"

echo "› hop-deploy permissions"
q gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY" --role=roles/serviceusage.serviceUsageConsumer --condition=None
q gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}_cloudbuild" --member="serviceAccount:$DEPLOY" --role=roles/storage.objectAdmin
for kind in portraits kyc; do
  bucket="gs://${PROJECT_ID}-${PREFIX}-${kind}"
  gcloud storage buckets describe "$bucket" >/dev/null 2>&1 &&
    q gcloud storage buckets add-iam-policy-binding "$bucket" --member="serviceAccount:$DEPLOY" --role=roles/storage.legacyBucketReader
done

echo "› hop-api may send Android push notifications (Firebase Cloud Messaging, no key file)"
q gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:hop-api@${PROJECT_ID}.iam.gserviceaccount.com" --role=roles/firebasecloudmessaging.admin --condition=None

provider_name="${POOL}/providers/github"
config="$here/deploy.local.json"
python3 "$here/deploy.py" "$config" --validate-only
echo
echo "GitHub → Settings → Environments → $ENVIRONMENT → Environment variables:"
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER = $provider_name"
echo "  GCP_DEPLOY_SERVICE_ACCOUNT     = $DEPLOY"
echo "  HOP_DEPLOY_CONFIG              = the contents of $config (one JSON object; it holds secret references, not secret values)"
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  gh api -X PUT "repos/$REPOSITORY/environments/$ENVIRONMENT" >/dev/null
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "$REPOSITORY" --env "$ENVIRONMENT" --body "$provider_name"
  gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --repo "$REPOSITORY" --env "$ENVIRONMENT" --body "$DEPLOY"
  gh variable set HOP_DEPLOY_CONFIG --repo "$REPOSITORY" --env "$ENVIRONMENT" < "$config"
  echo "Set all three with gh."
else
  echo "(gh is not signed in, so set them in the GitHub website, or run 'gh auth login' and re-run this script.)"
fi
