import importlib.util
from pathlib import Path
import pytest

spec = importlib.util.spec_from_file_location("deployment_smoke", Path(__file__).resolve().parents[2] / "scripts" / "smoke.py")
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


def test_smoke_requires_explicit_account(monkeypatch):
    monkeypatch.delenv("SMOKE_USERNAME", raising=False)
    monkeypatch.delenv("SMOKE_PASSWORD", raising=False)
    monkeypatch.setattr(smoke, "request", lambda *args, **kwargs: pytest.fail("No request before account configuration"))
    with pytest.raises(SystemExit, match="SMOKE_USERNAME"):
        smoke.run("http://test", False)


def test_smoke_logs_out_after_failed_verification(monkeypatch):
    monkeypatch.setenv("SMOKE_USERNAME", "test_author")
    monkeypatch.setenv("SMOKE_PASSWORD", "synthetic-password")
    calls = []
    def request(base, path, body=None, key=None, token=None):
        calls.append((path, token))
        if path.endswith("/login"):
            return 200, {"session_token": "synthetic-token"}
        if path == "/ready":
            raise RuntimeError("verification failed")
        return 200, {}
    monkeypatch.setattr(smoke, "request", request)
    with pytest.raises(RuntimeError, match="verification failed"):
        smoke.run("http://test", False)
    assert calls[-1] == ("/api/v1/auth/logout", "synthetic-token")
