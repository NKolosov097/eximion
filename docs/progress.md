# Progress

## Initial inspection
- Eximion exists and is empty, including hidden files. No existing changes to preserve.
- No applicable AGENTS.md found in Eximion or its ancestors. User-provided AGENTS instructions and C:/Users/Admin/.claude/CLAUDE.md read.
- Worktree-zone and BrightPattern-specific rules do not apply. New dedicated repository on nkolosov/eximion.
- Git identity: Nikita Kolosov <n.kolosov2003@mail.ru>.
- Node 24.19.0, npm 11.17.0, uv 0.12.4, Docker CLI 29.6.2 available. Docker engine initially stopped. gcloud not on PATH.
- Sandbox command startup fails before command execution (setup refresh had errors); reviewed escalated execution works.
- GCP project, region, billing/access and optional GitHub remote requested; response pending.

## Checks
- Get-ChildItem -Force: empty.
- git status --short before initialization: not a repository.
- docker version: client available; engine initially unavailable.

## Status
Specification saved; API contract and implementation plan in preparation. Implementation and deployment not yet complete.

## Local implementation and verification (2026-10-07, America/Los_Angeles)

- API, normalized PostgreSQL tables, explicit Alembic migration, idempotent demo seed, exact Unicode-normalized grading and author-key protection implemented.
- Gemini module uses google-genai 2.29.0 structured JSON, Pydantic validation, timeouts and sanitized errors. Five synthetic evaluation examples; offline fixture results are NOT model accuracy evidence.
- Frontend authoring/review/edit/save, Server Component case, client scoring, English strings and generated types implemented. Author key stays in memory. Client requests time out after 60 seconds.
- Official model documentation supports gemini-3.5-flash-lite in eu, not Frankfurt. Applications/database remain europe-west3; model endpoint eu.
- Independent review corrected Cloud Build upload filters and partial-deployment credential recovery. Verified gcloud meta list-files-for-upload separately in backend/frontend: no .env, .venv, node_modules or .next.

### Commands and observed results

- uv run --project backend python -m pytest backend/tests -q with TEST_DATABASE_URL=postgresql+psycopg://eximion:eximion-local-only@127.0.0.1:55432/eximion_test: **43 passed**. Real PostgreSQL, isolated temporary schemas, migration round trip and schema drift included. One upstream Starlette TestClient deprecation warning; no failing test.
- npm run typecheck --prefix frontend: passed.
- npm test --prefix frontend: **9 passed** (forms and request timeout/error handling).
- npm run build --prefix frontend: passed (Next production build).
- npm audit: zero reported vulnerabilities at installation.
- uv run --project backend python scripts/generate-contract.py; git diff --exit-code -- docs/openapi.json frontend/src/lib/api.generated.ts: passed, no contract drift. Generator uses stdin to avoid upstream Windows Cyrillic-path decoding defect.
- uv run --project backend python -m unittest discover -s scripts -p "test_*.py" -v: **3 passed** (billing stops before mutation, existing SQL user requires original credentials, error text suppresses sensitive arguments).
- docker compose config --quiet: passed.
- docker compose build: both production images built successfully.
- docker compose run --rm backend python -m alembic upgrade head: passed.
- docker compose run --rm backend python -m app.seed: passed.
- uv run --project backend python scripts/smoke.py http://127.0.0.1:8000: passed; actual create/get/correct+incorrect attempt and invalid-author rejection. Case 8aed35ae-5789-4b58-8cd5-725bbc31c2a4.
- Initial smoke immediately after container start hit a startup race. Backend Compose readiness healthcheck and frontend healthy dependency added; use docker compose up -d --wait.
- Browser via Playwright against production Compose frontend: home/demo navigation, correct 100/100 and incorrect 0/100, no page exceptions. At /clinical-cases/new, real unconfigured extraction returns the expected unavailable message and preserves source text.
- Browser authoring flow with explicitly mocked extraction response and REAL backend persistence: edit title, independent reference/variant, review checkbox, save, navigation, reload and correct attempt passed. This does not claim live Gemini success. Created case b6ea71b6-32f2-42da-aebb-38dabeda948a.
- docker compose restart db backend, then GET browser-created case: title and ID preserved.
- Browser viewport 390x844: no horizontal overflow; screenshot visually inspected. Error text, labels, controls and disclaimer readable.
- uv run --project backend python scripts/deploy.py --model gemini-3.5-flash-lite --model-location eu: correctly stops with "Billing is disabled" before cloud provisioning.

### External blocker

GCP billingEnabled remains false. User was asked to link a billing account. No Cloud SQL, Cloud Run deployment or live Gemini success is claimed. Once billing is enabled, run deploy.py, resolve any actual IAM/quota issues, run live harness and deployed smoke/browser checks, record URLs/revisions, then complete cloud tasks.

GitHub remote is the user-supplied existing PUBLIC NKolosov097/eximion repository. Active gh account switched to NKolosov097 before repository writes. No new public repository created.

## Published checkpoint

- Repository: https://github.com/NKolosov097/eximion/tree/nkolosov/eximion
- Verified implementation commit: fe2aea167ae2e8f0d637eb81e4d9616286c9fdfd.
- GitHub Actions successful: https://github.com/NKolosov097/eximion/actions/runs/37727499581 (all checks, both Docker builds; 1m33s).
- Final docker compose up -d --wait passed with an explicit healthy backend readiness probe. Final smoke passed, case 5152e291-c5f8-4146-8d93-81b10c7554ae.
- Git working tree matched the remote after implementation push. No secret files tracked; only .env.example.
- Non-failing upstream CI notices: older action majors are run under Node 24 by GitHub; ubuntu-latest scheduled migration notice. Application runtime remains pinned Node24.19.0/Python3.12.13.
- Browser desktop 1440px and mobile 390px layouts visually inspected; no horizontal overflow.
- Latest billing check: billingAccountName empty, billingEnabled false. Cloud deployment remains incomplete.

## Resume after billing activation

1. Verify gcloud billing projects describe eximion-511003 shows billingEnabled true.
2. Run uv run --project backend python scripts/deploy.py --model gemini-3.5-flash-lite --model-location eu. All resources target this project only.
3. Diagnose actual IAM/quota/build errors if any; do not silently substitute architecture or model.
4. Run live extraction harness with authorized ADC/service identity; save report separately from offline-report.json.
5. Load the private author key without printing it, run scripts/smoke.py against the deployed backend with --live, and exercise the deployed browser workflow.
6. Record URLs, Cloud Run revisions, live evaluation results, persistence and remaining limitations; update plan and push verified changes.

Local services are left running at http://localhost:3000 and http://localhost:8000. Stop with docker compose stop when desired; do not remove the database volume unless its data is intentionally disposable.

## Billing activation and live model checkpoint

Billing now enabled, confirmed by gcloud on 2026-10-07 (local date). Provisioning started with scripts/deploy.py; Artifact Registry and backend service identity created, Cloud SQL creation in progress.

Live Gemini harness executed using a short-lived token obtained from the existing gcloud login, held only in memory and supplied as ADC for this run. No credential file or token was committed. Five real gemini-3.5-flash-lite requests against eu: schema validity 1.0, age accuracy 1.0, symptom precision/recall 1.0, diagnosis leak count 0. See backend/eval/live-report.json. This tiny synthetic set is a regression check, not medical accuracy evidence. Runtime service-identity extraction and deployed browser verification still pending.

Responsive CSS commit a089464 passed GitHub CI: https://github.com/NKolosov097/eximion/actions/runs/37734974220.


## Completed cloud verification (2026-10-08 UTC)

All earlier billing/deployment blockers above are resolved. No remaining implementation or deployment task is pending.

- Cloud SQL eximion-db: POSTGRES_17, db-f1-micro, europe-west3-c, RUNNABLE. Creation took roughly 12 minutes. Persistent database, normalized migrations and demo seed are active.
- Backend image build 384d37b1-82b6-4d12-9dca-3a7ec442fb19: SUCCESS. Frontend image build c554f39d-3d38-46a9-8501-5d0f11d927dd: SUCCESS. Application image source revision a089464.
- Migration job execution eximion-migrate-zc94t: successful.
- Frontend: https://eximion-frontend-497115726994.europe-west3.run.app ; ready revision eximion-frontend-00001-9tn.
- Backend: https://eximion-backend-497115726994.europe-west3.run.app ; ready revision eximion-backend-00003-bhr.
- Both services use separate dedicated runtime identities and route 100% traffic to their ready revisions. Runtime database/author credentials are Secret Manager references.
- uv run --project backend python scripts/smoke.py https://eximion-backend-497115726994.europe-west3.run.app --live with AUTHOR_API_KEY loaded privately: passed. Real extraction, create/get, correct/incorrect attempts, invalid author rejection. Case 93cb8ced-8e78-42fc-a333-e4dfbb3345a5 remained accessible after another backend revision.
- Cloud Run live evaluation: 5 cases, schema/age/precision 1.0, macro recall 0.9333, zero listed diagnosis leaks. Report backend/eval/live-report.json. Runtime identity (not developer ADC) made these model requests. Small synthetic regression set only.
- node .local/cloud-browser-check.cjs: passed against both actual frontend URL aliases. Real extraction of source containing a final diagnosis, independently entered reference, manual title edit, review, save, correct/incorrect attempts, reload, hidden-answer response check and 390px screenshot. No page errors or horizontal overflow. Report docs/cloud-browser-check.json.
- Explicit CORS preflight validated both Google-provided frontend URL aliases. Corrected deploy.py to obtain those URLs from Cloud Run metadata and pass a structured flags-file; Windows cmd otherwise stripped a custom separator. Final update succeeded without altering credentials.
- uv run --project backend python -m unittest discover -s scripts -p "test_*.py" -v: 3 passed after deployment-script correction.

### Remaining limits

Educational demo only; synthetic data and author review required. Exact grading and small alias-based evaluation are intentionally limited. Public answer submissions are not protected by a full multi-user abuse-control system. Cloud SQL has ongoing charges while provisioned; Cloud Run limits are not a hard budget cap. No cloud resources are deleted automatically.
