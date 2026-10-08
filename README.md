# Eximion

A small educational clinical-case application: FastAPI, PostgreSQL, Next.js/TypeScript, and Gemini structured extraction. **Synthetic data only. Not a medical diagnostic system.**

## Run locally

Requirements: Docker Compose. For tests and contract generation also install uv and Node 24.

```sh
cp .env.example .env
docker compose up -d db
docker compose build
docker compose run --rm backend python -m alembic upgrade head
docker compose run --rm backend python -m app.seed
docker compose up -d
```

Open http://localhost:3000. API documentation: http://localhost:8000/docs. The development author key is `local-author-key`; set a private value in `.env` before exposing the service. PostgreSQL is bound to localhost port 55432. Migrations run explicitly, never automatically at web startup.

Gemini extraction requires workload credentials plus `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` and `GEMINI_MODEL`. The example leaves the model unset deliberately: without credentials extraction displays an honest unavailable error. For local live extraction, run backend on the host with ADC (`gcloud auth application-default login`), or mount an ADC file read-only into the backend container. Never copy credentials into a Docker image. Cloud Run obtains credentials from its service identity.

## Workflow

1. Open **Create case**, enter the author key and paste synthetic clinical text.
2. Extract, edit the structured draft, and remove any revealed diagnosis. Automatic omission is not guaranteed.
3. Supply your own reference diagnosis and allowed variants, confirm review, then save.
4. Submit a diagnosis on the saved case. Exact normalized reference/variant matches receive 100 points; other answers receive 0.

Demo case: `/clinical-cases/4613eeb7-7064-41da-bb06-62630b3eaebc`. Synthetic reference: Influenza; accepted variant: Flu. The API never sends these answers in public case or attempt responses.

## Development checks

```sh
uv sync --project backend --frozen
npm ci --prefix frontend
uv run --project backend python scripts/generate-contract.py
# Set TEST_DATABASE_URL to a dedicated PostgreSQL test database first.
uv run --project backend python -m pytest backend/tests
npm run typecheck --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
uv run --project backend python scripts/smoke.py http://localhost:8000
```

One command regenerates both `docs/openapi.json` and `frontend/src/lib/api.generated.ts`. CI repeats it and rejects drift. Do not manually edit API DTO types. Backend tests use real PostgreSQL and must not target application data.

## Structure

- `backend/app`: API, persistence, deterministic grading, Gemini module.
- `backend/migrations`: Alembic schema history.
- `backend/eval`: synthetic extraction benchmark.
- `frontend/src`: server-rendered case and interactive author/answer forms.
- `scripts`: contract generation, smoke check, Cloud Run deployment.
- `docs`: specification, contract, plan, commands/results, cloud runbook and limitations.

See [deployment](docs/deployment.md), [LLM evaluation](docs/llm.md), [actual progress](docs/progress.md), and [API contract](docs/api-contract.md). Cloud success is recorded only after deployment and live verification.
