import asyncio
import json
import logging
from time import perf_counter, sleep
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import httpx
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.sdk.trace.sampling import ALWAYS_ON
from opentelemetry.trace import SpanKind
import pytest
from sqlalchemy import text

from app import llm, telemetry
from app.main import app
from test_cases import VALID_CASE


@pytest.fixture
def observed(monkeypatch):
    exporter = InMemorySpanExporter()
    provider = TracerProvider(sampler=ALWAYS_ON, resource=Resource({"service.name": "test"}))
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(telemetry, "provider", provider)
    monkeypatch.setattr(telemetry, "tracer", provider.get_tracer("test"))
    monkeypatch.setattr(telemetry, "_export_enabled", False)
    monkeypatch.setattr(telemetry, "PROJECT", "test-project")
    monkeypatch.delenv("AUTHOR_API_KEY", raising=False)
    records = []

    class Capture(logging.Handler):
        def emit(self, record):
            records.append(json.loads(record.getMessage()))

    handler = Capture()
    telemetry.logger.addHandler(handler)
    try:
        yield exporter, records
    finally:
        telemetry.logger.removeHandler(handler)
        provider.shutdown()


def assert_safe(exporter, records, secrets):
    spans = exporter.get_finished_spans()
    serialized = json.dumps(records) + "".join(span.to_json() for span in spans)
    for secret in secrets:
        assert secret not in serialized
    for span in spans:
        assert not span.events
        assert span.status.description is None
    for record in records:
        assert len(record["trace_id"]) == 32
        assert len(record["span_id"]) == 16
        assert record["duration_ms"] >= 0
        assert record["logging.googleapis.com/spanId"] == record["span_id"]
        assert record["logging.googleapis.com/trace"].endswith(record["trace_id"])


def test_real_database_parentage_and_content_redaction(postgres, observed):
    exporter, records = observed
    secret = "PRIVATE_DIAGNOSIS_987"
    body = VALID_CASE | {"title": secret, "vignette": secret, "reference_diagnosis": secret}
    trace_id = "1234567890abcdef1234567890abcdef"
    parent_id = "1234567890abcdef"
    with TestClient(app) as client:
        response = client.post("/api/v1/clinical-cases", json=body, headers={"traceparent": f"00-{trace_id}-{parent_id}-01"})
        assert response.status_code == 201
        assert response.headers["x-trace-id"] == trace_id
        case_id = response.json()["id"]
        attempt = client.post(f"/api/v1/clinical-cases/{case_id}/attempts", json={"diagnosis": secret})
        assert attempt.status_code == 201
        assert attempt.json()["score"] == 100
        missing = client.get(f"/api/v1/clinical-cases/{uuid4()}")
        assert missing.status_code == 404
    spans = [span for span in exporter.get_finished_spans() if span.context.trace_id == int(trace_id, 16)]
    server = next(span for span in spans if span.kind == SpanKind.SERVER)
    assert server.parent.span_id == int(parent_id, 16)
    names = {span.name for span in spans}
    assert {"author.authorize", "request.validate", "case.create", "db.transaction", "db.query"} <= names
    transaction = next(span for span in spans if span.name == "db.transaction")
    assert any(span.parent.span_id == transaction.context.span_id for span in spans if span.name == "db.query")
    assert "diagnosis.grade" in {span.name for span in exporter.get_finished_spans()}
    missing_records = [record for record in records if record["trace_id"] == missing.headers["x-trace-id"] and record["operation"] in {"case.load", "case.read"}]
    assert missing_records and all(record["status"] == 404 and record["severity"] == "WARNING" for record in missing_records)
    records_by_span = {record["span_id"]: record for record in records}
    assert all(f"{span.context.span_id:016x}" in records_by_span for span in spans)
    assert_safe(exporter, records, [secret, "eximion-local-only", "INSERT INTO", "SELECT ", case_id])


def test_validation_authorization_unmatched_routes_and_cors(observed, monkeypatch):
    exporter, records = observed
    monkeypatch.setenv("AUTHOR_API_KEY", "PRIVATE_AUTHOR_123")
    with TestClient(app) as client:
        invalid = client.post("/api/v1/clinical-cases", json={"private_source": "PRIVATE_SOURCE_456"})
        assert invalid.status_code in {401, 422}
        unauthorized = client.post("/api/v1/clinical-cases", json=VALID_CASE)
        assert unauthorized.status_code == 401
        missing = client.get("/PRIVATE_PATH_789", headers={"traceparent": "PRIVATE_BAD_TRACE_987"})
        assert missing.status_code == 404
        assert len(missing.headers["x-trace-id"]) == 32
        cors = client.get("/health", headers={"Origin": "http://localhost:3000"})
        assert "X-Trace-ID" in cors.headers["access-control-expose-headers"]
        other_method = client.request("PRIVATE_METHOD_456", "/PRIVATE_PATH_789")
        assert other_method.status_code == 404
    assert_safe(exporter, records, ["PRIVATE_AUTHOR_123", "PRIVATE_SOURCE_456", "PRIVATE_PATH_789", "PRIVATE_BAD_TRACE_987", "PRIVATE_METHOD_456"])
    assert any(record.get("http.request.method") == "OTHER" for record in records)
    assert any(record.get("error.type") == "APIError" for record in records)
    auth_records = [record for record in records if record["operation"] == "author.authorize"]
    assert auth_records and all(record["status"] == 401 and record["severity"] == "WARNING" for record in auth_records)


def test_unexpected_error_returns_safe_500_and_never_rethrows_to_server(observed):
    exporter, records = observed
    failing = FastAPI()
    failing.add_middleware(telemetry.TelemetryMiddleware, cors_origins=["http://localhost:3000"])

    @failing.get("/fail")
    async def fail():
        raise RuntimeError("PRIVATE_CRASH_123")

    with TestClient(failing) as client:
        response = client.get("/fail", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "X-Trace-ID" in response.headers["access-control-expose-headers"]
    assert len(response.headers["x-trace-id"]) == 32
    assert "PRIVATE_CRASH_123" not in response.text
    assert records[-1]["error.type"] == "RuntimeError"
    assert records[-1]["status"] == 500
    assert_safe(exporter, records, ["PRIVATE_CRASH_123"])


def test_gemini_spans_and_parallel_request_context(observed, monkeypatch):
    exporter, records = observed
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
    monkeypatch.setenv("GOOGLE_CLOUD_LOCATION", "test-region")
    monkeypatch.setenv("GEMINI_MODEL", "test-model")

    async def generate(**kwargs):
        await asyncio.sleep(0.01)
        return SimpleNamespace(text=json.dumps({"title": "PRIVATE_MODEL_123", "vignette": "PRIVATE_MODEL_123", "symptoms": ["PRIVATE_MODEL_123"]}))

    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    context.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(llm.genai, "Client", MagicMock(return_value=SimpleNamespace(aio=context)))

    async def parallel():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await asyncio.gather(*(client.post("/api/v1/clinical-cases/extract", json={"source_text": "PRIVATE_SOURCE_456 synthetic clinical text."}, headers={"traceparent": f"00-{number:032x}-{number:016x}-01"}) for number in range(1, 13)))

    responses = asyncio.run(parallel())
    assert all(response.status_code == 200 for response in responses)
    assert {response.headers["x-trace-id"] for response in responses} == {f"{number:032x}" for number in range(1, 13)}
    for number in range(1, 13):
        spans = [span for span in exporter.get_finished_spans() if span.context.trace_id == number]
        assert {"gemini.extract", "gemini.request", "gemini.output.validate", "author.authorize", "request.validate", "case.extract"} <= {span.name for span in spans}
        span_ids = {span.context.span_id for span in spans}
        assert all(span.parent.span_id in span_ids or span.parent.span_id == number for span in spans)
    assert telemetry.request_state.get() is None
    assert_safe(exporter, records, ["PRIVATE_SOURCE_456", "PRIVATE_MODEL_123"])


def test_failed_query_has_safe_error_span(postgres, observed):
    exporter, records = observed
    engine, _ = postgres
    with telemetry.operation("case.test"):
        with engine.connect() as connection:
            with pytest.raises(Exception):
                connection.execute(text("SELECT 'PRIVATE_SQL_123'::integer"))
    assert any(span.name == "db.query" and span.attributes.get("error.type") == "InvalidTextRepresentation" for span in exporter.get_finished_spans())
    assert_safe(exporter, records, ["PRIVATE_SQL_123", "SELECT "])


def test_export_wait_is_bounded_and_concurrent_requests_share_one_worker(observed, monkeypatch):
    calls = []
    monkeypatch.setattr(telemetry, "_export_enabled", True)
    monkeypatch.setattr(telemetry, "FLUSH_TIMEOUT_SECONDS", 0.03)

    def slow_flush(**kwargs):
        calls.append(1)
        sleep(0.2)
        raise RuntimeError("PRIVATE_EXPORT_123")

    monkeypatch.setattr(telemetry.provider, "force_flush", slow_flush)

    async def parallel():
        started = perf_counter()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            responses = await asyncio.gather(*(client.get("/health") for _ in range(20)))
        assert all(response.status_code == 200 for response in responses)
        assert perf_counter() - started < 0.15

    asyncio.run(parallel())
    assert len(calls) == 1
    telemetry._flush_future.result(timeout=2)
    assert_safe(*observed, ["PRIVATE_EXPORT_123"])


def test_local_export_configuration_never_discovers_credentials(monkeypatch):
    import google.auth
    default = MagicMock(side_effect=RuntimeError("Should not be called"))
    monkeypatch.setattr(google.auth, "default", default)
    monkeypatch.delenv("TRACE_EXPORT_ENABLED", raising=False)
    telemetry.configure_export()
    default.assert_not_called()


def test_otlp_export_configuration_and_adc_failure_are_safe(observed, monkeypatch):
    import google.auth
    from google.auth.credentials import AnonymousCredentials
    from opentelemetry.exporter.otlp.proto.grpc import trace_exporter
    monkeypatch.setenv("TRACE_EXPORT_ENABLED", "true")
    monkeypatch.setattr(google.auth, "default", MagicMock(return_value=(AnonymousCredentials(), "test-project")))
    factory = MagicMock()
    monkeypatch.setattr(trace_exporter, "OTLPSpanExporter", factory)
    batch = MagicMock()
    monkeypatch.setattr(telemetry, "BatchSpanProcessor", batch)
    monkeypatch.setattr(telemetry.provider, "add_span_processor", MagicMock())
    telemetry.configure_export()
    assert telemetry._export_enabled
    kwargs = factory.call_args.kwargs
    assert kwargs["endpoint"] == "https://telemetry.googleapis.com:443"
    assert kwargs["timeout"] == 1
    assert kwargs["credentials"] is not None
    assert batch.call_args.kwargs["max_queue_size"] == 256
    assert batch.call_args.kwargs["max_export_batch_size"] == 256
    monkeypatch.setattr(telemetry, "_export_enabled", False)
    monkeypatch.setattr(google.auth, "default", MagicMock(side_effect=RuntimeError("PRIVATE_ADC_123")))
    telemetry.configure_export()
    assert not telemetry._export_enabled
    assert observed[1][-1]["status"] == 503
    assert observed[1][-1]["error.type"] == "RuntimeError"
    assert_safe(*observed, ["PRIVATE_ADC_123"])


def test_traceparent_rejects_nonascii_duplicates_and_samples_unsampled_parent(observed):
    trace_id = "1234567890abcdef1234567890abcdef"
    valid = f"00-{trace_id}-1234567890abcdef-01".encode()
    with TestClient(app) as client:
        invalid = client.get("/health", headers=[(b"traceparent", b"\xff" + valid)])
        duplicate = client.get("/health", headers=[(b"traceparent", valid), (b"traceparent", valid)])
        unsampled = client.get("/health", headers={"traceparent": f"00-{trace_id}-1234567890abcdef-00"})
    assert invalid.headers["x-trace-id"] != trace_id
    assert duplicate.headers["x-trace-id"] != trace_id
    assert unsampled.headers["x-trace-id"] == trace_id
    assert any(span.context.trace_id == int(trace_id, 16) and span.context.trace_flags.sampled for span in observed[0].get_finished_spans())


def test_cancelled_request_records_safe_completion_and_propagates_cancellation(observed):
    cancelled = FastAPI()
    cancelled.add_middleware(telemetry.TelemetryMiddleware)

    @cancelled.get("/cancel")
    async def cancel():
        raise asyncio.CancelledError("PRIVATE_CANCEL_123")

    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=cancelled), base_url="http://test") as client:
            with pytest.raises(asyncio.CancelledError):
                await client.get("/cancel")
        assert telemetry.request_state.get() is None

    asyncio.run(request())
    assert observed[1][-1]["status"] == 499
    assert observed[1][-1]["error.type"] == "CancelledError"
    assert observed[0].get_finished_spans()[-1].name == "GET /cancel"
    assert_safe(*observed, ["PRIVATE_CANCEL_123"])


def test_grpc_auth_callback_diagnostics_cannot_leak_credentials(observed, monkeypatch, caplog):
    import google.auth
    monkeypatch.setenv("TRACE_EXPORT_ENABLED", "true")
    monkeypatch.setattr(google.auth, "default", MagicMock(side_effect=RuntimeError("PRIVATE_ADC_123")))
    telemetry.configure_export()
    plugin_logger = logging.getLogger("grpc._plugin_wrapping")
    with caplog.at_level(logging.ERROR, logger="grpc._plugin_wrapping"):
        try:
            raise RuntimeError("PRIVATE_TOKEN_456")
        except RuntimeError:
            plugin_logger.exception("Auth failed: PRIVATE_HEADER_789")
    assert "PRIVATE_TOKEN_456" not in caplog.text
    assert "PRIVATE_HEADER_789" not in caplog.text
    assert "TraceExportFailure" in caplog.text
    assert_safe(*observed, ["PRIVATE_ADC_123", "PRIVATE_TOKEN_456", "PRIVATE_HEADER_789"])
