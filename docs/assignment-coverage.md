# Independent assignment coverage

An independent Astra reviewer compared the original three-part employer request with implementation, tests and recorded deployment evidence on 2026-10-08. Every explicit requirement is covered; this is an acceptance-scope conclusion, not a promise of defect-free code.

| Requested capability | Evidence |
| --- | --- |
| FastAPI JSON case input and PostgreSQL persistence | backend/app/main.py, schemas.py, database.py; test_api.py |
| Normalized schema and Alembic migrations | Four related tables in models.py; migrations/versions; test_migrations.py |
| Answer-scoring endpoint | POST attempts, cases.normalize_diagnosis; persisted correct/incorrect attempts tested |
| Next.js TypeScript App Router and Server Components | src/app/clinical-cases/[id]/page.tsx |
| Interactive diagnosis submission and score | components/attempt-form.tsx; forms.test.tsx |
| Shared API/frontend types | Pydantic to OpenAPI to generated TypeScript; CI rejects drift |
| LLM text-to-schema extraction | Real Gemini SDK schema call plus independent Pydantic validation in llm.py |
| Small extraction evaluation harness | backend/eval; five synthetic fixtures and separate live report |
| Docker and Cloud Run deployment description | Both Dockerfiles, compose.yaml, docs/deployment.md, scripts/deploy.py |

Author/learner roles, human review, manual reference/variants, one diagnosis, exact-match 0/100 scoring, English UI and synthetic-only scope are implementation choices. The provided request does not contain an external JSON schema or rubric; matching an unprovided schema cannot be verified.

Actual cloud deployment, browser smoke tests and correlated trace readback exceed the requested deployment description. The live five-case evaluation reports schema validity/age accuracy/symptom precision 1.0 and recall 0.9333; this small regression benchmark does not establish general clinical accuracy.

Optional follow-ups: compare an external rubric if supplied; expand fixtures when changing the model or prompt. Accounts, full CRUD, learner history, semantic scoring, queues and production HA are not assignment requirements. Browser-smoke setup is documented in e2e-selectors.md.
