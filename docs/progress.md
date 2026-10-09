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


## Observability and E2E selector checkpoint (2026-10-08 UTC)

User requested stable E2E selectors and tracing/logging across backend layers. Specification and tasks: observability-plan.md.

- 45 stable frontend data-testid attributes; selector contract in e2e-selectors.md. Frontend13 tests, typecheck and production build passed.
- Backend OpenTelemetry SDK/OTLP exporter1.45.1, grpcio1.84.0, google-auth2.61.0 pinned and locked.54 tests passed against real PostgreSQL;11 focused observability tests passed after expected4xx severity correction.
- Independent review fixed cancellation handling, safe SDK auth-error logging and CORS on unexpected500. Logs exclude bodies, keys, diagnoses, SQL and raw exception text.
- API regeneration: uv run --project backend python scripts/generate-contract.py; no diff in OpenAPI/generated TS.
- Deployment safety: uv run --project backend python -m unittest discover -s scripts -p "test_*.py" -v;3 passed, existing trace bucket preserved.
- Local production Docker images rebuilt; mobile browser demo/grading/author401 check passed through stable selectors. Correlated X-Trace-ID/CORS and structured container logs verified.
- Regional _Trace bucket initialized in europe-west3. Linked BigQuery dataset eximion_trace created for supported programmatic readback of OTLP spans (no trace copy). Trace API legacy read methods do not support OTLP-ingested spans.
- Frontend Cloud Build7b0a4374-c4e8-4df5-befb-965db2b18d8c passed; frontend revision eximion-frontend-00002-n69 serves selector implementation629f47b.
- Backend final image build c22090ce-c7ab-49be-9e7e-a0c53bd5042f in progress for ca033cf; cloud export/browser/span readback still pending at this checkpoint.
- Current remote implementation commits pushed through ca033cf; CI run37745048339 in progress.


### Observability acceptance completed

- Final backend Cloud Build c22090ce-c7ab-49be-9e7e-a0c53bd5042f: SUCCESS. Runtime revision eximion-backend-00004-qgz uses ca033cf, TRACE_EXPORT_ENABLED=true, CLOUD_REGION=europe-west3. Existing DB/secrets/CORS retained.
- GitHub CI37745048339: SUCCESS (54 backend tests,13 frontend tests,3 deployment tests, generated contract drift check, typecheck, production and Docker builds).
- node scripts/browser-smoke.cjs: PASS against canonical cloud frontend. Real Gemini extraction, independent reference/edit/review/save, correct/incorrect answers, reload, hidden-answer checks,390px layout. Stable selectors used; zero page errors. docs/cloud-browser-check.json contains5 request trace IDs.
- uv run --project backend python scripts/verify_cloud_traces.py: PASS. Read42 actual stored OTLP spans through linked BigQuery dataset; all42 have matching Cloud Logging entries; expected layers and parent IDs verified; known clinical/key/SQL markers absent. Report docs/cloud-trace-check.json. First read was empty due ingestion delay; retry succeeded. Query reported0 processed bytes.
- Cloud401/422/404 probes: expected status, supplied W3C trace ID preserved, public frontend CORS readable. Report docs/cloud-error-check.json. Expected client errors are WARNING, internal failures ERROR.
- Local Docker backend/frontend updated; mobile selector workflow and log correlation passed.
- No implementation task remains. Limits: all-request sampling for the demonstration; no browser analytics or alerts; bounded best-effort export can add up to1.5s to response completion and lose spans during outages/crashes. Current JSON-response middleware does not support future streaming endpoints without changes.

### Audit remediation in progress (2026-10-08)

- Saved docs/remediation-plan.md before edits. Independent Astra assignment review confirms all explicit requirements; implementation assumptions are now gathered in README and docs/assignment-coverage.md.
- Fixed CORS preservation on backend redeployment, with a frontend-build-failure regression; all4 deploy tests pass.
- Split CI into typechecks, unit-tests, integration-tests, api-contract, builds and aggregate verify. Backend pinned mypy checks app bodies with Pydantic plugin; integration selection cannot silently skip missing PostgreSQL.
- Frontend28 tests, typecheck, production build and isolated Chrome checks pass. Retry refetches after503; keyboard focus/errors, Unicode boundaries, reduced motion and320/390/768/1440 widths verified. docs/frontend-check.json records the synthetic-API browser result; no manual screen-reader test.
- Independent Astra frontend and delivery/LLM/CI reviews found no actionable regressions. Backend reviewer found SDK-internal flush draining still delayed requests; corrected root-span acknowledgment implementation and real-processor regression are under final recheck.
- Local frontend Docker rebuild/mobile demo/answer/auth checks passed. Cloud frontend build0e2af68d-d02d-4ad6-8fe1-e6a7442e7f0a succeeded; revision eximion-frontend-00003-9sv serves9b33fe2.
- User warning URL and supplied bundle identify MetaMask extension code. Clean Chrome12-page navigation check produced no listener warning/page exception; unrelated favicon404 recorded honestly. No browser extension modified; no warning suppression added.

### Independent final reviews

All three post-fix Astra reviews are complete. Frontend and deployment/CI/LLM/contract reviews report no actionable findings. Backend reviewer reproduced an SDK-internal flush issue, supplied a refined specification, and re-reviewed the corrected implementation: no remaining actionable findings. Independently reran55 unit tests and mypy9 appfiles; implementer final real-PostgreSQL suite67/67. Export regression uses the actual processor, with timeout/cancel/failure/shutdown cleanup checks. No generation-future fallback remains.

Current implementation: frontend9b33fe2; backendee46085. Final local/cloud/API/trace and hosted CI acceptance are pending below.

### Remediation acceptance (2026-10-08)

- Backend67 tests (55 unit,12 PostgreSQL integration), frontend28 tests, deployment4 tests, mypy and TypeScript checks pass. Generated contract verified by independent delivery reviewer. Production builds and both local Docker rebuilds pass.
- Local backend smoke passes after startup: ready/create/read/correct+incorrect attempts/author401. Local frontend mobile workflow passes. Initial immediate post-restart probe hit startup before readiness; retry after startup passed.
- Backend Cloud Build be49c70f-6f89-40cf-91b9-36801b05d765 succeeded; revision eximion-backend-00005-d5s serves ee46085. Frontend eximion-frontend-00003-9sv serves9b33fe2. Existing secrets/database/CORS retained; no schema migration required.
- Real cloud browser smoke passes extraction/review/save/grading/reload/hidden-answer/mobile checks, zero page errors. New synthetic case1e155239-5326-430f-9f92-22588b8a25d3. Stored trace readback:42 spans and42 correlated logs, correct parentage/layers and no known sensitive markers.
- New cloud validation probes: NUL attempt, NUL case and short extraction source all422, CORS and W3C trace IDs preserved. Six request.validate logs are422 WARNING; Cloud Logging promotes severity to its top-level field. Evidence cloud-validation-check.json.
- All six original findings fixed and three independent Astra post-fix reviewers now report no actionable findings. Assignment scope review is separate and complete.
- Publication remains pending: automatic approval review twice rejected git push to the public NKolosov097/eximion remote, citing absence of explicit destination/payload authorization in its available user context. Additional scan checked6 outgoing commits/532 snapshots without private paths or known credentials. An explicit user approval request is pending. No push occurred, so hosted split CI has not run yet; equivalent checks passed locally. Current code and reports are committed locally.
- Limits: manual screen-reader testing and the exact listener-registration cause inside the user's MetaMask profile were not checked. Existing upstream Starlette/httpx deprecation and favicon404 are unrelated. Telemetry is bounded best effort; this is a synthetic educational demonstration.


### Case catalog (2026-10-08)

- Added public bounded GET listing (page/page_size, items/has_more), ordered by created_at DESC then id DESC, using the existing answer-free public schema. No database migration.
- Added uncached SSR /clinical-cases catalog, case links, previous/next navigation, empty and unavailable states, and visible All cases header navigation. Existing back-link selectors remain stable and now lead to the catalog.
- Regenerated OpenAPI and frontend types. Backend: 74 tests passed against real PostgreSQL in isolated test schemas; mypy passed for 9 application files. Frontend: 37 tests, TypeScript and production build passed.
- Isolated production-browser smoke passed catalog/detail navigation, pagination, empty/error/retry states, and no horizontal overflow at 320/390/768/1440px, alongside existing authoring/answer checks. The browser uses a synthetic mock API; PostgreSQL behavior is covered separately by integration tests.
- Not committed, pushed or deployed in this implementation step. Existing upstream Starlette/httpx deprecation remains. Offset pages can shift when another author adds a case between page requests; the catalog is not a snapshot.

### Navigation and browser regressions (2026-10-08)

- Header: Home, Cases, Create case and Docs; Docs has a visible external-link icon and opens in a new tab with noopener/noreferrer. Footer links to Nikita Kolosov on GitHub.
- Full local backend suite: 74 passed on isolated PostgreSQL test schemas; mypy: 9 files; deployment script tests: 4 passed. Frontend: 37 tests, typecheck and production build passed. Contract regeneration is stable.
- Extended isolated E2E passed navigation, Docs popup, GitHub target, answer validation/100/0/error recovery, review gating/reset, catalog/retry/pagination and widths 320/390/768/1440.
- Eight Windows/Chrome screenshot baselines cover home/catalog/case/author at desktop and mobile sizes; all reviewed and clean comparison passed. A controlled one-pixel baseline change failed comparison and generated diff output; restored baseline passed again.
- Playwright 1.64.0 is pinned as a frontend dev dependency. E2E is included in CI with bundled Chromium. Screenshot comparisons are local Windows/Chrome checks; synthetic API fixtures avoid production writes and Gemini calls.
- Cloud publication/verification follows this source commit.

### Catalog/navigation release verified (2026-10-08)

- Source 6e59142 pushed; all seven GitHub checks passed, including Linux Chromium E2E: https://github.com/NKolosov097/eximion/actions/runs/37793035290 .
- Backend Cloud Build b0019517-e525-4c61-ba3f-91c0722647ff and frontend e2bc307a-2c38-45e7-ac4f-6701f1ac68ca succeeded. Ready revisions: eximion-backend-00006-9jf and eximion-frontend-00005-4lg, both serving 100% traffic. Only service images updated; database/secrets/CORS preserved.
- Live readiness/list API passed with answer fields excluded. Real browser verified Home/Cases/Create navigation, seven listed saved cases, case/detail/back links, Swagger opening in a separate tab with no opener, GitHub target and widths 320/390/768/1440 without overflow or page errors. See navigation-live-check.json.
- No production data was written during this release verification. Gemini extraction was not rerun for navigation-only changes; its earlier live acceptance remains recorded separately. Screenshot comparisons remain Windows/Chrome-specific.

### Catalog skeleton release (2026-10-08)

- Source 0948007 adds three catalog skeleton cards with screen-reader status and reduced-motion support. Delayed-API browser checks prove placeholder-to-content replacement and no mobile overflow. Typecheck/build, E2E and all eight unchanged screenshot comparisons passed.
- All seven CI jobs passed: https://github.com/NKolosov097/eximion/actions/runs/37795484030 . Frontend build 5cecc731-6dd7-4958-b80f-1fc6528f4803 succeeded; ready revision eximion-frontend-00006-c4p serves all traffic. Backend unchanged.
- Live mobile browser verified streamed skeleton HTML, replacement by seven real cases, no overflow and no page errors.

### Favicon release (2026-10-08)

- Source d938a02 adds a small vector C icon in the application colors. Production build and isolated browser checks passed, including the emitted icon link and HTTP 200 SVG response. All CI checks passed: https://github.com/NKolosov097/eximion/actions/runs/37797574800 .
- Frontend build e04b448e-d9fc-4550-8287-0d8b19eb6f47 succeeded; revision eximion-frontend-00007-5f2 serves 100% traffic. Live browser confirmed the favicon link and served SVG. Backend unchanged.

## Approved usability polish (2026-10-08)
- Protected re-extraction with cancellation, preserved independent answers and failed-extraction edits, and required renewed review after replacement. Clarified hidden correct-answer fields with Influenza / Flu examples.
- Added in-memory unsaved-content guards for application links and reload/close, plus cancellable Navigation API history traversals. Docs/new tabs, hash navigation, key-only forms and successful saves are exempt; legacy browser Back limitation is documented.
- Added exact active header links with aria-current and real case tab titles; production browser assertions confirm a single case API request for metadata and page.
- Served the existing licensed fonts locally, pinned the Linux/amd64 Playwright image by digest, and added a CI screenshot job with actual/diff artifact uploads. Replaced Windows-specific baselines.
- Frontend: 39 unit tests, typecheck, production build and expanded E2E passed. Manual Cloud Build 75fb49dc-dc6b-4b31-97a7-91cc8df10e93 generated all eight Linux screenshots and passed a second exact comparison. Local Docker registry download was slow, so the same pinned container ran in Cloud Build.
- Reviewed all eight Linux images. Source commit 57caae4 passed every job in GitHub Actions run 37803164578, including screenshot-tests; screenshot-results artifact uploaded successfully.
- Frontend build 473e9afa-ddab-4978-8215-6554807df0cf succeeded. Revision eximion-frontend-00008-jdd serves 100% of traffic using image 57caae4.
- Live verification passed: real case title, active links, unsaved leave cancellation, replacement cancellation/answer preservation/review reset, locally served fonts returning 200, and 390px layout without overflow or JavaScript errors. Extraction was mocked for this UI check; no Gemini calls or database writes. Backend and migrations were unchanged.

## Catalog search and extraction feedback (2026-10-08)
- Added public title/vignette search across the full catalog before pagination, using escaped case-insensitive literal matching. Query length/NUL validation and tests prevent hidden-answer search and wildcard expansion. Regenerated OpenAPI and TypeScript contract.
- Added a query-preserving search form, Enter submission, Clear search and distinct no-result state. Review checkbox/label use pointer when enabled and not-allowed while disabled. The extraction button shows a rotating indicator with aria-busy and the existing status; reduced motion disables rotation.
- Verified 77 backend tests against PostgreSQL, mypy, 43 frontend tests, TypeScript and production builds. Reviewed the changed desktop/mobile catalog and author screenshots; all eight comparisons passed in the pinned Linux container.
- Expanded E2E passed: search/Enter/page reset/query-preserving pagination/no-match/clear, delayed extraction animation, reduced motion, pending controls and checkbox cursors. Source d6ba31f passed all eight CI jobs in run 37806194020.
- Backend build 832a0932-3c38-4d3c-b866-51e411941ee7 and frontend build d391aec2-1e68-47ee-806f-821a5e5a9edd succeeded. Revisions eximion-backend-00007-nnd and eximion-frontend-00009-z2j each serve 100% traffic. No migration was needed.
- Live checks passed for actual catalog filtering, no-match and clear, mobile overflow, pending animation, reduced motion and checkbox pointer, without JavaScript errors. Extraction was mocked to hold the loading state; no Gemini calls or production database writes.

## Minimal private analytics - local verification

Added a fail-closed author-key aggregate API and `/analytics` dashboard with 7/30/90-day UTC windows, three metrics, empty/error/loading states, and memory-only credentials. Counts use existing records; no database migration or dependency was added.

Validation: 80 backend tests passed against dedicated PostgreSQL test schemas; mypy clean; 45 frontend tests, TypeScript, production build and browser E2E passed. Reviewed all ten Linux/Chromium desktop/mobile screenshots and passed exact comparison. The initial catalog capture differed from two identical later renders by 19 border pixels (one color level); the reviewed reproducible capture is the baseline. Contract files regenerated. Independent auth/privacy/window review found no remaining defects. Cloud rollout and authenticated live verification are pending.

## Minimal private analytics - deployed verification

Source `2eb1a04` passed all eight jobs in GitHub Actions run `37815808268`. Backend build `2f8c0465-b20f-48d4-9160-9e7b90d08511` and frontend build `4e59bc8c-2eaf-40d6-ad09-2a9ddfea335b` succeeded. Cloud Run revisions `eximion-backend-00008-njt` and `eximion-frontend-00010-k8s` each serve 100% of traffic. No migration was needed.

Live read-only verification at 2026-10-08T17:25:37.914Z passed: missing/invalid author key rejected, all three periods accepted, invalid period rejected, aggregate response whitelist and percentage calculations correct, Cache-Control no-store, browser initial/loaded/error/period-change states, key cleared on reload, empty local/session storage, and no horizontal overflow at widths 320/390/768/1440. No browser errors, production writes or Gemini calls were made during this verification. The Analytics header link is live. Metrics count attempts, not unique learners.


## Accounts, ownership and richer answers - local verification

Added username/password sessions, private profile/history/points, owned-case editing before any answer and archival with preserved history. Guest creation/answers require explicit consent; in-place sign-in preserves form fields and removes the guest checkbox without submitting. Unknown usernames and incorrect passwords share the same error. Public case reads still hide the answer key; successful answers reveal accepted diagnoses, and only accepted alternative matches are highlighted. The primary diagnosis remains the sole source of the 0/100 score.

Catalog search supports personal answered/unanswered filters and latest scores. Shared page widths remove horizontal shifts; the seeded case has a Demo badge. Smoke case titles now use readable text instead of timestamps. Existing cloud title repairs are pending deployment.

Validation: 92 backend tests passed against PostgreSQL, including old-row migration preservation, two-user isolation and concurrent answer/edit locking. The final short-password login change passed the 12 account tests. Mypy, 65 frontend tests, TypeScript, production builds and browser flows passed. Reviewed all fourteen Linux/Chromium desktop/mobile screenshots and passed exact comparison. Auth/session/privacy review has no outstanding blocking findings. Deployment and real account-flow verification remain pending.

Analytics latency audit found scale-from-zero startup dominates the initial delay (about 6.8 seconds). Warm application work was 17-21 ms, with SQL at 7-8 ms. No paid minimum-instance setting or speculative database optimization was introduced; measurements and limitations are in analytics-latency.md.


Release CI passed all functional checks but exposed 19 one-level RGB differences at the desktop search input's rounded border between Azure and WSL hosts. The reviewed actual image has identical layout/text; all other thirteen images matched. The comparator now tolerates at most one RGB level per channel, while dimensions and alpha remain exact. Self-checks reject a two-level RGB change in any channel, a one-level alpha change and dimension changes. The downloaded CI artifact and a deliberately changed pixel exercise the actual comparator. Baselines were not replaced to hide this difference.


## Accounts - deployed verification

Application source 58f102f and screenshot follow-up 2fdf401 passed all eight CI jobs in run 37880935030. Backend build 3b4c0d09-af07-4d26-8fbd-ccb6cd5ce92e and frontend build 76a4ec7b-8647-4ae8-8c64-978ac5e3331e succeeded. Revisions eximion-backend-00009-8q5 and eximion-frontend-00011-jsp serve all traffic. Migration execution eximion-migrate-5x6mh succeeded; a separate guarded repair (eximion-migrate-jlghs) changed only the four known smoke titles to "Sudden fever, dry cough and fatigue", verified individually through the API.

Real account verification at 2026-10-09T03:50:03.740Z passed: two-user isolation, generic invalid credentials including short passwords, HttpOnly/Secure/SameSite cookies, owned-case create/edit, key hidden from public reads, required guest consent, primary-only scoring with accepted alternatives, private history and filters, modal draft preservation without automatic submission, latest-score UI, archive/history and logout. It created two synthetic accounts and one synthetic case; that case was archived after the check. No Gemini request was made. A username/password recovery feature remains intentionally absent.

## Catalog and account refinements - local verification

Removed the Search button in favor of a 300ms debounce; Enter and answer-filter changes submit immediately. Browser checks verify focus/caret, continued typing, history, clearing and query preservation. Removed the ungraded reasoning input while retaining stored history. Refined modal/profile controls and Demo spacing; added two insert-only synthetic demo seeds, preserving the original home link. PostgreSQL seed preservation/idempotence and mypy passed. All 73 frontend tests, typecheck, production build, full browser harness, real local checks and sixteen reviewed Linux screenshot comparisons passed.


## Catalog and account refinements - deployed verification

Application source abb89e5 and browser-test follow-up 26fdecd passed all eight CI jobs in run 37882864064. The browser test now waits for rendered pagination reflecting the query instead of requestfinished on a streaming response; focus/caret and API assertions remain intact. Backend build 59427b58-00e8-4200-be30-220b52335305 and frontend build 8117c847-a260-4b07-8b40-dfe0a6b53a5b succeeded. Seed execution eximion-migrate-mcmdd added the two missing synthetic demos. Revisions eximion-backend-00010-6lq and eximion-frontend-00012-2p7 serve all traffic.

Live verification at 2026-10-09T04:14:48.365Z passed: all three public seeds, original home demo link, no reasoning input, full-width modal controls, username/icon navigation, red right-aligned logout, equal catalog controls, automatic search with retained focus, immediate answer filtering with query preservation, mobile widths and logout. One synthetic test account was created; no clinical record was written and Gemini was not called.

## Profile spacing and navigation correction

Added a 24px gap above the guest profile panel and removed the signed-in navigation icon, retaining the username and accessible profile label. Focused unit tests, TypeScript, production build and sixteen reviewed screenshot comparisons passed. All eight CI jobs passed in run 37897010173. Frontend source 675a877 was built as b6dfadd1-a4f6-4e58-b511-44a5f126a73f and deployed to eximion-frontend-00013-hg5. Live checks at 2026-10-09T07:07:42.685Z verified the real guest layout on desktop/mobile and username-only navigation with a mocked session response, without any database writes or Gemini calls.
