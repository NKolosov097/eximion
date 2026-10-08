import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
import inspect
import json
import logging
import os
import re
import threading
from time import perf_counter

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import ALWAYS_ON
from opentelemetry.trace import SpanKind, Status, StatusCode
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from starlette.responses import JSONResponse


PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")
provider = TracerProvider(sampler=ALWAYS_ON, resource=Resource({
    "service.name": os.getenv("K_SERVICE", "eximion-backend"),
    "service.version": os.getenv("K_REVISION", "local"),
    "gcp.project_id": PROJECT,
    "cloud.region": os.getenv("CLOUD_REGION", os.getenv("GOOGLE_CLOUD_LOCATION", "local")),
}))
tracer = provider.get_tracer("eximion.backend")
request_state = ContextVar("telemetry_request_state", default=None)
logger = logging.getLogger("eximion.operations")
logger.setLevel(logging.INFO)
logger.propagate = False
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(message)s"))
logger.addHandler(handler)
_flush_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="trace-flush")
_flush_lock = threading.Lock()
_flush_future = None
_flush_generation = 0
_export_enabled = False
FLUSH_TIMEOUT_SECONDS = 1.5


def error_type(exc):
    name = type(exc).__name__
    return name if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,79}", name) else "Exception"


def set_request_error(exc):
    state = request_state.get()
    if state is not None:
        state["error.type"] = error_type(exc)


def completion_log(name, span, started, status, error=None, attributes=None):
    context = span.get_span_context()
    record = {
        "severity": "ERROR" if error or status >= 500 else "INFO",
        "event": "operation.completed", "operation": name,
        "trace_id": f"{context.trace_id:032x}", "span_id": f"{context.span_id:016x}",
        "duration_ms": round((perf_counter() - started) * 1000, 3), "status": status,
    }
    if error:
        record["error.type"] = error
    if attributes:
        record.update(attributes)
    if PROJECT:
        record["logging.googleapis.com/trace"] = f"projects/{PROJECT}/traces/{record['trace_id']}"
        record["logging.googleapis.com/spanId"] = record["span_id"]
        record["logging.googleapis.com/trace_sampled"] = bool(context.trace_flags.sampled)
    logger.info(json.dumps(record, separators=(",", ":")))


@contextmanager
def operation(name, kind=SpanKind.INTERNAL):
    started = perf_counter()
    error = None
    with tracer.start_as_current_span(name, kind=kind, record_exception=False, set_status_on_exception=False) as span:
        try:
            yield span
        except BaseException as exc:
            error = error_type(exc)
            span.set_attribute("error.type", error)
            span.set_status(Status(StatusCode.ERROR))
            set_request_error(exc)
            raise
        finally:
            completion_log(name, span, started, 500 if error else 200, error)


def traced(name):
    def decorate(function):
        if inspect.iscoroutinefunction(function):
            @wraps(function)
            async def async_wrapper(*args, **kwargs):
                with operation(name):
                    return await function(*args, **kwargs)
            return async_wrapper
        @wraps(function)
        def sync_wrapper(*args, **kwargs):
            with operation(name):
                return function(*args, **kwargs)
        return sync_wrapper
    return decorate


class SafeTelemetryLogFilter(logging.Filter):
    def filter(self, record):
        # SDK/provider diagnostics may include URLs or exception messages.
        record.msg = json.dumps({"severity": "WARNING", "event": "telemetry.export", "error.type": "TraceExportFailure"})
        record.args = ()
        record.exc_info = None
        record.exc_text = None
        record.stack_info = None
        return True


def configure_export():
    global _export_enabled
    if os.getenv("TRACE_EXPORT_ENABLED", "").lower() != "true" or _export_enabled:
        return
    for name in ("opentelemetry.sdk._shared_internal", "opentelemetry.sdk.trace", "opentelemetry.exporter.otlp.proto.grpc.exporter", "google.auth.transport.grpc", "google.auth.transport.requests", "grpc._plugin_wrapping"):
        logging.getLogger(name).addFilter(SafeTelemetryLogFilter())
    try:
        import google.auth
        from google.auth.transport.grpc import AuthMetadataPlugin
        from google.auth.transport.requests import Request
        import grpc
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        auth = AuthMetadataPlugin(credentials=credentials, request=Request())
        channel_credentials = grpc.composite_channel_credentials(grpc.ssl_channel_credentials(), grpc.metadata_call_credentials(auth))
        exporter = OTLPSpanExporter(endpoint="https://telemetry.googleapis.com:443", credentials=channel_credentials, timeout=1)
        provider.add_span_processor(BatchSpanProcessor(exporter, max_queue_size=256, max_export_batch_size=256, schedule_delay_millis=1000, export_timeout_millis=1000))
        _export_enabled = True
    except Exception as exc:
        started = perf_counter()
        with tracer.start_as_current_span("telemetry.configure", record_exception=False, set_status_on_exception=False) as span:
            span.set_attribute("error.type", error_type(exc))
            span.set_status(Status(StatusCode.ERROR))
            completion_log("telemetry.configure", span, started, 503, error_type(exc))


def _flush_worker():
    global _flush_future
    error = None
    while True:
        with _flush_lock:
            generation = _flush_generation
        try:
            if not provider.force_flush(timeout_millis=1000):
                error = "TraceExportFailure"
        except Exception as exc:
            error = error_type(exc)
        with _flush_lock:
            if generation == _flush_generation:
                _flush_future = None
                return error


async def flush_traces(request_span=None):
    global _flush_future, _flush_generation
    if not _export_enabled:
        return
    started = perf_counter()
    with _flush_lock:
        _flush_generation += 1
        if _flush_future is None or _flush_future.done():
            _flush_future = _flush_pool.submit(_flush_worker)
        future = _flush_future
    try:
        # SDK 1.45 force_flush ignores its timeout. Reuse one worker and bound only the request's wait.
        error = await asyncio.wait_for(asyncio.shield(asyncio.wrap_future(future)), timeout=FLUSH_TIMEOUT_SECONDS)
    except Exception as exc:
        error = error_type(exc)
    if error and request_span is not None:
        completion_log("telemetry.flush", request_span, started, 503, error)


class TelemetryMiddleware:
    def __init__(self, app, cors_origins=()):
        self.app = app
        self.cors_origins = cors_origins
        configure_export()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = perf_counter()
        method = scope["method"] if scope["method"] in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "CONNECT", "TRACE"} else "OTHER"
        parents = [value for key, value in scope.get("headers", []) if key == b"traceparent"]
        try:
            carrier = {"traceparent": parents[0].decode("ascii")} if len(parents) == 1 else {}
        except UnicodeDecodeError:
            carrier = {}
        parent_context = TraceContextTextMapPropagator().extract(carrier)
        state = {}
        token = request_state.set(state)
        messages = []

        async def capture(message):
            messages.append(message)

        with tracer.start_as_current_span("HTTP request", context=parent_context, kind=SpanKind.SERVER, record_exception=False, set_status_on_exception=False) as span:
            try:
                try:
                    await self.app(scope, receive, capture)
                except asyncio.CancelledError as exc:
                    set_request_error(exc)
                    raise
                except Exception as exc:
                    set_request_error(exc)
                    messages.clear()
                    origins = [value.decode("latin-1") for key, value in scope.get("headers", []) if key == b"origin"]
                    headers = {}
                    if len(origins) == 1 and origins[0] in self.cors_origins:
                        headers = {"Access-Control-Allow-Origin": origins[0], "Access-Control-Expose-Headers": "Location, X-Trace-ID", "Vary": "Origin"}
                    response = JSONResponse(status_code=500, headers=headers, content={"error": {"code": "internal_error", "message": "An unexpected error occurred."}})
                    await response(scope, receive, capture)
            finally:
                route = getattr(scope.get("route"), "path", "unmatched")
                status = 499 if state.get("error.type") == "CancelledError" else next((message["status"] for message in messages if message["type"] == "http.response.start"), 500)
                attributes = {"http.request.method": method, "http.route": route, "http.response.status_code": status}
                span.update_name(f"{method} {route}")
                span.set_attributes(attributes)
                if "error.type" in state:
                    span.set_attribute("error.type", state["error.type"])
                if status >= 500 or status == 499:
                    span.set_status(Status(StatusCode.ERROR))
                trace_id = f"{span.get_span_context().trace_id:032x}"
                for message in messages:
                    if message["type"] == "http.response.start":
                        message["headers"] = [(key, value) for key, value in message["headers"] if key.lower() != b"x-trace-id"] + [(b"x-trace-id", trace_id.encode())]
                completion_log(f"{method} {route}", span, started, status, state.get("error.type"), attributes)
                request_state.reset(token)
        await flush_traces(span)
        for message in messages:
            await send(message)
