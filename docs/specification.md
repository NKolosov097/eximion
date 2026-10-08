# Eximion specification

Build an English-language educational clinical-case application using synthetic data only. This is not a medical diagnostic system.

## User journeys
1. Home links to authoring and a seeded demonstration case.
2. At /clinical-cases/new, paste clinical text, extract an editable structured draft, review and correct every field, supply an independent reference diagnosis and accepted alternatives, then save and navigate to the case.
3. At /clinical-cases/[id], server-render the public case, accept a diagnosis interactively, persist the attempt and show deterministic scoring and clear feedback.

## Invariants
- The author supplies the reference. The LLM never supplies grading answers.
- Raw input is extraction-only. Public case responses never contain reference diagnoses or accepted answers.
- Author review is mandatory because source text may reveal a diagnosis and model extraction can be wrong.
- Validation and errors preserve user input. No real patient information, uploads, OCR, queues, provider framework or speculative features.
- API types originate in Pydantic, are exported through OpenAPI and generated into TypeScript reproducibly.
- PostgreSQL persistence uses normalized tables and Alembic migrations.
- Local Docker Compose includes both applications and PostgreSQL.
- Cloud deployment targets Cloud Run, Cloud SQL PostgreSQL and Gemini on Vertex AI; completion requires real deployed smoke tests, not only deployment instructions.

## Acceptance
Verify extraction validation/failures, author editing/save, server rendering, exact normalized grading, hidden answers, persistence across restart, migrations, generated-type drift, frontend build and browser interactions. Evaluate synthetic extraction examples with a reproducible harness that distinguishes live model results from offline tests. Record commands, outcomes and remaining limitations in docs/progress.md.
