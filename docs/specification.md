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

## Catalog search and author feedback
- Optional q (up to 200 characters, no NUL) searches public titles and vignettes across all cases by a trimmed, case-insensitive literal substring. Empty q lists all; percent/underscore remain literal. Hidden answers never influence results. Filter before stable pagination.
- All cases has a labelled search form and clear action. Search submits to page 1, URL retains q, pagination preserves it, and no-match results are distinct from an empty catalog.
- Review checkbox and label show pointer when enabled, not-allowed when disabled.
- Extract case displays an animated generation indicator while the request is pending, retaining disabled controls and accessible status. No layout shift; reduced-motion preference disables motion.

## Minimal private analytics
- /analytics is an English-language author-only dashboard linked from the header. Public shell contains no metrics until a valid author key is submitted. Reuse X-Author-Key and the existing server-side key comparison; fail closed with 503 if AUTHOR_API_KEY is unset. Never persist/embed the key, put it in a URL, or collect browser events.
- GET /api/v1/analytics?days=30 accepts only 7, 30 or 90 (default 30). Capture end=utc_now once; start=end-days; count records with created_at >= start and < end in UTC. Cases and attempts are counted by their own creation times, including attempts on older cases.
- Response AnalyticsSummary: days, start_at, end_at, case_count, attempt_count, correct_attempt_count, correct_percentage (0..100 rounded to one decimal, null for no attempts). Return aggregate numbers only, no cases/titles/diagnoses/keys/identifiers. Cache-Control: no-store on success; client fetch cache no-store.
- Show three cards: Cases created, Attempts submitted, Correct answers (%). Explain rolling UTC period and that repeated submissions count as separate attempts. Selector: Last 7/30/90 days; password field and Load analytics button. Show a dash and No attempts yet when rate is null. Initial state invites key entry.
- Keep key only in component memory; clear displayed results when key/period changes, before requests and after failures. Disable controls while loading, show accessible pending/error states and three card skeletons respecting reduced motion. No new dependencies, migration, charts, account system or third-party analytics.
- Verify protected/missing-key/misconfigured access, empty results, period/boundary/future records, correct percentage, older-case attempts, response whitelist and validation with real PostgreSQL. Verify UI states/navigation, responsive layout, browser flow and desktop/mobile screenshots.
