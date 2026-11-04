#!/usr/bin/env python3
"""Materialize GitHub environment configuration without relying on local files."""
import json
import os
from pathlib import Path
import sys


REQUIRED = {
    "DEPLOY_CONFIG": "HOP_DEPLOY_CONFIG",
    "WIF_PROVIDER": "GCP_WORKLOAD_IDENTITY_PROVIDER",
    "DEPLOY_ACCOUNT": "GCP_DEPLOY_SERVICE_ACCOUNT",
}


def prepare_config(environ):
    missing = [name for key, name in REQUIRED.items()
               if not environ.get(key, "").strip()]
    if missing:
        raise ValueError("Set the following GitHub Actions environment variables: "
                         + ", ".join(missing)
                         + ". CI does not read the git-ignored deploy.local.json file.")
    if not environ.get("RUNNER_TEMP", "").strip():
        raise ValueError("RUNNER_TEMP must point to the runner's temporary directory.")
    try:
        config = json.loads(environ["DEPLOY_CONFIG"])
    except json.JSONDecodeError as error:
        raise ValueError("HOP_DEPLOY_CONFIG must contain valid JSON.") from error
    if not isinstance(config, dict):
        raise ValueError("HOP_DEPLOY_CONFIG must contain a JSON object.")
    target = Path(environ["RUNNER_TEMP"]) / "hop-deploy.json"
    target.write_text(json.dumps(config) + "\n", encoding="utf-8")
    return target


def main():
    try:
        prepare_config(os.environ)
    except (ValueError, OSError) as error:
        print(f"::error::{error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
