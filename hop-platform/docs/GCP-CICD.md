# Google Cloud staging and production

The workflow in `.github/workflows/hop.yml` checks Go, web, Android and deployment configuration. Deployment is opt-in: manually run it from `master`, choosing `staging` or `production`. Setting repository variable `HOP_AUTO_DEPLOY=true` also deploys successful pushes to `master` to staging. Pull requests never deploy. Configure GitHub production environment required reviewers and restrict deployment branches to `master` before using production.

This configuration deploys separate rider, captain and admin Cloud Run gateways and one shared Go API. It changes no application features. The API uses one minimum instance with instance-based CPU because dispatch, expiry and notification workers run continuously. Initial maximum API instances is one; assess multi-instance dispatch and database capacity before increasing it. Web gateways can scale to zero. This incurs ongoing infrastructure charges even without users; configure a Cloud Billing budget and alerts before provisioning. Alerts do not cap spending.

## 1. Prepare an isolated environment

Use a staging GCP project with billing enabled. Production should use its own project, database, Redis, identities, secrets and GitHub environment. Do not use the developer localhost services. Sign in locally with `gcloud auth login`, then select the actual project:

```sh
export PROJECT_ID='rider-app-6ed5b'
export REGION='asia-south1'
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com sqladmin.googleapis.com redis.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com vpcaccess.googleapis.com compute.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com logging.googleapis.com
gcloud artifacts repositories create hop-containers --project="$PROJECT_ID" --location="$REGION" --repository-format=docker
for ACCOUNT in hop-api hop-web hop-build hop-deploy; do
  gcloud iam service-accounts create "$ACCOUNT" --project="$PROJECT_ID"
done
```

Provision these environment-specific resources through the GCP console or your infrastructure tooling:

- Cloud SQL PostgreSQL 17, a `hop` database and dedicated application user. Enable automated backups and point-in-time recovery. The image includes migrations 001–028; `MIGRATE_ON_START=true` runs outstanding migrations under the existing migration lock.
- Memorystore Redis and a Serverless VPC Access connector in the same region and VPC. Ensure the connector can reach Redis and any private routing/geocoding services. Do not expose Redis publicly.
- A production-mode HTTPS OIDC provider, with exact callbacks `https://<rider-host>/auth/callback`, `https://<captain-host>/auth/callback`, and `https://<admin-host>/auth/callback`. Retain PKCE, verified email and operator MFA. A Firebase project alone does not replace the current OIDC provider.
- HTTPS endpoints for the existing OSRM-compatible router and Photon-compatible geocoder.
- Three HTTPS app origins. Use custom domains with a supported external HTTPS load balancer, or pre-create the Cloud Run services and use their stable `run.app` URLs. For the latter, temporarily deploy the public `us-docker.pkg.dev/cloudrun/container/hello` image to each `<service_prefix>-rider/captain/admin` service, record `status.url`, then replace it through this pipeline. Do not point production domains at temporary services. The API URL is discovered automatically after API deployment.

Do not assume the example monthly costs in the earlier instructions. Region, SQL edition/tier, networking and minimum instances affect cost.

## 2. Store credentials in Secret Manager

Create the secrets through Secret Manager's console, or upload private files with `gcloud secrets create NAME --data-file=/private/path`. Do not put secret values in shell history, GitHub variables, build arguments or this repository.

Required secrets:

- `hop-db-url`: PostgreSQL DSN using the Cloud SQL Unix socket, for example `postgres://USER:URL_ENCODED_PASSWORD@localhost/hop?host=/cloudsql/PROJECT:REGION:INSTANCE&sslmode=disable`. The connector secures the Cloud SQL connection; the password must be URL-encoded. The application user needs schema migration permissions.
- `hop-redis-url`: Redis connection URL, including credentials if enabled. Use the private address and the TLS configuration required by your instance.
- `hop-session-key`: at least 32 random characters, independent per environment.
- `hop-oidc-secret`: the confidential client's secret from the OIDC provider.

Optional secrets include MSG91 credentials, VAPID private key and payment credentials. Add only their Secret Manager references to `api_secrets`; supported names are validated by `infra/gcp/deploy.py`. SMS login requires a configured provider in production; development OTP codes are unavailable.

For Android background push, put the Firebase server credential JSON in a separate Secret Manager secret and set `fcm_secret` to `secret-name:version`. Grant its Firebase identity the FCM send permission. Client `google-services.json` files belong in each Android app, never in the web or API image. Without these optional settings, deployment succeeds but background FCM is unavailable.

## 3. Assign identities and permissions

Use separate service accounts, granting permissions at the narrowest resource scope supported:

- `hop-api`: Cloud SQL Client on the project; Secret Manager Secret Accessor on each referenced secret. It does not need Cloud Run administration or image publishing rights.
- `hop-web`: no database, Redis, FCM or Secret Manager permissions.
- `hop-build`: Artifact Registry Writer on `hop-containers`, Logs Writer on the project, and Storage Object Viewer on the Cloud Build source staging bucket.
- `hop-deploy`: Cloud Build Editor, Cloud Run Admin (needed to set public invoker policies), Artifact Registry Reader, Service Usage Consumer, Serverless VPC Access User, Cloud SQL Viewer and Logs Viewer on the project. Grant Storage Object Admin on the Cloud Build source staging bucket so `gcloud builds submit` can upload source; scope this role to that bucket. Grant Service Account User separately on `hop-api`, `hop-web` and `hop-build` so it can deploy/build with those identities. It does not need permission to read application secret contents.

Create or identify the Cloud Build source bucket before the first run (normally `PROJECT_ID_cloudbuild`) and grant the bucket permissions above. Keep the Google-managed Cloud Build and Cloud Run service-agent permissions. If an organization policy prevents public Cloud Run invokers, this gateway design needs an approved load balancer/IAM design before deployment.

The API is publicly reachable because gateways proxy without Google IAM tokens; application authentication, authorization and CSRF checks still apply. Do not mistake public Cloud Run invoker access for public access to protected Hop features.

## 4. Connect GitHub without a service-account key

Use Workload Identity Federation. Obtain the numeric GitHub repository and owner IDs from GitHub's repository API, then configure the provider. Replace all placeholders first:

```sh
export REPOSITORY='Karthicksaga/python-Exercise'
export REPOSITORY_ID='NUMERIC_REPOSITORY_ID'
export OWNER_ID='NUMERIC_OWNER_ID'
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud iam workload-identity-pools create hop-github --project="$PROJECT_ID" --location=global --display-name='Hop GitHub deployments'
gcloud iam workload-identity-pools providers create-oidc github \
  --project="$PROJECT_ID" --location=global --workload-identity-pool=hop-github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
  --attribute-condition="assertion.repository_id=='${REPOSITORY_ID}' && assertion.repository_owner_id=='${OWNER_ID}' && assertion.ref=='refs/heads/master' && assertion.workflow_ref=='${REPOSITORY}/.github/workflows/hop.yml@refs/heads/master'"
for ENVIRONMENT in staging production; do
  gcloud iam service-accounts add-iam-policy-binding "hop-deploy@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser \
    --member="principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/hop-github/subject/repo:${REPOSITORY}:environment:${ENVIRONMENT}"
done
```

For separate production and staging projects, repeat with each project's deployment identity and bind only that environment's subject. Do not grant a staging identity access to production.

## 5. Configure and deploy

Copy `infra/gcp/deploy.example.json` to ignored `infra/gcp/deploy.local.json`. Fill actual project, region, accounts, connector, Cloud SQL connection name, app origins, public API configuration and numeric secret versions. Server credentials remain Secret Manager references only. The maps.rider and maps.captain entries contain each app’s Google Maps browser API key and JavaScript Map ID; these client settings are embedded in the website build and are not server secrets. Cloud builds explicitly use Google Maps for rider and captain. Restrict each browser key to its deployed app domain and the required Maps JavaScript/Places APIs; enable Maps billing. Do not put Firebase server keys or other server credentials in maps configuration. An omitted or empty `fcm_secret` disables server FCM configuration. Validate locally:

```sh
python3 hop-platform/infra/gcp/deploy.py hop-platform/infra/gcp/deploy.local.json --validate-only
python3 -m unittest discover -s hop-platform/infra/gcp -p 'test_*.py'
```

In GitHub Settings → Environments, create `staging` and `production`. Set these environment variables:

- `HOP_DEPLOY_CONFIG`: the complete filled JSON configuration, containing no secret values.
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: `projects/NUMBER/locations/global/workloadIdentityPools/hop-github/providers/github`.
- `GCP_DEPLOY_SERVICE_ACCOUNT`: `hop-deploy@PROJECT_ID.iam.gserviceaccount.com`.

For the Android CI builds, also set repository Actions variables `RIDER_GOOGLE_MAPS_API_KEY`, `RIDER_GOOGLE_MAP_ID`, `CAPTAIN_GOOGLE_MAPS_API_KEY`, and `CAPTAIN_GOOGLE_MAP_ID`. Use browser keys suitable for the bundled WebView origin. These public client settings are separate from backend credentials and from the environment-specific web keys in `HOP_DEPLOY_CONFIG`. Without the API keys, Android builds fail with a configuration message rather than producing an APK that silently switches providers.

Require reviewers and restrict branches for production. Merge the reviewed changes to `master`, then run **Hop platform checks** → **Run workflow** → `staging`. Leave `HOP_AUTO_DEPLOY` unset until the first deployment is validated. GitHub environment protection must be configured in GitHub; a workflow file cannot create or enforce missing reviewers itself.

The job builds all four images with the Git commit tag, resolves each image digest, deploys API then gateways, and checks `/` and `/readyz` on all three configured origins. Source uploads explicitly exclude local env files, native trees and credential files. A failed smoke check marks the run failed; it does not automatically roll back schemas or already-deployed services. Cross-service deployment is sequential, not atomic. Use compatible migrations and retain a database backup.

For manual deployment from a clean, reviewed checkout with authenticated `gcloud` and the same permissions:

```sh
python3 hop-platform/infra/gcp/deploy.py hop-platform/infra/gcp/deploy.local.json --revision "$(git rev-parse HEAD)"
```

An initial deployment needs the gateway origins to be reachable for smoke checks. Configure domain routing before running, or use the pre-created services' `run.app` origins. A successful smoke check proves HTTP and database/Redis readiness; separately test rider/captain/operator login, OTP delivery, ride lifecycle, SSE recovery and notification delivery before enabling real service areas.

## Android release and recovery

The existing CI Android artifacts are debug APKs for local testing. They are not published to Play Store. For a release, set each private `.env.android.local` to its own deployed gateway origin (rider to rider, captain to captain), set the three deployed app URLs, add each app's matching Firebase client file, and run `npm run android:rider -- --release` / `npm run android:captain -- --release` from `web`. Sign the resulting bundles with your release signing process; keep keys outside Git. See [Android setup](ANDROID.md).

Retain deployed Cloud Run revisions and image digests. To recover an application rollout, direct traffic for each affected service back to its known-good revision using Cloud Run's revisions page or `gcloud run services update-traffic SERVICE --to-revisions=REVISION=100`. A traffic rollback does not undo migrations. Restore data only through a separately reviewed recovery procedure. Secret versions are pinned, so rotation requires updating the configuration and redeploying.

References: [Cloud Build identities](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts), [GitHub federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines), [Cloud Run background CPU](https://docs.cloud.google.com/run/docs/configuring/billing-settings), [Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets).
