# E2E selectors and backend observability

## Specification

Stable data-testid attributes are a supported E2E contract, independent of English labels and CSS. Preserve accessible roles/labels. Cover home navigation, author inputs/actions/errors/review, public case content/loading/error, and diagnosis submission/result. Unique within their containing page/form; repeated symptom rows may share a selector and use scoped selection. Never encode user content in selectors.

Backend observability covers HTTP requests, author authorization, validation/error handling, clinical-case operations and grading, database queries/transactions, and Gemini calls/output validation. Use OpenTelemetry spans and structured JSON operational logs sharing trace_id/span_id. Accept validated W3C traceparent context and return X-Trace-ID on responses; expose it through CORS. Record route templates, safe operation names, status, duration and exception class only. Never log bodies, keys, headers, diagnoses, source text, database URLs, SQL statements/parameters or exception messages. Unknown paths must not enter logs. Trace export failure must not fail user requests.

Local runs retain correlated JSON logs without requiring Google credentials. Cloud runtime exports real traces to Cloud Trace through its service identity with least-privilege IAM. Explicitly address Cloud Run CPU throttling and bounded export time. No separate observability service, browser analytics, SDK or API schema changes.

## Plan and ownership

1. Frontend owner: frontend files and docs/e2e-selectors.md; add selectors and verification using them.
2. Backend owner: backend files; implement safe instrumentation/export, tests for context, concurrency, success/error and redaction.
3. Coordinator: deployment IAM/configuration, integration, docs, actual local/cloud verification and commits.
4. Independent review: correctness, privacy, trace export and selector coverage.

## Tasks

- [x] Inspect existing implementation and establish scope.
- [x] Save specification, plan and ownership before implementation.
- [x] Add selectors and selector tests.
- [x] Finalize exporter configuration and implement backend instrumentation.
- [x] Verify functional tests and sensitive-data exclusion.
- [x] Deploy applications and verify E2E selectors, logs and actual exported spans.
- [x] Record commands, evidence and limitations; commit verified changes.

## Export contract

Use the standard OpenTelemetry OTLP/gRPC exporter with ADC to telemetry.googleapis.com:443. TRACE_EXPORT_ENABLED=true enables cloud export; local runs default to logs and active trace contexts only. GOOGLE_CLOUD_PROJECT identifies the destination, CLOUD_REGION identifies the app region, and K_REVISION supplies the deployed version. Enable telemetry.googleapis.com and cloudtrace.googleapis.com; grant the backend runtime roles/telemetry.tracesWriter and roles/serviceusage.serviceUsageConsumer. Emit Cloud Logging trace/span correlation fields.

End request spans after dependency teardown, then perform a bounded exporter flush while the final response body is held. The transport deadline must also be bounded. Keep Cloud Run min instances and request-based CPU settings unchanged. Operational logs include export failures without sensitive exception text. Do not claim cloud verification based only on a trace ID in logs.

References: [Google OTLP migration/authentication](https://docs.cloud.google.com/stackdriver/docs/instrumentation/migrate-to-otlp-endpoints), [Cloud Trace ingestion troubleshooting](https://docs.cloud.google.com/trace/docs/troubleshooting). OTLP-ingested spans require Trace Explorer/Observability Analytics rather than legacy Trace API read methods.
