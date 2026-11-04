import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location("hop_deploy", Path(__file__).with_name("deploy.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DeploymentChecks(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(Path(__file__).with_name("deploy.example.json").read_text())
        self.config = json.loads(json.dumps(self.config).replace("rider-app-6ed5b", "hop-test-123")
                                 .replace("example.com", "hop-test.net"))
        for app in ("rider", "captain"):
            self.config["maps"][app] = {"api_key": "AIza" + "test" * 8, "map_id": "abcdef1234567890"}

    def test_google_maps_keys_required_for_both_apps(self):
        for app in ("rider", "captain"):
            config = copy.deepcopy(self.config)
            config["maps"][app]["api_key"] = ""
            with self.assertRaises(ValueError):
                module.validate(config)

    def test_rejects_secrets_in_public_config_and_unpinned_versions(self):
        module.validate(self.config)
        for key, value in [("SESSION_KEY", "sensitive"), ("APP_ENV", "development")]:
            config = copy.deepcopy(self.config)
            config["api_env"][key] = value
            with self.assertRaises(ValueError):
                module.validate(config)
        self.config["api_secrets"]["DATABASE_URL"] = "hop-db-url:latest"
        with self.assertRaises(ValueError):
            module.validate(self.config)

    def test_production_requires_buckets_and_forbids_demo_login(self):
        config = copy.deepcopy(self.config)
        config["service_prefix"] = "hop-prod"
        config["api_env"].pop("MEDIA_PROFILE_BUCKET", None)
        config["api_env"].pop("MEDIA_KYC_BUCKET", None)
        with self.assertRaises(ValueError):
            module.validate(config)
        config["api_env"].update(MEDIA_PROFILE_BUCKET="hop-prod-portraits", MEDIA_KYC_BUCKET="hop-prod-kyc")
        module.validate(config)
        for key in ("DEMO_LOGIN", "DEV_SMS", "DEV_PAYMENTS"):
            bad = copy.deepcopy(config)
            bad["api_env"][key] = "true"
            with self.assertRaises(ValueError):
                module.validate(bad)

    def test_private_media_requires_distinct_complete_bucket_configuration(self):
        self.config["api_env"].update(MEDIA_PROFILE_BUCKET="hop-test-portraits", MEDIA_KYC_BUCKET="hop-test-kyc")
        module.validate(self.config)
        self.config["api_env"]["MEDIA_KYC_BUCKET"] = "hop-test-portraits"
        with self.assertRaises(ValueError):
            module.validate(self.config)
        self.config["api_env"].pop("MEDIA_KYC_BUCKET")
        with self.assertRaises(ValueError):
            module.validate(self.config)

    def test_rejects_insecure_and_shared_origins(self):
        for origin in ["http://rider.hop-test.net", "https://rider.hop-test.net/", "https://user:pass@hop-test.net", "https://localhost"]:
            config = copy.deepcopy(self.config)
            config["origins"]["rider"] = origin
            with self.assertRaises(ValueError):
                module.validate(config)
        self.config["origins"]["captain"] = self.config["origins"]["rider"]
        with self.assertRaises(ValueError):
            module.validate(self.config)

    def test_deploy_preserves_https_workers_ports_and_secret_references(self):
        commands, environments = [], []

        def fake_run(args, capture=False):
            commands.append(args)
            for arg in args:
                if arg.startswith("--env-vars-file="):
                    environments.append(json.loads(Path(arg.split("=", 1)[1]).read_text()))
            if args[:3] == ["artifacts", "docker", "images"]:
                return "sha256:" + "a" * 64
            if args[:3] == ["run", "services", "describe"]:
                return "https://hop-api-abc.a.run.app"

        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.object(module, "run", side_effect=fake_run), patch.object(module, "urlopen", return_value=response):
            module.deploy(self.config, "b" * 40)
        deploys = [cmd for cmd in commands if cmd[:2] == ["run", "deploy"]]
        substitutions = next(arg for arg in commands[0] if arg.startswith("--substitutions="))
        for app in ("rider", "captain"):
            self.assertIn(f"_{app.upper()}_GOOGLE_MAPS_API_KEY=", substitutions)
            self.assertIn(f"_{app.upper()}_GOOGLE_MAP_ID=", substitutions)
        self.assertEqual(len(deploys), 5)
        self.assertIn("--no-cpu-throttling", deploys[0])
        self.assertIn("--min-instances=1", deploys[0])
        self.assertTrue(all("@sha256:" in next(a for a in cmd if a.startswith("--image=")) for cmd in deploys))
        self.assertTrue(all("--port=80" in cmd for cmd in deploys[2:]))
        self.assertEqual(environments[0]["RIDER_ORIGIN"], self.config["origins"]["rider"])
        self.assertEqual(environments[0]["APP_ENV"], "production")
        self.assertEqual(environments[0]["FCM_PROJECT_ID"], self.config["project_id"])  # push without a key file
        self.assertNotIn("DATABASE_URL", environments[0])
        self.assertEqual([e["HOP_APP"] for e in environments[2:]], ["rider", "captain", "admin"])
        self.assertTrue(all(e["BACKEND_UPSTREAM"] == "https://hop-api-abc.a.run.app" for e in environments[2:]))

    def fake_deploy(self, config, missing_bucket=None):
        commands, environments = [], []

        def fake_run(args, capture=False):
            commands.append(args)
            for arg in args:
                if arg.startswith("--env-vars-file="):
                    environments.append(json.loads(Path(arg.split("=", 1)[1]).read_text()))
            if args[:3] == ["storage", "buckets", "describe"] and missing_bucket and missing_bucket in args[3]:
                raise module.subprocess.CalledProcessError(1, args)
            if args[:3] == ["artifacts", "docker", "images"]:
                return "sha256:" + "a" * 64
            if args[:3] == ["run", "services", "describe"]:
                return "https://hop-api-abc.a.run.app"

        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.object(module, "run", side_effect=fake_run), patch.object(module, "urlopen", return_value=response):
            module.deploy(config, "b" * 40)
        return [cmd for cmd in commands if cmd[:2] == ["run", "deploy"]], environments

    def test_low_cost_keeps_jobs_in_the_api_unless_the_worker_is_chosen(self):
        self.config["low_cost"] = True
        deploys, environments = self.fake_deploy(self.config)
        self.assertEqual(len(deploys), 4)  # no always-on worker: no extra cost
        self.assertEqual(environments[0]["HOP_ROLE"], "all")
        self.config["worker"] = True
        deploys, _ = self.fake_deploy(self.config)
        self.assertEqual(deploys[1][2], "hop-staging-worker")

    def test_background_jobs_run_in_a_private_always_on_worker(self):
        self.config["low_cost"] = True
        self.config["worker"] = True
        deploys, environments = self.fake_deploy(self.config)
        api, worker = deploys[0], deploys[1]
        self.assertEqual(api[2], "hop-staging-api")
        self.assertEqual(worker[2], "hop-staging-worker")
        self.assertEqual(environments[0]["HOP_ROLE"], "api")
        self.assertEqual(environments[1]["HOP_ROLE"], "worker")
        self.assertEqual(environments[1]["MIGRATE_ON_START"], "false")  # the API migrates first
        for flag in ("--ingress=internal", "--no-allow-unauthenticated", "--no-cpu-throttling",
                     "--min-instances=1", "--max-instances=1"):
            self.assertIn(flag, worker)
        self.assertIn("--min-instances=0", api)  # low-cost API can now scale to zero
        self.assertTrue(any(a.startswith("--set-secrets=") for a in worker))
        # Turning the worker off keeps the single-service layout.
        self.config["worker"] = False
        deploys, environments = self.fake_deploy(self.config)
        self.assertEqual(len(deploys), 4)
        self.assertEqual(environments[0]["HOP_ROLE"], "all")
        self.config["worker"] = "yes"
        with self.assertRaises(ValueError):
            module.validate(self.config)

    def test_staging_gets_default_private_buckets_that_must_exist(self):
        deploys, environments = self.fake_deploy(self.config)
        self.assertEqual(environments[0]["MEDIA_PROFILE_BUCKET"], "hop-test-123-hop-staging-portraits")
        self.assertEqual(environments[0]["MEDIA_KYC_BUCKET"], "hop-test-123-hop-staging-kyc")
        # A bucket the deploy account can't confirm only warns: the deploy still goes ahead.
        deploys, _ = self.fake_deploy(self.config, missing_bucket="-kyc")
        self.assertEqual(len(deploys), 5)

    def test_router_sidecar_runs_in_the_api_service_on_localhost(self):
        self.config["osrm_image"] = "asia-south1-docker.pkg.dev/hop-test-123/hop-containers/osrm:20261104"
        self.config["api_env"].pop("ROUTING_URL")
        module.validate(self.config)  # ROUTING_URL isn't needed: the API uses the sidecar
        for bad in ("docker.io/osrm/osrm-backend:latest", "asia-south1-docker.pkg.dev/other-project/hop-containers/osrm:1"):
            config = copy.deepcopy(self.config)
            config["osrm_image"] = bad
            with self.assertRaises(ValueError):
                module.validate(config)
        commands, environments = [], []

        def fake_run(args, capture=False):
            commands.append(args)
            for arg in args:
                if arg.startswith("--env-vars-file="):
                    environments.append(json.loads(Path(arg.split("=", 1)[1]).read_text()))
            if args[:3] == ["artifacts", "docker", "images"]:
                return "sha256:" + "c" * 64
            if args[:3] == ["run", "services", "describe"]:
                return "https://hop-api-abc.a.run.app"

        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.object(module, "run", side_effect=fake_run), patch.object(module, "urlopen", return_value=response):
            module.deploy(self.config, "b" * 40)
        api = next(cmd for cmd in commands if cmd[:3] == ["run", "deploy", "hop-staging-api"])
        self.assertEqual(environments[0]["ROUTING_URL"], "http://127.0.0.1:5000")
        # Service flags come first, then each container's own flags.
        self.assertLess(api.index("--service-account=" + self.config["runtime_service_account"]), api.index("--container=api"))
        api_part, router_part = api[api.index("--container=api"):api.index("--container=osrm")], api[api.index("--container=osrm"):]
        self.assertIn("--depends-on=osrm", api_part)
        self.assertIn("--port=8080", api_part)
        self.assertTrue(any(a.startswith("--set-secrets=") for a in api_part))
        self.assertNotIn("--port=8080", router_part)
        self.assertTrue(any(a.startswith("--startup-probe=tcpSocket.port=5000") for a in router_part))
        self.assertTrue(all("@sha256:" in a for a in api if a.startswith("--image=")))


if __name__ == "__main__":
    unittest.main()
