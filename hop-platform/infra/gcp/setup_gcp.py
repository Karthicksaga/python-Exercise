#!/usr/bin/env python3
"""
Automated GCP Infrastructure Setup for Hop Platform.
Provisions all required GCP resources from scratch:
- Enables APIs
- Creates Artifact Registry docker repository
- Provisions Serverless VPC Access connector
- Provisions Cloud SQL PostgreSQL 17 instance, database and user
- Provisions Memorystore Redis instance
- Creates 4 dedicated service accounts and binds least-privilege IAM roles
- Stores database DSN, Redis URL, session key & OIDC secrets in Secret Manager
- Pre-creates Cloud Run placeholder services to capture stable https origins
- Generates a ready-to-deploy infra/gcp/deploy.local.json
"""

import argparse
import json
import secrets
import shutil
import string
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
GCP_DIR = ROOT / "hop-platform" / "infra" / "gcp"

REQUIRED_APIS = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "logging.googleapis.com",
]


def print_step(msg: str):
    print(f"\n\033[1;36m==>\033[0m \033[1m{msg}\033[0m")


def print_ok(msg: str):
    print(f"  \033[32m✔\033[0m {msg}")


def print_warn(msg: str):
    print(f"  \033[33m⚠\033[0m {msg}")


def run_cmd(args: list[str], check: bool = True, capture: bool = True) -> tuple[int, str]:
    res = subprocess.run(
        args,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    if check and res.returncode != 0:
        err = res.stderr.strip() if res.stderr else f"Command failed with code {res.returncode}"
        print(f"\n\033[31mError running {' '.join(args)}:\033[0m\n{err}", file=sys.stderr)
        raise RuntimeError(err)
    return res.returncode, res.stdout.strip() if res.stdout else ""


def gcloud(args: list[str], check: bool = True, capture: bool = True) -> tuple[int, str]:
    return run_cmd(["gcloud", *args], check=check, capture=capture)


def check_auth():
    print_step("Checking Google Cloud authentication")
    if not shutil.which("gcloud"):
        print("\033[31mError: gcloud CLI is not installed.\033[0m", file=sys.stderr)
        print("Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install", file=sys.stderr)
        sys.exit(1)

    code, out = gcloud(["auth", "print-access-token"], check=False)
    if code != 0 or not out:
        print("\033[33mNo active gcloud credentials found.\033[0m")
        print("Running 'gcloud auth login' to authenticate...")
        run_cmd(["gcloud", "auth", "login"], check=True, capture=False)

    _, active_account = gcloud(["config", "get-value", "account"], check=False)
    print_ok(f"Authenticated as: {active_account}")


def enable_apis(project: str):
    print_step("Enabling required Google Cloud APIs")
    gcloud(["services", "enable", *REQUIRED_APIS, "--project", project], check=True, capture=False)
    print_ok("APIs enabled")


def setup_artifact_registry(project: str, region: str, repo: str):
    print_step(f"Setting up Artifact Registry repository '{repo}' in {region}")
    code, _ = gcloud(["artifacts", "repositories", "describe", repo, "--project", project, "--location", region], check=False)
    if code == 0:
        print_ok(f"Repository '{repo}' already exists")
    else:
        gcloud(["artifacts", "repositories", "create", repo, "--project", project, "--location", region, "--repository-format", "docker"], check=True)
        print_ok(f"Repository '{repo}' created")


def setup_vpc_connector(project: str, region: str, connector: str):
    print_step(f"Setting up Serverless VPC Access connector '{connector}'")
    code, _ = gcloud(["compute", "networks", "vpc-access", "connectors", "describe", connector, "--region", region, "--project", project], check=False)
    if code == 0:
        print_ok(f"VPC connector '{connector}' already exists")
    else:
        print("Creating VPC connector (e2-micro, min 2 instances)...")
        gcloud([
            "compute", "networks", "vpc-access", "connectors", "create", connector,
            "--region", region,
            "--range", "10.8.0.0/28",
            "--network", "default",
            "--min-instances", "2",
            "--max-instances", "3",
            "--machine-type", "e2-micro",
            "--project", project,
        ], check=True, capture=False)
        print_ok(f"VPC connector '{connector}' created")


def setup_cloud_sql(project: str, region: str, instance: str, db_name: str, db_user: str) -> tuple[str, str]:
    print_step(f"Setting up Cloud SQL PostgreSQL 17 instance '{instance}'")
    conn_name = f"{project}:{region}:{instance}"
    code, _ = gcloud(["sql", "instances", "describe", instance, "--project", project], check=False)
    
    alphabet = string.ascii_letters + string.digits
    db_password = "".join(secrets.choice(alphabet) for _ in range(24))

    if code == 0:
        print_ok(f"Cloud SQL instance '{instance}' already exists ({conn_name})")
    else:
        print("Creating Cloud SQL instance (db-f1-micro, 10 GB SSD, this may take 3-5 minutes)...")
        gcloud([
            "sql", "instances", "create", instance,
            "--database-version", "POSTGRES_17",
            "--tier", "db-f1-micro",
            "--storage-size", "10",
            "--storage-type", "SSD",
            "--no-storage-auto-increase",
            "--region", region,
            "--project", project,
            "--backup-start-time", "02:00",
        ], check=True, capture=False)
        print_ok(f"Cloud SQL instance '{instance}' created")

    # Create database if not exists
    code, _ = gcloud(["sql", "databases", "describe", db_name, "--instance", instance, "--project", project], check=False)
    if code != 0:
        gcloud(["sql", "databases", "create", db_name, "--instance", instance, "--project", project], check=True)
        print_ok(f"Database '{db_name}' created")
    else:
        print_ok(f"Database '{db_name}' already exists")

    # Create or update user
    code, _ = gcloud(["sql", "users", "describe", db_user, "--instance", instance, "--project", project], check=False)
    if code != 0:
        gcloud(["sql", "users", "create", db_user, "--instance", instance, "--password", db_password, "--project", project], check=True)
        print_ok(f"User '{db_user}' created")
    else:
        gcloud(["sql", "users", "set-password", db_user, "--instance", instance, "--password", db_password, "--project", project], check=True)
        print_ok(f"User '{db_user}' password updated")

    return conn_name, db_password


def setup_redis(project: str, region: str, instance: str) -> str:
    print_step(f"Setting up Memorystore Redis instance '{instance}'")
    code, out = gcloud(["redis", "instances", "describe", instance, "--region", region, "--project", project, "--format", "value(host)"], check=False)
    if code == 0 and out.strip():
        redis_host = out.strip()
        print_ok(f"Redis instance '{instance}' already exists at {redis_host}:6379")
        return redis_host

    print("Creating Memorystore Redis instance (1 GB Basic tier, this may take 2-4 minutes)...")
    gcloud([
        "redis", "instances", "create", instance,
        "--size", "1",
        "--region", region,
        "--network", "default",
        "--tier", "basic",
        "--project", project,
    ], check=True, capture=False)

    _, out = gcloud(["redis", "instances", "describe", instance, "--region", region, "--project", project, "--format", "value(host)"], check=True)
    redis_host = out.strip()
    print_ok(f"Redis instance '{instance}' created at {redis_host}:6379")
    return redis_host


def setup_service_accounts(project: str) -> dict[str, str]:
    print_step("Configuring IAM Service Accounts with least-privilege roles")
    sa_names = {
        "api": "hop-api",
        "web": "hop-web",
        "build": "hop-build",
        "deploy": "hop-deploy",
    }
    sa_emails = {k: f"{v}@{project}.iam.gserviceaccount.com" for k, v in sa_names.items()}

    # Create service accounts
    for name, email in sa_emails.items():
        code, _ = gcloud(["iam", "service-accounts", "describe", email, "--project", project], check=False)
        if code != 0:
            gcloud(["iam", "service-accounts", "create", sa_names[name], "--project", project, "--display-name", f"Hop {name.capitalize()} Service Account"], check=True)
            print_ok(f"Created service account {email}")
        else:
            print_ok(f"Service account {email} exists")

    # Role Bindings
    roles = {
        sa_emails["api"]: ["roles/cloudsql.client"],
        sa_emails["build"]: ["roles/artifactregistry.writer", "roles/logging.logWriter"],
        sa_emails["deploy"]: [
            "roles/run.admin",
            "roles/cloudbuild.builds.editor",
            "roles/artifactregistry.reader",
            "roles/vpcaccess.user",
            "roles/cloudsql.viewer",
            "roles/logging.viewer",
        ],
    }

    for email, role_list in roles.items():
        for role in role_list:
            gcloud(["projects", "add-iam-policy-binding", project, "--member", f"serviceAccount:{email}", "--role", role, "--quiet"], check=True)

    # hop-deploy must be able to act as hop-api, hop-web, and hop-build
    for target in [sa_emails["api"], sa_emails["web"], sa_emails["build"]]:
        gcloud([
            "iam", "service-accounts", "add-iam-policy-binding", target,
            "--member", f"serviceAccount:{sa_emails['deploy']}",
            "--role", "roles/iam.serviceAccountUser",
            "--project", project,
            "--quiet",
        ], check=True)

    print_ok("IAM role bindings configured")
    return sa_emails


def store_secret(project: str, name: str, data: str, sa_api_email: str):
    code, _ = gcloud(["secrets", "describe", name, "--project", project], check=False)
    if code != 0:
        run_cmd(["gcloud", "secrets", "create", name, "--replication-policy", "automatic", "--project", project], check=True)
    
    # Add new secret version with data
    p = subprocess.Popen(["gcloud", "secrets", "versions", "add", name, "--data-file=-", "--project", project], stdin=subprocess.PIPE, text=True)
    p.communicate(input=data)
    if p.returncode != 0:
        raise RuntimeError(f"Failed to add version for secret {name}")

    # Grant read permission to hop-api
    gcloud(["secrets", "add-iam-policy-binding", name, "--member", f"serviceAccount:{sa_api_email}", "--role", "roles/secretmanager.secretAccessor", "--project", project, "--quiet"], check=True)
    print_ok(f"Secret '{name}:1' stored & granted to {sa_api_email}")


def precreate_cloud_run_origins(project: str, region: str, prefix: str, sa_web: str) -> dict[str, str]:
    print_step("Pre-creating Cloud Run placeholder gateways to acquire live HTTPS origins")
    origins = {}
    apps = ("rider", "captain", "admin")
    hello_image = "us-docker.pkg.dev/cloudrun/container/hello"

    for app in apps:
        svc_name = f"{prefix}-{app}"
        code, out = gcloud(["run", "services", "describe", svc_name, "--region", region, "--project", project, "--format", "value(status.url)"], check=False)
        if code == 0 and out.strip():
            url = out.strip()
            print_ok(f"Found existing service {svc_name}: {url}")
            origins[app] = url
            continue

        print(f"Deploying placeholder for {svc_name}...")
        gcloud([
            "run", "deploy", svc_name,
            "--image", hello_image,
            "--region", region,
            "--project", project,
            "--service-account", sa_web,
            "--port", "8080",
            "--allow-unauthenticated",
            "--memory", "128Mi",
            "--quiet",
        ], check=True)

        _, out = gcloud(["run", "services", "describe", svc_name, "--region", region, "--project", project, "--format", "value(status.url)"], check=True)
        origins[app] = out.strip()
        print_ok(f"Provisioned {svc_name}: {origins[app]}")

    return origins


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="rider-app-6ed5b", help="Target Google Cloud Project ID")
    parser.add_argument("--region", default="asia-south1", help="GCP Region (default: asia-south1)")
    parser.add_argument("--prefix", default="hop-staging", help="Cloud Run service prefix (default: hop-staging)")
    parser.add_argument("--maps-key", default="AIzaSyCCa4firTw6fA47CChTyhgpkKyBQrD0fkE", help="Google Maps Browser API Key")
    parser.add_argument("--map-id", default="95dc318d6886956642a639bc", help="Google Maps JavaScript Map ID")
    args = parser.parse_args()

    project = args.project
    region = args.region
    prefix = args.prefix
    repo = "hop-containers"
    connector = "hop-vpc"
    sql_instance = "hop-postgres"
    db_name = "hop"
    db_user = "hop_user"
    redis_instance = "hop-redis"

    print("\033[1;32m============================================================\033[0m")
    print("\033[1;32m   Hop Platform - Automated Google Cloud Infrastructure Setup   \033[0m")
    print("\033[1;32m============================================================\033[0m")
    print(f"Project ID : \033[1m{project}\033[0m")
    print(f"Region     : \033[1m{region}\033[0m")
    print(f"Prefix     : \033[1m{prefix}\033[0m")

    # 1. Auth & set project
    check_auth()
    gcloud(["config", "set", "project", project], check=True)

    # 2. APIs
    enable_apis(project)

    # 3. Artifact Registry
    setup_artifact_registry(project, region, repo)

    # 4. VPC Connector
    setup_vpc_connector(project, region, connector)

    # 5. Service Accounts & IAM
    sa_emails = setup_service_accounts(project)

    # 6. Cloud SQL Postgres
    conn_name, db_pass = setup_cloud_sql(project, region, sql_instance, db_name, db_user)

    # 7. Memorystore Redis
    redis_host = setup_redis(project, region, redis_instance)

    # 8. Secret Manager
    print_step("Storing application credentials in Secret Manager")
    db_dsn = f"postgres://{db_user}:{quote(db_pass)}@localhost/{db_name}?host=/cloudsql/{conn_name}&sslmode=disable"
    redis_url = f"redis://{redis_host}:6379"
    session_key = secrets.token_hex(32)
    oidc_secret = secrets.token_urlsafe(32)

    store_secret(project, "hop-db-url", db_dsn, sa_emails["api"])
    store_secret(project, "hop-redis-url", redis_url, sa_emails["api"])
    store_secret(project, "hop-session-key", session_key, sa_emails["api"])
    store_secret(project, "hop-oidc-secret", oidc_secret, sa_emails["api"])

    # 9. Cloud Run Origins
    origins = precreate_cloud_run_origins(project, region, prefix, sa_emails["web"])

    # 10. Write deploy.local.json
    print_step("Generating populated deploy.local.json")
    deploy_config = {
        "project_id": project,
        "region": region,
        "repository": repo,
        "service_prefix": prefix,
        "runtime_service_account": sa_emails["api"],
        "web_service_account": sa_emails["web"],
        "build_service_account": sa_emails["build"],
        "cloud_sql_instance": conn_name,
        "vpc_connector": connector,
        "maps": {
            "rider": {"api_key": args.maps_key, "map_id": args.map_id},
            "captain": {"api_key": args.maps_key, "map_id": args.map_id},
        },
        "origins": origins,
        "api_env": {
            "OIDC_ISSUER": f"{origins['admin']}/auth/realm",
            "OIDC_CLIENT_ID": "hop-web",
            "ROUTING_URL": f"{origins['rider']}/routing",
            "GEOCODING_URL": f"{origins['rider']}/geocoding",
        },
        "api_secrets": {
            "DATABASE_URL": "hop-db-url:1",
            "REDIS_URL": "hop-redis-url:1",
            "SESSION_KEY": "hop-session-key:1",
            "OIDC_CLIENT_SECRET": "hop-oidc-secret:1",
        },
        "fcm_secret": "",
    }

    local_config_path = GCP_DIR / "deploy.local.json"
    local_config_path.write_text(json.dumps(deploy_config, indent=2) + "\n")
    print_ok(f"Saved: {local_config_path}")

    # Validate against deploy.py
    print_step("Validating configuration with deploy.py")
    code, out = run_cmd([sys.executable, str(GCP_DIR / "deploy.py"), str(local_config_path), "--validate-only"], check=False)
    if code == 0:
        print_ok("deploy.local.json passed all deployment validation rules!")
    else:
        print_warn(f"deploy.py check: {out}")

    print("\n\033[1;32m============================================================\033[0m")
    print("\033[1;32m   🎉 Google Cloud Setup Completed Successfully!            \033[0m")
    print("\033[1;32m============================================================\033[0m")
    print("\nLive Gateway Origins:")
    for app, url in origins.items():
        print(f"  • {app.capitalize():<8}: \033[1m{url}\033[0m")
    print("\nYou can now build & deploy all 4 services at any time by running:")
    print(f"  \033[36mcd hop-platform && python3 infra/gcp/deploy.py infra/gcp/deploy.local.json --revision \"$(git rev-parse HEAD)\"\033[0m\n")


if __name__ == "__main__":
    main()
