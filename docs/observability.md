# Backend observability

Every backend layer emits OpenTelemetry spans and correlated JSON operational logs: HTTP, authorization/validation, case persistence and grading, PostgreSQL, and Gemini extraction/output validation. Clinical content, submitted/reference diagnoses, credentials, SQL text/parameters and raw exception messages are excluded. Browser analytics are not collected.

## Local inspection

Run `docker compose logs backend`. Find the `X-Trace-ID` response header in the browser Network panel, then filter logs by that ID. CORS exposes the header. Incoming valid W3C `traceparent` joins an existing trace; invalid context starts a new trace. Local runs need no Google credentials for structured logging and trace IDs.

## Cloud inspection

The deploy script enables Telemetry and Cloud Trace APIs, grants the backend identity trace-writing and quota-use permissions, and sets `TRACE_EXPORT_ENABLED=true`. ADC comes from the attached runtime identity. The standard OTLP/gRPC exporter sends to `telemetry.googleapis.com:443`; logs go to the container log stream and Cloud Run collects them. `GOOGLE_CLOUD_PROJECT`, `CLOUD_REGION`, `K_SERVICE`, and `K_REVISION` identify the deployed service.

Open [Logs Explorer](https://console.cloud.google.com/logs/query?project=eximion-511003) and use:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="eximion-backend"
trace="projects/eximion-511003/traces/TRACE_ID"
```

Open [Trace Explorer](https://console.cloud.google.com/traces/explorer?project=eximion-511003) and find the same trace ID. Inspect the HTTP parent and application/database/Gemini children to distinguish slow SQL, model latency, or application work. Cloud Run platform startup logs remain useful for cold starts.

Spans sent through the Telemetry API are not readable through the legacy Trace v1/v2 get/list APIs. Use Trace Explorer or Observability Analytics. [Google documents this limitation](https://docs.cloud.google.com/trace/docs/troubleshooting).

## Delivery and limits

Cloud Run keeps request-based CPU allocation and can scale to zero. Before completing the response, the application makes a bounded best-effort flush; telemetry export failure leaves the application response intact. This adds a small export delay and cannot guarantee delivery after process crashes or during export outages. Sampling and final verified timings are recorded with the deployment evidence.

Tracing is operational diagnostics, not an audit trail. It does not store clinical inputs or answers. No alerts, operational dashboards, browser session recording, or additional collector service are provisioned.


## Stored-span verification

Trace storage is `_Trace/Spans` in Frankfurt (`europe-west3`). A linked BigQuery dataset `eximion_trace` provides programmatic readback without copying traces. It was created once using:

```sh
gcloud services enable observability.googleapis.com monitoring.googleapis.com bigquery.googleapis.com --project eximion-511003
gcloud observability buckets datasets links create eximion_trace --dataset=Spans --bucket=_Trace --location=europe-west3 --project=eximion-511003
node scripts/browser-smoke.cjs
uv run --project backend python scripts/verify_cloud_traces.py
```

The readback query is limited to captured trace IDs in the last hour, 500 spans, and at most 100 MB billed. It asserts expected layers, parent relationships and absence of known sensitive input/key markers; saves `docs/cloud-trace-check.json`. Allow ingestion time before querying. The linked dataset is only for operator verification, not an application dependency.

This demonstration samples all requests (`ALWAYS_ON`), including incoming unsampled parents, so every exercise can be inspected. For sustained public traffic, select a lower sampling rate and configure budgets/alerts. The application buffers its bounded JSON responses while waiting up to 1.5 seconds for acknowledgment of the request root span export; the export transport timeout is 1 second. Streaming endpoints would require a different response strategy. A single shared flush worker prevents one thread per timed-out request.

The pinned SDK force_flush drains until its queue is empty. Requests wait for their own exporter acknowledgment, registered before the root span ends, rather than worker completion. Later traffic cannot prolong an already exported request. One worker triggers flushes; timeout/cancellation removes the waiter, and exporter failure/shutdown releases safe failures. Export remains best effort; dropped spans time out. The sustained-traffic regression uses the real BatchSpanProcessor with a delayed fake exporter.

## Private application analytics

The header Analytics link opens `/analytics`. Enter the existing Author key and select the last 7, 30 or 90 days to load cases created, attempts submitted and the percentage of correct answers. Metrics are calculated from existing database records within a rolling UTC period; repeated attempts count separately, including attempts on cases created before the period. No attempts displays a dash instead of a misleading 0% success rate.

The key stays in page memory and is sent only in the X-Author-Key header. Changing the key or period clears the displayed metrics until they are loaded again. Responses are not cached. An unconfigured server key disables this endpoint. This is aggregate activity reporting, not visitor tracking: no browser events, unique-user counts, cookies, session recordings or external analytics services are added.
