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

    def test_cloud_errors_do_not_echo_sensitive_arguments(self):
        failure = subprocess.CalledProcessError(1, ["gcloud", "--password", "sensitive-value"])
        with patch.object(deployment, "find_gcloud", return_value="gcloud"), patch.object(deployment.subprocess, "run", side_effect=failure):
            with self.assertRaises(SystemExit) as caught:
                deployment.deploy("test-project", "europe-west3", "model", "eu")
            self.assertNotIn("sensitive-value", str(caught.exception))
            self.assertIn("arguments suppressed", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
