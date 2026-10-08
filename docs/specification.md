# Clinical Cases - Test Assignment for Eximion: Specification

Build an English-language educational clinical-case application using synthetic data only. This is not a medical diagnostic system.

## User journeys
1. Home links to authoring and a seeded demonstration case.
2. At /clinical-cases/new, paste clinical text, extract an editable structured draft, review and correct every field, supply an independent reference diagnosis and accepted alternatives, then save and navigate to the case.
3. At /clinical-cases, browse saved cases newest first, open a case, and navigate pages. The header and All cases links lead here; the brand still leads home. Empty and unavailable states are explicit.
4. At /clinical-cases/[id], server-render the public case, accept a diagnosis interactively, persist the attempt and show deterministic scoring and clear feedback.

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

## Site navigation and browser regression checks
- Header exposes Home, Cases, Create case and API Docs; Docs opens in a new tab with a visible external-link icon and accessible notice.
- Footer credits Nikita Kolosov with a link to https://github.com/NKolosov097.
- Browser tests cover navigation and author/learner flows; repeatable screenshot comparisons cover desktop/mobile pages with stable synthetic data. Deploy frontend and backend after validation.

- While the case catalog is loading, show three placeholder cards matching its layout, with a screen-reader status and reduced-motion support; replace them with the fetched results.

## Authoring and regression polish
- Confirm before replacing an extracted draft; cancellation sends no request. Keep independently entered answers, reset review after successful replacement, and visibly ask the author to recheck those answers. Failed extraction preserves the existing draft.
- Explain Correct diagnosis and Other accepted names with Influenza / Flu examples and how grading uses these hidden fields.
- Warn before abandoning unsaved clinical content through application links or reload/close; support cancellable browser history navigation where available. Do not persist clinical text or author keys. Empty forms, new-tab Docs, hash links and successful saves do not prompt.
- Mark exactly one active header section with aria-current: Home, Cases (including details), or Create a case.
- Render the real case title in tab metadata, sharing the request-scoped case loader with the page.
- Compare eight desktop/mobile screenshots in CI using a pinned Linux/Chromium image and locally served fonts. Commit reviewed baselines; upload actual/diff artifacts on failures. Never update baselines in CI.
