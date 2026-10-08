# API contract v1

Pydantic is authoritative. Reject unknown request fields. Trim strings before validation, reject blanks, count Unicode characters. JSON and English messages only. IDs are UUID; timestamps are UTC ISO 8601.

## Models
- ClinicalCaseDraft: title required string 1..120; vignette required string 1..8000; symptoms required array 1..20 of nonblank strings 1..200; age_years optional strict integer 0..120 or null, default null.
- ClinicalCaseCreate: draft fields plus reference_diagnosis required string 1..200; accepted_answers optional array default [] max 20, each string 1..200.
- ClinicalCase: draft fields plus required id UUID and created_at datetime. Response age_years always present. No reference, alternatives, normalized answers or source text.
- ExtractionRequest: source_text required string 20..20000.
- ExtractionResponse: required draft ClinicalCaseDraft and warnings string[]. Always include: Review the draft for accuracy and remove any revealed diagnosis before saving.
- AttemptCreate: diagnosis required string 1..200.
- AttemptResult: required id UUID, clinical_case_id UUID, score integer 0 or 100, max_score literal 100, is_correct boolean, feedback string, created_at datetime.

## Routes
- POST /api/v1/clinical-cases/extract: ExtractionRequest -> 200 ExtractionResponse; 422 validation, 502 extraction_failed, 503 extraction_unavailable, 504 extraction_timeout.
- POST /api/v1/clinical-cases: ClinicalCaseCreate -> 201 ClinicalCase; Location /api/v1/clinical-cases/{id}; 422 validation, 503 database_unavailable.
- GET /api/v1/clinical-cases/{id}: 200 ClinicalCase; 404 case_not_found, 422 malformed UUID, 503 database_unavailable.
- POST /api/v1/clinical-cases/{id}/attempts: AttemptCreate -> 201 AttemptResult; 404 case_not_found, 422 validation, 503 database_unavailable.
- GET /health: 200 {"status":"ok"}. GET /ready: verify database; 200 {"status":"ok"} or 503 database_unavailable.
- Extraction and creation require X-Author-Key when AUTHOR_API_KEY configured; constant-time comparison, 401 unauthorized. Cloud deployment must configure this key. UI accepts a password field, keeps it only in memory, never embeds it in bundles or persists it. Public GET/attempts do not need key.
- Shared handled error: {"error":{"code":"case_not_found","message":"Clinical case not found."}}. Never expose exception/provider/SQL/request text. FastAPI 422 detail array retained; frontend handles both shapes.

## Examples
Creation: {"title":"Fever and dry cough","vignette":"A 28-year-old presents with fever, dry cough, and fatigue for two days.","symptoms":["Fever","Dry cough","Fatigue"],"age_years":28,"reference_diagnosis":"Influenza","accepted_answers":["Flu"]}
Public: {"id":"4613eeb7-7064-41da-bb06-62630b3eaebc","title":"Fever and dry cough","vignette":"A 28-year-old presents with fever, dry cough, and fatigue for two days.","symptoms":["Fever","Dry cough","Fatigue"],"age_years":28,"created_at":"2026-10-07T12:00:00Z"}
Extraction: {"draft":{"title":"Fever and dry cough","vignette":"A 28-year-old presents with fever and dry cough.","symptoms":["Fever","Dry cough"],"age_years":28},"warnings":["Review the draft for accuracy and remove any revealed diagnosis before saving."]}
Attempt request: {"diagnosis":"  FLU  "}
Attempt response: {"id":"4460132b-686c-4395-8381-f2207f4c7854","clinical_case_id":"4613eeb7-7064-41da-bb06-62630b3eaebc","score":100,"max_score":100,"is_correct":true,"feedback":"Your diagnosis matches an accepted answer.","created_at":"2026-10-07T12:02:00Z"}
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
