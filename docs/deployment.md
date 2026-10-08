# Deployment runbook

## Target and access

Project `eximion-511003`. Cloud Run frontend/backend, Cloud SQL PostgreSQL and Artifact Registry: `europe-west3` (Frankfurt, Germany). Gemini `gemini-3.5-flash-lite`: European `eu` endpoint because this model does not offer Frankfurt. Vertex AI is now documented as Gemini Enterprise Agent Platform. Google Gen AI SDK uses the backend service identity; no Gemini API key is needed.

Required: billing enabled; operator permissions to enable APIs, create service accounts/IAM bindings, Cloud SQL, Artifact Registry, Secret Manager, Cloud Build and Cloud Run. `gcloud auth login` establishes the deploy identity. Enable application-default credentials only for host-based live evaluation.

Billing was enabled by the owner on 2026-10-07 local time. Deployment and live verification completed on 2026-10-08 UTC. Actual URLs, build IDs, ready revisions and migration execution are in deployment.json. Both Cloud Run URL aliases are allowed explicitly in CORS.

## Deploy

After all local checks and commits:

```sh
uv run --project backend python scripts/deploy.py --model gemini-3.5-flash-lite --model-location eu
```

The script checks billing before changes, enables APIs, provisions only named Eximion resources, creates a small zonal PostgreSQL instance with backups/deletion protection, creates scoped runtime identities, stores secrets in Secret Manager, builds containers, runs a separate migration/seed job, deploys services, and sets CORS to the frontend URL. Re-running reuses the named infrastructure. It never recreates or deletes the database.

Generated credentials are in gitignored `.local/cloud-secrets.json`. This file is private and must never be uploaded or committed. The author key is entered manually in the browser and kept in component memory only. Keep the file until project teardown; rotation is an explicit separate operation. Database URLs are delivered at runtime from Secret Manager, never Docker build arguments.

Deployment metadata is written to `docs/deployment.json` only after service deployment. This does not itself prove functional verification.

## Verify

Load AUTHOR_API_KEY from the private local file into the process environment without printing it, then run:

```sh
uv run --project backend python scripts/smoke.py https://BACKEND_URL --live
```

Verify frontend in a browser: extraction, manual edit/reference, review confirmation, save, correct/incorrect attempts and direct case reload. Check `/ready`, actual revision status and persistent rows. Run the live extraction harness as documented in llm.md. Record real commands and outputs in progress.md.

## Exposure and cost

The application is a bounded demonstration, not a multi-user clinical product. Public GET and attempt routes allow solving shared cases; create/extract require an author key. CORS is an origin rule, not authentication. Public attempts can still consume database storage; no claim of production abuse protection is made. Use Cloud Run maximum instances (2/service) and monitor Cloud Billing; these bounds are not a spending cap.

Cloud SQL remains billable while provisioned even when Cloud Run scales to zero. Backups and images can incur storage charges. After the review period, deliberately export valuable data and remove the named Cloud Run services/jobs, Cloud SQL instance (requires disabling deletion protection), secrets and registry images. Do not run destructive teardown automatically.

## CI/CD

GitHub `verify` workflow runs PostgreSQL tests, contract drift, frontend tests/build and Docker builds. Deployment is a reproducible operator command rather than a workflow holding persistent cloud keys. The remote repository was supplied by its owner; this project does not create public repositories. For automated deployment later, use GitHub OIDC Workload Identity Federation instead of service-account JSON keys.
