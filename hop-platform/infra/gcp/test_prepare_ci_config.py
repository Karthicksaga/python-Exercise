import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("prepare_ci_config.py").resolve()
spec = importlib.util.spec_from_file_location("prepare_ci_config", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrepareCIConfigChecks(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = json.loads(SCRIPT.with_name("deploy.example.json").read_text())
        self.env = {
            "DEPLOY_CONFIG": json.dumps(self.config),
            "WIF_PROVIDER": "projects/123/locations/global/workloadIdentityPools/hop/providers/github",
            "DEPLOY_ACCOUNT": "hop-deploy@hop-test.iam.gserviceaccount.com",
            "RUNNER_TEMP": self.directory.name,
        }

    def test_writes_supplied_configuration_to_runner_temp(self):
        target = module.prepare_config(self.env)
        self.assertEqual(target, Path(self.directory.name) / "hop-deploy.json")
        self.assertEqual(json.loads(target.read_text()), self.config)

    def test_missing_variables_name_the_github_settings(self):
        for key, setting in module.REQUIRED.items():
            with self.subTest(key=key):
                env = {**self.env, key: " \n"}
                with self.assertRaisesRegex(ValueError, setting):
                    module.prepare_config(env)
        self.assertFalse((Path(self.directory.name) / "hop-deploy.json").exists())

    def test_rejects_missing_runner_temp(self):
        with self.assertRaisesRegex(ValueError, "RUNNER_TEMP"):
            module.prepare_config({**self.env, "RUNNER_TEMP": ""})

    def test_rejects_invalid_json_without_exposing_contents(self):
        with self.assertRaisesRegex(ValueError, "must contain valid JSON") as raised:
            module.prepare_config({**self.env, "DEPLOY_CONFIG": "private-value-not-json"})
        self.assertNotIn("private-value", str(raised.exception))
        self.assertFalse((Path(self.directory.name) / "hop-deploy.json").exists())

    def test_rejects_non_object_json(self):
        for value in ["null", "[]", '"config-file.json"', "123"]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "JSON object"):
                module.prepare_config({**self.env, "DEPLOY_CONFIG": value})

    def test_clean_runner_without_local_file_gets_actionable_error(self):
        env = {k: v for k, v in os.environ.items() if k not in module.REQUIRED}
        env.update(self.env, DEPLOY_CONFIG="")
        result = subprocess.run([sys.executable, str(SCRIPT)], cwd=self.directory.name,
                                env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("::error::", result.stderr)
        self.assertIn("HOP_DEPLOY_CONFIG", result.stderr)
        self.assertNotIn("FileNotFoundError", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_cli_works_from_a_clean_runner_directory(self):
        result = subprocess.run([sys.executable, str(SCRIPT)], cwd=self.directory.name,
                                env={**os.environ, **self.env}, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertEqual(json.loads((Path(self.directory.name) / "hop-deploy.json").read_text()), self.config)


if __name__ == "__main__":
    unittest.main()
