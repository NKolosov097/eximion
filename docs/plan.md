# Implementation plan and tasks

Single modular FastAPI application, SQLAlchemy/Alembic PostgreSQL, Next.js App Router/TypeScript and Google Gen AI SDK. Use Python 3.12, Node 24, PostgreSQL 17; resolve supported packages and commit lockfiles. No extra framework for state, UI or API SDK.

## Ownership
Backend: backend/** except app/llm.py, tests/test_llm.py, eval/**. Owns schemas and dependency lock; accommodates google-genai dependency.
Frontend: frontend/** except generated API file produced by coordinator command.
LLM: backend/app/llm.py, backend/tests/test_llm.py, backend/eval/**, docs/llm.md.
Integration: root files, scripts/**, .github/**, docs/** except llm.md, generated contract; sole Git commit owner.
Contract changes require explicit coordination before implementation.

## Tasks
- [x] Inspect workspace/rules and record initial state.
- [x] Save specification and concrete API/LLM contract; check consistency.
- [x] Backend models, migration, API, grading, seed, PostgreSQL integration tests.
- [x] Frontend authoring, server-rendered case, attempts, accessible states and interaction tests.
- [x] Gemini extraction, validation/error handling, synthetic harness and offline tests.
- [x] Pin dependencies, generate OpenAPI and TypeScript with one command and drift gate.
- [x] Compose, Dockerfiles, CI, environment examples and runbook.
- [x] Run tests, migrations, builds, Compose smoke and browser journey; fix integration defects.
- [ ] GCP Frankfurt resources, billing/IAM check, Secret Manager, build/deploy, migration/seed jobs.
- [ ] Live Gemini harness and deployed end-to-end checks; record actual URLs and revisions.
- [ ] Final review against specification, limitations and small verified commits/push.

## Cloud decisions
Project eximion-511003, applications/SQL/registry in europe-west3 (Frankfurt), Gemini regional availability verified before selecting model/location. Separate backend identity with Vertex AI User, Cloud SQL Client and secret access. Public case endpoints; author key guards creation/extraction. Secret Manager stores database URL and author key. Cloud Run max instances bounded, small DB connection pool; no secret in build arguments or client bundle. Cloud SQL incurs ongoing cost while provisioned. GitHub remote https://github.com/NKolosov097/eximion.git; do not create a repository.

## Verification strategy
Tests after implementation, without mandatory test-first. Backend integration uses real PostgreSQL, not SQLite. Frontend meaningful form/failure tests and production build. Browser full journey and responsive inspection. Contract regeneration must give no diff. Cloud success requires live calls, persisted data and actual revisions; pending access never counts as success.
