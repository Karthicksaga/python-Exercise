#!/usr/bin/env python3
"""Build and deploy the Hop services (API, background worker, rider, captain, admin). Configuration contains secret references only."""
import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
APPS = ("rider", "captain", "admin")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def https_url(value, origin=False):
    u = urlsplit(value)
    require(u.scheme == "https" and u.hostname and not u.username and not u.password
            and not u.query and not u.fragment and (not origin or not u.path),
            "Use HTTPS URLs; app origins must have no path or trailing slash")
    require(not any(x in value.lower() for x in ("example.com", "localhost", "your_")),
            "Replace all example URLs before deployment")


def is_staging(c):
    return "staging" in c.get("service_prefix", "")


def media_buckets(c):
    """Private buckets for profile photos and captain documents. Production names them explicitly;
    staging defaults to <project>-<prefix>-portraits / -kyc (created by setup_gcp.py --media)."""
    env = c["api_env"]
    if env.get("MEDIA_PROFILE_BUCKET") or env.get("MEDIA_KYC_BUCKET") or not is_staging(c):
        return env.get("MEDIA_PROFILE_BUCKET", ""), env.get("MEDIA_KYC_BUCKET", "")
    base = f'{c["project_id"]}-{c["service_prefix"]}'
    return base + "-portraits", base + "-kyc"


def validate(c):
    for field in ("project_id", "region", "repository", "service_prefix", "vpc_connector"):
        require(re.fullmatch(r"[a-z][a-z0-9-]{2,45}", c[field]) is not None,
                f"Invalid or missing {field}")
    project = c["project_id"]
    require(c["cloud_sql_instance"].startswith(project + ":" + c["region"] + ":")
            and re.fullmatch(r"[a-z0-9:-]+", c["cloud_sql_instance"]), "Invalid Cloud SQL connection name")
    for field in ("runtime_service_account", "web_service_account", "build_service_account"):
        require(re.fullmatch(r"[a-z][a-z0-9-]+@" + re.escape(project) + r"\.iam\.gserviceaccount\.com", c[field]),
                f"Invalid {field}")
    require(len({c[k] for k in ("runtime_service_account", "web_service_account", "build_service_account")}) == 3,
            "Use separate API, web, and build service accounts")
    for app in APPS:
        https_url(c["origins"][app], origin=True)
    require(len(set(c["origins"].values())) == 3, "App origins must be distinct")
    for app in ("rider", "captain"):
        maps = c["maps"][app]
        require(re.fullmatch(r"AIza[\w-]{20,100}", maps["api_key"]), f"Configure the {app} Google Maps browser API key")
        require(re.fullmatch(r"[a-fA-F0-9]{8,64}", maps["map_id"]), f"Configure the {app} JavaScript Map ID")
    env = c["api_env"]
    # With our own router as a sidecar, the API reaches it on localhost and ROUTING_URL is set at deploy time.
    sidecar = bool(c.get("osrm_image"))
    if sidecar:
        require(re.fullmatch(r"[a-z0-9-]+-docker\.pkg\.dev/" + re.escape(project) + r"/[a-z0-9-]+/osrm(@sha256:[a-f0-9]{64}|:[\w.-]{1,64})", c["osrm_image"]),
                "osrm_image must be this project's Artifact Registry osrm image (tag or @sha256 digest)")
        require(re.fullmatch(r"[1-9][0-9]?Gi", c.get("osrm_memory", "4Gi")), "osrm_memory must look like 4Gi")
    for key in ("OIDC_ISSUER", "GEOCODING_URL") + (() if sidecar else ("ROUTING_URL",)):
        https_url(env[key])
    require(bool(env["OIDC_CLIENT_ID"]), "OIDC_CLIENT_ID is required")
    allowed_env = {"OIDC_ISSUER", "OIDC_CLIENT_ID", "ROUTING_URL", "GEOCODING_URL", "VAPID_PUBLIC_KEY", "VAPID_SUBJECT", "MEDIA_PROFILE_BUCKET", "MEDIA_KYC_BUCKET", "DEV_SMS", "DEV_PAYMENTS", "DEMO_LOGIN"}
    require(set(env) <= allowed_env, "api_env accepts public configuration only; use api_secrets for credentials")
    staging = is_staging(c)
    buckets = list(media_buckets(c))
    if not staging:
        # Production: identity documents need durable private storage, and demo accounts must not exist.
        require(all(buckets), "Production needs MEDIA_PROFILE_BUCKET and MEDIA_KYC_BUCKET (private buckets)")
        require(not env.get("DEMO_LOGIN"), "DEMO_LOGIN is not allowed in production")
        require(env.get("DEV_SMS") != "true" and env.get("DEV_PAYMENTS") != "true", "DEV_SMS/DEV_PAYMENTS are not allowed in production")
    require(isinstance(c.get("worker", True), bool), "worker must be true or false")
    if any(buckets):
        require(all(re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", b) for b in buckets)
                and len(set(buckets)) == 2, "Configure two distinct valid private media bucket names")
    secrets = c["api_secrets"]
    require({"DATABASE_URL", "REDIS_URL", "SESSION_KEY", "OIDC_CLIENT_SECRET"} <= set(secrets),
            "Required API secret references are missing")
    allowed_secrets = {"DATABASE_URL", "DATABASE_LISTEN_URL", "REDIS_URL", "SESSION_KEY", "OIDC_CLIENT_SECRET",
                       "MSG91_AUTH_KEY", "MSG91_TEMPLATE_ID", "SMS_WEBHOOK_URL", "SMS_WEBHOOK_TOKEN",
                       "VAPID_PRIVATE_KEY", "PAYMENT_KEY_ID", "PAYMENT_KEY_SECRET", "PAYMENT_WEBHOOK_SECRET"}
    require(set(secrets) <= allowed_secrets, "Unexpected API secret variable")
    for ref in list(secrets.values()) + ([c["fcm_secret"]] if c.get("fcm_secret") else []):
        require(re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*:[1-9][0-9]*", ref),
                "Secret references must be secret-name:numeric-version; never put secret values in configuration")


def run(args, capture=False):
    result = subprocess.run(["gcloud", *args], cwd=ROOT, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


def deploy(c, revision):
    common = ["--project=" + c["project_id"], "--region=" + c["region"], "--quiet"]
    image_root = f'{c["region"]}-docker.pkg.dev/{c["project_id"]}/{c["repository"]}'
    substitutions = {"_REGION": c["region"], "_REPOSITORY": c["repository"], "_REVISION": revision}
    substitutions.update({f"_{app.upper()}_ORIGIN": c["origins"][app] for app in APPS})
    for app in ("rider", "captain"):
        substitutions[f"_{app.upper()}_GOOGLE_MAPS_API_KEY"] = c["maps"][app]["api_key"]
        substitutions[f"_{app.upper()}_GOOGLE_MAP_ID"] = c["maps"][app]["map_id"]
    admin_map = c.get("maps", {}).get("admin", c["maps"]["rider"])
    substitutions["_ADMIN_MAP_PROVIDER"] = "google" if admin_map.get("api_key") else "osm"
    substitutions["_ADMIN_GOOGLE_MAPS_API_KEY"] = admin_map.get("api_key", "")
    substitutions["_ADMIN_GOOGLE_MAP_ID"] = admin_map.get("map_id", "")
    require(not any("," in value for value in substitutions.values()), "Build values cannot contain commas")
    # Explicit build identity: no reliance on the project's changing default Cloud Build account.
    run(["builds", "submit", ".", "--config=infra/gcp/cloudbuild.yaml",
         "--service-account=projects/" + c["project_id"] + "/serviceAccounts/" + c["build_service_account"],
         "--substitutions=" + ",".join(f"{k}={v}" for k, v in substitutions.items()), *common])
    images = {}
    for app in ("api", *APPS):
        image = f"{image_root}/{app}:{revision}"
        digest = run(["artifacts", "docker", "images", "describe", image,
                      "--project=" + c["project_id"], "--format=value(image_summary.digest)"], capture=True)
        require(re.fullmatch(r"sha256:[a-f0-9]{64}", digest), f"No immutable image digest for {app}")
        images[app] = f"{image_root}/{app}@{digest}"
    allowed_origins = [
        c["origins"]["rider"],
        c["origins"]["captain"],
        c["origins"]["admin"],
        f"https://{c['service_prefix']}-rider-{c['project_id'].split('-')[-1]}.{c['region']}.run.app",
        f"https://{c['service_prefix']}-captain-{c['project_id'].split('-')[-1]}.{c['region']}.run.app",
        f"https://{c['service_prefix']}-admin-{c['project_id'].split('-')[-1]}.{c['region']}.run.app",
        "https://hop-staging-rider-614653152825.asia-south1.run.app",
        "https://hop-staging-captain-614653152825.asia-south1.run.app",
        "https://hop-staging-admin-614653152825.asia-south1.run.app",
        "https://hop-staging-rider-qp262su4sq-el.a.run.app",
        "https://hop-staging-captain-qp262su4sq-el.a.run.app",
        "https://hop-staging-admin-qp262su4sq-el.a.run.app",
    ]
    # Staging runs in production mode too (secure cookies, real document checks, no fake captains);
    # it only opts in to test sign-in and test payments through DEV_SMS / DEV_PAYMENTS.
    app_env = "production"
    routing = {"ROUTING_URL": "http://127.0.0.1:5000"} if c.get("osrm_image") else {}
    profile_bucket, kyc_bucket = media_buckets(c)
    for bucket in (profile_bucket, kyc_bucket):
        try:
            run(["storage", "buckets", "describe", "gs://" + bucket, "--format=value(name)",
                 "--project=" + c["project_id"]], capture=True)
        except subprocess.CalledProcessError:
            # Either missing, or the deploy account can't read bucket metadata (storage.buckets.get).
            print(f"WARNING: could not confirm gs://{bucket} exists; uploads fail if it is missing "
                  "(create it with setup_gcp.py --media)")
    # The worker is one always-on 1 vCPU instance (Cloud Run needs a full vCPU for always-on CPU),
    # roughly US$50/month. Low-cost setups (staging) keep the jobs inside the API instead, which
    # costs nothing extra; their jobs then run while the apps are in use (CPU is only given to
    # requests). Set "worker": true to opt in.
    worker = c.get("worker", not c.get("low_cost", False))
    env = dict(c["api_env"], **routing, APP_ENV=app_env, ADDRESS=":8080", MIGRATE_ON_START="true",
               MEDIA_PROFILE_BUCKET=profile_bucket, MEDIA_KYC_BUCKET=kyc_bucket,
               HOP_ROLE="api" if worker else "all",
               PUBLIC_ORIGIN=c["origins"]["rider"],
               ALLOWED_ORIGINS=",".join(sorted(set(allowed_origins))),
               **{f"{app.upper()}_ORIGIN": c["origins"][app] for app in APPS})
    secrets = dict(c["api_secrets"])
    if c.get("fcm_secret"):
        env["FCM_SERVICE_ACCOUNT_FILE"] = "/secrets/firebase.json"
        secrets["/secrets/firebase.json"] = c["fcm_secret"]
    elif c.get("fcm_project", c["project_id"]):
        # Android push sent as the API's own identity (needs the FCM sender role; setup_github_ci.sh).
        env["FCM_PROJECT_ID"] = c.get("fcm_project", c["project_id"])
    with tempfile.TemporaryDirectory(prefix="hop-deploy-") as directory:
        env_file = Path(directory) / "api-env.json"
        env_file.write_text(json.dumps(env))
        low_cost = bool(c.get("low_cost", False))
        service = ["--service-account=" + c["runtime_service_account"], "--allow-unauthenticated",
                   "--cpu-throttling" if low_cost else "--no-cpu-throttling",
                   "--min-instances=0" if low_cost else "--min-instances=1",
                   "--max-instances=2" if low_cost else "--max-instances=1",
                   "--timeout=3600", "--add-cloudsql-instances=" + c["cloud_sql_instance"],
                   "--vpc-connector=" + c["vpc_connector"], "--vpc-egress=private-ranges-only"]
        api = ["--image=" + images["api"], "--port=8080", "--memory=512Mi", "--cpu=1",
               "--env-vars-file=" + str(env_file), "--set-secrets=" + ",".join(f"{k}={v}" for k, v in secrets.items())]
        if c.get("osrm_image"):
            # Same service, two containers: the API waits until the router answers on localhost:5000.
            osrm = c["osrm_image"]
            if "@sha256:" not in osrm:  # pin a tag to its digest, like the app images
                digest = run(["artifacts", "docker", "images", "describe", osrm,
                              "--project=" + c["project_id"], "--format=value(image_summary.digest)"], capture=True)
                require(re.fullmatch(r"sha256:[a-f0-9]{64}", digest), "No immutable image digest for osrm")
                osrm = osrm.rsplit(":", 1)[0] + "@" + digest
            router = ["--container=osrm", "--image=" + osrm, "--memory=" + c.get("osrm_memory", "4Gi"), "--cpu=1",
                      "--startup-probe=tcpSocket.port=5000,periodSeconds=2,timeoutSeconds=2,failureThreshold=90"]
            run(["run", "deploy", c["service_prefix"] + "-api", *service,
                 "--container=api", *api, "--depends-on=osrm", *router, *common])
        else:
            run(["run", "deploy", c["service_prefix"] + "-api", *service, *api, *common])
        if worker:
            # Background jobs (dispatch, expiry, push, compliance, media cleanup) run in one private,
            # always-on instance, so the API can scale with traffic, or to zero on low-cost staging.
            env_file.write_text(json.dumps(dict(env, HOP_ROLE="worker", MIGRATE_ON_START="false")))
            run(["run", "deploy", c["service_prefix"] + "-worker", "--image=" + images["api"],
                 "--service-account=" + c["runtime_service_account"], "--no-allow-unauthenticated",
                 "--ingress=internal", "--no-cpu-throttling", "--min-instances=1", "--max-instances=1",
                 "--port=8080", "--memory=512Mi", "--cpu=1", "--timeout=3600",
                 "--add-cloudsql-instances=" + c["cloud_sql_instance"],
                 "--vpc-connector=" + c["vpc_connector"], "--vpc-egress=private-ranges-only",
                 "--env-vars-file=" + str(env_file),
                 "--set-secrets=" + ",".join(f"{k}={v}" for k, v in secrets.items()), *common])
        api_url = run(["run", "services", "describe", c["service_prefix"] + "-api",
                       "--format=value(status.url)", *common], capture=True)
        https_url(api_url, origin=True)
        for app in APPS:
            env_file.write_text(json.dumps({"HOP_APP": app, "BACKEND_UPSTREAM": api_url}))
            run(["run", "deploy", c["service_prefix"] + "-" + app, "--image=" + images[app],
                 "--service-account=" + c["web_service_account"], "--port=80", "--allow-unauthenticated",
                 "--min-instances=0", "--max-instances=3", "--memory=256Mi", "--timeout=3600",
                 "--env-vars-file=" + str(env_file), *common])
    for app in APPS:
        for path in ("/", "/readyz"):
            with urlopen(c["origins"][app] + path, timeout=30) as response:
                require(response.status == 200, f"Smoke check failed for {app}{path}")
        print(f"Verified {app}: {c['origins'][app]}")
    print("Deployed source revision:", revision)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--revision", help="Full Git commit SHA")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    c = json.loads(args.config.read_text())
    validate(c)
    if args.validate_only:
        print("Deployment configuration is valid (cloud resources and credentials not checked).")
        return
    require(args.revision and re.fullmatch(r"[a-f0-9]{40}", args.revision), "--revision requires a full Git commit SHA")
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    require(actual == args.revision, "Checked-out commit must match --revision")
    changes = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all", "--", "."],
                                      cwd=ROOT, text=True).strip()
    require(not changes, "Commit or remove changes under hop-platform before deploying a commit-tagged image")
    deploy(c, args.revision)


if __name__ == "__main__":
    main()
