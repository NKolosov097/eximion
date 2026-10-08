"""Deployment preflight checks run without changing cloud resources."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("deployment", Path(__file__).with_name("deploy.py"))
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


class DeploymentSafetyTests(unittest.TestCase):
    def test_disabled_billing_stops_before_mutations(self):
        with patch.object(deployment, "find_gcloud", return_value="gcloud"), patch.object(deployment.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, '{"billingEnabled": false}')) as run:
            with self.assertRaisesRegex(SystemExit, "Billing is disabled"):
                deployment.deploy("test-project", "europe-west3", "model", "eu")
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.args[0][1:4], ["billing", "projects", "describe"])

    def test_existing_sql_user_requires_original_credentials(self):
        mutations = []

        def fake_run(args, **kwargs):
            command = args[1:]
            if command[:3] == ["billing", "projects", "describe"]:
                output = '{"billingEnabled": true}'
            elif command[:3] == ["observability", "buckets", "list"]:
                output = '[{"name": "projects/test-project/locations/europe-west3/buckets/_Trace"}]'
            elif command[:3] == ["sql", "users", "list"]:
                output = '[{"name": "eximion"}]'
            elif command[:3] == ["sql", "instances", "describe"]:
                output = "test-project:europe-west3:eximion-db"
            else:
                output = ""
            mutations.append(command)
            return subprocess.CompletedProcess(args, 0, output)

        with tempfile.TemporaryDirectory() as temporary, patch.object(deployment, "ROOT", Path(temporary)), patch.object(deployment, "find_gcloud", return_value="gcloud"), patch.object(deployment.subprocess, "run", side_effect=fake_run):
            with self.assertRaisesRegex(SystemExit, "Existing SQL user"):
                deployment.deploy("test-project", "europe-west3", "model", "eu")
            self.assertFalse((Path(temporary) / ".local/cloud-secrets.json").exists())
            self.assertFalse(any(command[:3] == ["sql", "users", "create"] for command in mutations))
            self.assertFalse(any(command[:3] == ["observability", "buckets", "create"] for command in mutations))
            self.assertFalse(any(command[:3] == ["observability", "settings", "update"] for command in mutations))

    def test_frontend_build_failure_preserves_existing_backend_cors(self):
        backend_env = {"CORS_ORIGINS": "https://existing-frontend.run.app", "EXISTING_SETTING": "keep"}
        backend_deploys = []

        def fake_run(args, **kwargs):
            command = args[1:]
            output = ""
            if command[:3] == ["billing", "projects", "describe"]:
                output = '{"billingEnabled": true}'
            elif command[:3] == ["observability", "buckets", "list"]:
                output = '[{"name":"projects/test-project/locations/europe-west3/buckets/_Trace"}]'
            elif command[:3] == ["sql", "users", "list"]:
                output = '[{"name":"eximion"}]'
            elif command[:3] == ["sql", "instances", "describe"]:
                output = "test-project:europe-west3:eximion-db"
            elif command[:3] == ["run", "deploy", "eximion-backend"]:
                backend_deploys.append(command)
                if "--set-env-vars" in command:
                    backend_env.clear()
                    flag = "--set-env-vars"
                else:
                    flag = "--update-env-vars"
                backend_env.update(item.split("=", 1) for item in command[command.index(flag) + 1].split(","))
            elif command[:3] == ["run", "services", "describe"]:
                output = "https://existing-backend.run.app"
            elif command[:2] == ["builds", "submit"] and "--config" in command:
                raise subprocess.CalledProcessError(1, args)
            return subprocess.CompletedProcess(args, 0, output)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / ".local").mkdir()
            (root / ".local/cloud-secrets.json").write_text(json.dumps({"project": "test-project", "db_password": "test-password", "author_api_key": "test-key"}))
            with patch.object(deployment, "ROOT", root), patch.object(deployment, "find_gcloud", return_value="gcloud"), patch.object(deployment.subprocess, "run", side_effect=fake_run), patch.object(deployment.subprocess, "check_output", return_value="reviewed"):
                with self.assertRaisesRegex(SystemExit, "builds submit failed"):
                    deployment.deploy("test-project", "europe-west3", "model", "eu")
        self.assertEqual(len(backend_deploys), 1)
        self.assertEqual(backend_env["CORS_ORIGINS"], "https://existing-frontend.run.app")
        self.assertEqual(backend_env["EXISTING_SETTING"], "keep")
        self.assertEqual(backend_env["TRACE_EXPORT_ENABLED"], "true")

    def test_cloud_errors_do_not_echo_sensitive_arguments(self):
        failure = subprocess.CalledProcessError(1, ["gcloud", "--password", "sensitive-value"])
        with patch.object(deployment, "find_gcloud", return_value="gcloud"), patch.object(deployment.subprocess, "run", side_effect=failure):
            with self.assertRaises(SystemExit) as caught:
                deployment.deploy("test-project", "europe-west3", "model", "eu")
            self.assertNotIn("sensitive-value", str(caught.exception))
            self.assertIn("arguments suppressed", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
