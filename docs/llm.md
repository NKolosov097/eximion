# Gemini extraction and evaluation

The application extracts educational drafts from synthetic text. It never asks the model to determine the reference diagnosis, and it never grades learner answers with an LLM. Raw source text is not stored or logged by this module. Provider failures return safe errors, not fabricated output.

## Configuration

Set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `GEMINI_MODEL`. All three are required. Use Application Default Credentials locally and the backend service account on Cloud Run. Do not put credentials in source files or browser bundles.

The verified deployment candidate on 2026-10-07 is `gemini-3.5-flash-lite` with location `eu`; applications and PostgreSQL can remain in `europe-west3`. The model is GA, supports structured output, and lists global, US, and EU endpoints rather than Frankfurt. Its default minimal thinking is suitable for extraction. Custom temperature values are ignored by this model, so none is supplied. See the [official model documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite). Live requests verified access in the actual project on 2026-10-08 UTC.

The current Google Gen AI SDK calls the Vertex AI service Gemini Enterprise Agent Platform and uses `genai.Client(enterprise=True, ...)`; see the [SDK documentation](https://googleapis.github.io/python-genai/). The dependency is pinned in the backend lockfile. No alternate provider or silent model fallback is implemented.

## Runtime behavior

`app.llm.extract_case(source_text)` returns the authoritative `ClinicalCaseDraft` Pydantic model. It sends the schema as structured JSON output configuration and independently validates the returned JSON. Unknown fields, invalid types, empty output, and schema violations fail. The system instruction treats JSON-encoded source text as untrusted data and requests factual English extraction with no invented findings or diagnosis. Missing age remains null, and pertinent negatives must remain negative.

The call has a 30-second transport timeout, a 45-second async deadline, one provider attempt, and a 2,048-token output limit. Errors use `ExtractionUnavailable`, `ExtractionTimeout`, or `ExtractionFailed`; no provider exception text is exposed. The async client is closed after each call. The author must review the resulting draft and remove any revealed answer before saving; prompting is not a guaranteed redaction mechanism.

## Reproducible checks

Run from `backend/`:

```sh
uv run python -m pytest tests/test_llm.py -q
uv run python -m eval.run --output eval/offline-report.json
uv run python -m eval.run --live --output eval/live-report.json
```

The offline command validates fixed synthetic drafts and the harness itself; it is not evidence of Gemini quality. The live command makes five sequential model requests and labels the report `live_gemini`. Reports include timestamp, configured model/location, aggregate metrics, and per-example results, without source text or generated drafts. A run fails when schema validity or age accuracy is below 100%, macro symptom precision/recall is below 80%, or a listed diagnosis leaks. Configuration/provider failures count as failed cases, not skipped examples.

Five fixtures cover explicit diagnosis removal, unknown age, a pertinent negative, source prompt injection, and age zero. Symptom matching uses case-folded NFKC text, collapsed whitespace, and explicit aliases; each fixture lists expected findings. Precision is recognized predicted findings divided by all predicted findings; recall is covered expected findings divided by expected findings. Metrics are averaged across all cases, with failed outputs scoring zero. Whole-word matching of fixture-specific forbidden terms checks leakage in every public text field.

## Limits and verification record

This is a small extraction regression set, not a medical accuracy study. Exact aliases intentionally penalize unlisted paraphrases, and the leakage list cannot detect every possible disclosure. Expand the fixtures and inspect outputs before changing the prompt/model or accepting broader clinical input.

Verified on 2026-10-08 UTC (2026-10-07 local): 18 focused tests passed, including actual google-genai 2.29.0 request serialization and response parsing with an offline HTTP transport. The five-fixture self-check passed with schema validity, age accuracy, symptom precision, and symptom recall all 1.0, and zero listed diagnosis leaks. See `backend/eval/offline-report.json`. The deployed Cloud Run service identity was then evaluated against the same five examples: schema validity 1.0, age accuracy 1.0, symptom precision 1.0, macro recall 0.9333, and zero listed diagnosis leaks. The pertinent-negative example matched two of three expected findings. This may reflect omission or an unlisted paraphrase; the report deliberately preserves the lower score. See `backend/eval/live-report.json` (mode `live_gemini`, execution `deployed_cloud_run_service_identity`). The configured acceptance threshold of 0.8 was met.
