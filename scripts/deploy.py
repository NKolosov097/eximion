"""Provision and deploy Eximion to a billing-enabled Google Cloud project."""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def find_gcloud():
    found = shutil.which("gcloud") or shutil.which("gcloud.cmd")
    candidate = Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd"
    if found:
        return found
    if candidate.is_file():
        return str(candidate)
    raise SystemExit("Install Google Cloud CLI and sign in before deploying.")


def deploy(project, region, model, model_location):
    gcloud = find_gcloud()

    def call(*args, capture=False):
        result = subprocess.run([gcloud, *args, "--project", project, "--quiet"], check=True, text=True, encoding="utf-8", stdout=subprocess.PIPE if capture else None)
        return result.stdout.strip() if capture else None

    def exists(*args):
        return subprocess.run([gcloud, *args, "--project", project, "--quiet"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

    billing = json.loads(call("billing", "projects", "describe", project, "--format=json", capture=True))
    if not billing.get("billingEnabled"):
        raise SystemExit("Billing is disabled. Link a billing account before provisioning.")
    call("services", "enable", "run.googleapis.com", "sqladmin.googleapis.com", "artifactregistry.googleapis.com", "cloudbuild.googleapis.com", "secretmanager.googleapis.com", "aiplatform.googleapis.com", "iam.googleapis.com")
    if not exists("artifacts", "repositories", "describe", "eximion", "--location", region):
        call("artifacts", "repositories", "create", "eximion", "--repository-format=docker", "--location", region)
    service_account = f"eximion-backend@{project}.iam.gserviceaccount.com"
    if not exists("iam", "service-accounts", "describe", service_account):
        call("iam", "service-accounts", "create", "eximion-backend", "--display-name=Eximion backend")
    for role in ["roles/aiplatform.user", "roles/cloudsql.client"]:
        call("projects", "add-iam-policy-binding", project, f"--member=serviceAccount:{service_account}", f"--role={role}", "--condition=None", "--format=none")
    if not exists("sql", "instances", "describe", "eximion-db"):
        call("sql", "instances", "create", "eximion-db", "--database-version=POSTGRES_17", "--edition=ENTERPRISE", "--tier=db-f1-micro", "--region", region, "--storage-size=10", "--storage-type=SSD", "--availability-type=zonal", "--backup-start-time=03:00", "--deletion-protection")
    if not exists("sql", "databases", "describe", "eximion", "--instance=eximion-db"):
        call("sql", "databases", "create", "eximion", "--instance=eximion-db")
    connection = call("sql", "instances", "describe", "eximion-db", "--format=value(connectionName)", capture=True)
    local = ROOT / ".local"
    local.mkdir(exist_ok=True)
    secret_file = local / "cloud-secrets.json"
    if not secret_file.exists():
        secret_file.write_text(json.dumps({"project": project, "db_password": secrets.token_hex(24), "author_api_key": secrets.token_hex(24)}), encoding="utf-8")
    credentials = json.loads(secret_file.read_text(encoding="utf-8"))
    if credentials["project"] != project:
        raise SystemExit("Local credentials belong to another project; refusing to reuse them.")
    users = json.loads(call("sql", "users", "list", "--instance=eximion-db", "--format=json", capture=True))
    if not any(user["name"] == "eximion" for user in users):
        call("sql", "users", "create", "eximion", "--instance=eximion-db", "--password", credentials["db_password"])
    database_url = f"postgresql+psycopg://eximion:{credentials['db_password']}@/eximion?host=/cloudsql/{connection}"
    for name, value in [("eximion-database-url", database_url), ("eximion-author-key", credentials["author_api_key"])]:
        if not exists("secrets", "describe", name):
            with tempfile.TemporaryDirectory(prefix="eximion-secret-") as directory:
                path = Path(directory) / "value"
                path.write_text(value, encoding="utf-8")
                call("secrets", "create", name, "--replication-policy=user-managed", f"--locations={region}", f"--data-file={path}")
        call("secrets", "add-iam-policy-binding", name, f"--member=serviceAccount:{service_account}", "--role=roles/secretmanager.secretAccessor", "--format=none")
    revision = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    image_root = f"{region}-docker.pkg.dev/{project}/eximion"
    backend_image = f"{image_root}/backend:{revision}"
    frontend_image = f"{image_root}/frontend:{revision}"
    call("builds", "submit", str(ROOT / "backend"), "--tag", backend_image)
    secrets_arg = "DATABASE_URL=eximion-database-url:latest,AUTHOR_API_KEY=eximion-author-key:latest"
    env_arg = f"GOOGLE_CLOUD_PROJECT={project},GOOGLE_CLOUD_LOCATION={model_location},GEMINI_MODEL={model}"
    call("run", "jobs", "deploy", "eximion-migrate", "--image", backend_image, "--region", region, "--service-account", service_account, "--set-cloudsql-instances", connection, "--set-secrets", secrets_arg, "--command=sh", "--args=^@^-c@alembic upgrade head && python -m app.seed", "--max-retries=0", "--task-timeout=300s", "--execute-now", "--wait")
    call("run", "deploy", "eximion-backend", "--image", backend_image, "--region", region, "--service-account", service_account, "--set-cloudsql-instances", connection, "--set-secrets", secrets_arg, "--set-env-vars", env_arg, "--allow-unauthenticated", "--port=8080", "--memory=512Mi", "--cpu=1", "--min=0", "--max=2", "--concurrency=20", "--timeout=90s")
    backend_url = call("run", "services", "describe", "eximion-backend", "--region", region, "--format=value(status.url)", capture=True)
    call("builds", "submit", str(ROOT / "frontend"), "--config", str(ROOT / "scripts/cloudbuild-frontend.yaml"), f"--substitutions=_API_URL={backend_url},_IMAGE={frontend_image}")
    frontend_account = f"eximion-frontend@{project}.iam.gserviceaccount.com"
    if not exists("iam", "service-accounts", "describe", frontend_account):
        call("iam", "service-accounts", "create", "eximion-frontend", "--display-name=Eximion frontend")
    call("run", "deploy", "eximion-frontend", "--image", frontend_image, "--region", region, "--service-account", frontend_account, "--set-env-vars", f"API_INTERNAL_URL={backend_url}", "--allow-unauthenticated", "--port=3000", "--memory=512Mi", "--cpu=1", "--min=0", "--max=2", "--concurrency=40")
    frontend_url = call("run", "services", "describe", "eximion-frontend", "--region", region, "--format=value(status.url)", capture=True)
    call("run", "services", "update", "eximion-backend", "--region", region, "--update-env-vars", f"CORS_ORIGINS={frontend_url}")
    result = {"project": project, "region": region, "model": model, "model_location": model_location, "backend_url": backend_url, "frontend_url": frontend_url, "git_revision": revision}
    (ROOT / "docs/deployment.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    print("Deployment completed; run scripts/smoke.py --live and inspect the browser before claiming verification.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="eximion-511003")
    parser.add_argument("--region", default="europe-west3")
    parser.add_argument("--model", required=True)
    parser.add_argument("--model-location", default="europe-west3")
    options = parser.parse_args()
    deploy(options.project, options.region, options.model, options.model_location)
