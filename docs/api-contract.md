# API contract v1

Pydantic is authoritative. Reject unknown request fields. Trim strings before validation, reject blanks, count Unicode code points. Persisted text fields reject U+0000 with 422 before database access. JSON and English messages only. IDs are UUID; timestamps are UTC ISO 8601.

## Models
- ClinicalCaseDraft: title required string 1..120; vignette required string 1..8000; symptoms required array 1..20 of nonblank strings 1..200; age_years optional strict integer 0..120 or null, default null.
- ClinicalCaseCreate: draft fields plus reference_diagnosis required string 1..200; accepted_answers optional array default [] max 20, each string 1..200; guest_acknowledged boolean default false (must be true for guest creation).
- ClinicalCase: draft fields plus required id UUID and created_at datetime. Response age_years always present; archived boolean and latest_score 0/100/null (personal catalog metadata). No reference, accepted alternatives, normalized answers or source text.
- ClinicalCasePage: items ClinicalCase[] and has_more boolean.
- AnalyticsSummary: days integer 7, 30 or 90; start_at/end_at UTC datetimes; case_count, attempt_count and correct_attempt_count nonnegative integers; correct_percentage number 0..100 rounded to one decimal, or null when there are no attempts.
- ExtractionRequest: source_text required string 20..20000.
- ExtractionResponse: required draft ClinicalCaseDraft and warnings string[]. Always include: Review the draft for accuracy and remove any revealed diagnosis before saving.
- AttemptCreate: diagnosis required string 1..200; alternative_diagnoses optional array default [] max 5, each nonblank string 1..200; reasoning optional trimmed string default empty max 2000; all reject NUL. guest_acknowledged boolean default false must be true for a guest submission.
- AttemptResult: required id UUID, clinical_case_id UUID, score integer 0 or 100, max_score literal 100, is_correct boolean, feedback string, created_at datetime; accepted_diagnoses string[] (reference first, then accepted alternatives) and matched_alternative_diagnoses string[] (matching submitted alternatives only). The answer key is intentionally revealed only after a valid attempt is saved.

## Routes
- GET /api/v1/analytics: 200 AnalyticsSummary; days must be 7, 30 or 90 (default 30). Requires X-Author-Key; 401 missing/invalid key, 503 if AUTHOR_API_KEY is unset or the database is unavailable, 422 invalid period. Always fail closed when the server key is absent. Successful responses use Cache-Control: no-store. Count each record by its own creation timestamp in the rolling UTC interval [start_at, end_at); attempts on older cases are included. Repeated submissions count separately. Return aggregate numbers only, never clinical content, identifiers or diagnoses.
- POST /api/v1/clinical-cases/extract: ExtractionRequest -> 200 ExtractionResponse; 422 validation, 502 extraction_failed, 503 extraction_unavailable, 504 extraction_timeout.
- POST /api/v1/clinical-cases: ClinicalCaseCreate -> 201 ClinicalCase; Location /api/v1/clinical-cases/{id}; 422 validation, 503 database_unavailable.
- GET /api/v1/clinical-cases: 200 ClinicalCasePage; page integer 1..1000000 (default 1), page_size integer 1..100 (default 20), optional q string (max 200 characters, no U+0000). Trim q; empty means all cases. Case-insensitive literal substring matching on public title/vignette only, before pagination; `%` and `_` are literal, and hidden answers are excluded. Order created_at DESC, id DESC. Empty pages return items [] and has_more false; 422 invalid pagination/search, 503 database_unavailable. Public fields plus the signed-in user's latest score only. answered=all/answered/unanswered filters before pagination; the latter two require a valid session. Archived cases are excluded. Responses use no-store.
- GET /api/v1/clinical-cases/{id}: 200 ClinicalCase; 404 case_not_found, 422 malformed UUID, 503 database_unavailable.
- POST /api/v1/clinical-cases/{id}/attempts: AttemptCreate -> 201 AttemptResult; 404 case_not_found, 422 validation, 503 database_unavailable.
- GET /health: 200 {"status":"ok"}. GET /ready: verify database; 200 {"status":"ok"} or 503 database_unavailable.
- Extraction and creation require X-Author-Key when AUTHOR_API_KEY configured; constant-time comparison, 401 unauthorized. Cloud deployment must configure this key. UI accepts a password field, keeps it only in memory, never embeds it in bundles or persists it. Public GET/attempts do not need an author key. A bearer session attaches creation/attempts to the current user; absent sessions require explicit guest_acknowledged=true for writes. Invalid sessions return 401 and never silently become guest submissions.
- Shared handled error: {"error":{"code":"case_not_found","message":"Clinical case not found."}}. Never expose exception/provider/SQL/request text. FastAPI 422 detail array retained; frontend handles both shapes.

## Examples
Creation: {"title":"Fever and dry cough","vignette":"A 28-year-old presents with fever, dry cough, and fatigue for two days.","symptoms":["Fever","Dry cough","Fatigue"],"age_years":28,"reference_diagnosis":"Influenza","accepted_answers":["Flu"],"guest_acknowledged":true}
Public: {"id":"4613eeb7-7064-41da-bb06-62630b3eaebc","title":"Fever and dry cough","vignette":"A 28-year-old presents with fever, dry cough, and fatigue for two days.","symptoms":["Fever","Dry cough","Fatigue"],"age_years":28,"created_at":"2026-10-07T12:00:00Z"}
Extraction: {"draft":{"title":"Fever and dry cough","vignette":"A 28-year-old presents with fever and dry cough.","symptoms":["Fever","Dry cough"],"age_years":28},"warnings":["Review the draft for accuracy and remove any revealed diagnosis before saving."]}
Guest attempt request: {"diagnosis":"  FLU  ","alternative_diagnoses":[],"reasoning":"","guest_acknowledged":true}
Attempt response: {"id":"4460132b-686c-4395-8381-f2207f4c7854","clinical_case_id":"4613eeb7-7064-41da-bb06-62630b3eaebc","score":100,"max_score":100,"is_correct":true,"feedback":"Your diagnosis matches an accepted answer.","accepted_diagnoses":["Influenza","Flu"],"matched_alternative_diagnoses":[],"created_at":"2026-10-07T12:02:00Z"}
Incorrect feedback: Your diagnosis does not match an accepted answer.

## Grading
normalize_diagnosis: Unicode NFKC, casefold, split Unicode whitespace and join with ASCII space. Exact comparison against normalized reference and explicit alternatives. Preserve punctuation and accents. No fuzzy or LLM grading. Deduplicate normalized alternatives including reference. Persist trimmed submission and score atomically. 100 correct, 0 incorrect.

## Persistence
SQLAlchemy with PostgreSQL, explicit Alembic migration (no startup create_all).
clinical_cases: UUID PK, title, vignette, nullable age_years, reference_diagnosis, normalized_reference_diagnosis, created_at.
clinical_case_symptoms: case FK, position, text; composite PK(case, position).
clinical_case_accepted_answers: UUID PK, case FK, answer, normalized_answer; unique(case, normalized_answer).
clinical_case_attempts: UUID PK, case FK, diagnosis, score, is_correct, created_at.
Use length/check constraints and FK indexes. Create case with children in one transaction. Raw source is not persisted/logged. Idempotent demo seed UUID 4613eeb7-7064-41da-bb06-62630b3eaebc.

## LLM boundary and ownership
backend/app/schemas.py owns Pydantic models. backend/app/llm.py exports async extract_case(source_text: str) -> ClinicalCaseDraft and ExtractionUnavailable, ExtractionFailed, ExtractionTimeout. Routes import these. Google Gen AI SDK, Vertex AI ADC, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GEMINI_MODEL settings read from environment. Bounded timeout/output, structured response schema, validate response. Source is untrusted data; no inferred facts/diagnoses, unknown age null, omit explicit conclusions. Failures never return fabricated extraction. Harness synthetic cases measures schema validity, age accuracy, symptom precision/recall with explicit aliases; live and offline outputs clearly distinguished.

## Frontend
Next.js App Router, Server Component fetches case; Client Components author and answer. NEXT_PUBLIC_API_URL browser origin; API_INTERNAL_URL optional server override. CORS explicit frontend origins. Generated types frontend/src/lib/api.generated.ts; schema aliases derived from components, never handwritten DTOs. API errors support error object and detail array. Preserve input after failures. Review checkbox required; any draft edit/re-extraction invalidates it. English strings centralized. New-case reference is always independently entered. Plain-text rendering, accessible pending/error/not-found states.

Frontend validation uses small shared text/validation helpers, with Unicode White_Space trimming matching Pydantic and code-point length checks. Native UTF-16 maxlength is intentionally omitted. Backend Pydantic remains authoritative. Field validation and request failures are inline, linked by aria-describedby/aria-invalid; validation moves focus to the first invalid field. No toast or form-validation framework is required.

## Identity and ownership

- POST /api/v1/auth/register and /login accept username (3..32 ASCII letters, digits or underscores, normalized lowercase) and password (12..128 characters, not trimmed, no NUL). They return Account plus an opaque session token to the trusted API client. The browser uses the same-origin Next proxy, which converts that token into an HttpOnly cookie and returns only Account. Register returns 201; invalid credentials 401, unavailable username 409, throttled work 429. No email or recovery is supported.
- GET /api/v1/auth/me returns `{ "user": Account }` or `{ "user": null }` for an absent session; malformed/expired sessions return 401. POST /api/v1/auth/logout revokes the current token. Sessions expire after 30 days; only their SHA-256 hashes are persisted. Personal/auth responses are no-store.
- GET /api/v1/profile requires a session and returns own attempt_count, correct_count, incorrect_count, points, attempts and cases. page/case_page start at 1; each list has 20 items and its own has_more flag. All repeated attempts count. History includes submitted notes and case links; existing and guest rows are never claimed.
- GET /api/v1/clinical-cases/{id}/edit and PUT /api/v1/clinical-cases/{id} require ownership. Editing is allowed only before any attempt and before archival (409 otherwise). DELETE on the same path archives rather than physically deleting; history and read-only detail remain, while catalog visibility and new submissions cease. Nonowners receive 404. Row locks serialize edits, archival and attempts.
- Browser calls go through /api/backend/* with an allowlisted upstream path, same-origin mutation checks and a Secure production, HttpOnly, SameSite=Lax session cookie. No browser storage or URL tokens. Guest consent links open a modal over the mounted form; successful login does not submit or reset clinical fields.
