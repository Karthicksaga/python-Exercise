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
        self.assertEqual(len(deploys), 4)
        self.assertIn("--no-cpu-throttling", deploys[0])
        self.assertIn("--min-instances=1", deploys[0])
        self.assertTrue(all("@sha256:" in next(a for a in cmd if a.startswith("--image=")) for cmd in deploys))
        self.assertTrue(all("--port=80" in cmd for cmd in deploys[1:]))
        self.assertEqual(environments[0]["RIDER_ORIGIN"], self.config["origins"]["rider"])
        self.assertNotIn("DATABASE_URL", environments[0])
        self.assertEqual([e["HOP_APP"] for e in environments[1:]], ["rider", "captain", "admin"])
        self.assertTrue(all(e["BACKEND_UPSTREAM"] == "https://hop-api-abc.a.run.app" for e in environments[1:]))


if __name__ == "__main__":
    unittest.main()
