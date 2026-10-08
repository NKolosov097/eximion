# Clinical Cases - Test Assignment for Eximion

A small educational clinical-case application: FastAPI, PostgreSQL, Next.js/TypeScript, and Gemini structured extraction. **Synthetic data only. Not a medical diagnostic system.**

## Live application

Open https://eximion-frontend-497115726994.europe-west3.run.app . API documentation: https://eximion-backend-497115726994.europe-west3.run.app/docs . The demo can be solved without an author key. Creation and Gemini extraction require the private author key stored locally in `.local/cloud-secrets.json` (`author_api_key`); never commit or share that file because it also contains database credentials.

Both applications and PostgreSQL run in Frankfurt. Gemini uses the EU endpoint. Real extraction, browser authoring, scoring, persistence and mobile layout have been verified; see [deployment metadata](docs/deployment.json) and [verification record](docs/progress.md).

## Assignment assumptions

The supplied assignment asks for a saved clinical case, answer scoring, server rendering and structured LLM extraction. The educational author/learner workflow is our interpretation. We chose one diagnosis per case, an independently entered reference with accepted variants, and deterministic exact-match scoring (0/100). No external JSON schema or scoring rubric was supplied. The author is whoever prepares and reviews the synthetic case; Influenza is the demo reference, not an LLM-generated answer. See [assignment coverage](docs/assignment-coverage.md).

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
uv run --project backend mypy --config-file backend/pyproject.toml backend/app
uv run --project backend python -m pytest backend/tests -m "not integration"
# Set TEST_DATABASE_URL to a dedicated PostgreSQL test database first.
uv run --project backend python -m pytest backend/tests
npm run typecheck --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
uv run --project backend python scripts/smoke.py http://localhost:8000
```

One command regenerates both `docs/openapi.json` and `frontend/src/lib/api.generated.ts`. CI repeats it and rejects drift. Do not manually edit API DTO types. Integration tests use real PostgreSQL and must not target application data; selecting them without TEST_DATABASE_URL fails. Unit tests do not need a database. CI has separate typechecks, unit-tests, integration-tests, api-contract, builds and browser-tests jobs, with an aggregate verify gate.

## Structure

- `backend/app`: API, persistence, deterministic grading, Gemini module.
- `backend/migrations`: Alembic schema history.
- `backend/eval`: synthetic extraction benchmark.
- `frontend/src`: server-rendered case and interactive author/answer forms.
- `scripts`: contract generation, smoke check, Cloud Run deployment.
- `docs`: specification, contract, plan, commands/results, cloud runbook and limitations.

See [deployment](docs/deployment.md), [LLM evaluation](docs/llm.md), [actual progress](docs/progress.md), and [API contract](docs/api-contract.md). Cloud success is recorded only after deployment and live verification.

Stable E2E selectors are documented in [docs/e2e-selectors.md](docs/e2e-selectors.md). Backend tracing, safe JSON logs and Cloud Trace inspection are documented in [docs/observability.md](docs/observability.md).

## Browser regression checks

Install frontend dependencies and build before running the isolated browser checks:

```sh
npm ci --prefix frontend
npm run build --prefix frontend
npm run test:e2e --prefix frontend
npm run test:screenshots --prefix frontend
```

Both suites start their own local production server with synthetic API fixtures; they do not write to the deployed database or call Gemini. Local runs use installed Google Chrome. CI installs Playwright Chromium and runs E2E with `PLAYWRIGHT_CHANNEL=chromium`.

Screenshot baselines in `scripts/screenshots/windows-chrome` cover Home, Cases, a case and the author form on desktop/mobile. They depend on Windows, Chrome and fonts; run screenshot comparisons in the recorded environment. Review intentional UI changes before updating with `npm run test:screenshots --prefix frontend -- --update-baselines`. Failed comparisons write actual/diff images under `.local/screenshot-results`. The pinned Playwright PNG decoder is used by this test harness and must be checked when upgrading Playwright.

The header links to Home, Cases, Create case and API Docs (a new tab). The footer links to the author's GitHub profile.
