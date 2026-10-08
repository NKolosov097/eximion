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
