from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app import llm
from app.cases import build_case
from app.database import get_session
from app.main import app
from app.models import ClinicalCaseAcceptedAnswer, ClinicalCaseAttempt, ClinicalCaseRecord, ClinicalCaseSymptom
from app.schemas import ClinicalCaseCreate, ClinicalCaseDraft
from test_cases import VALID_CASE


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("AUTHOR_API_KEY", raising=False)
    with TestClient(app) as client:
        yield client


def test_create_read_grade_and_persist_across_connections(postgres, client):
    engine, _ = postgres
    response = client.post("/api/v1/clinical-cases", json=VALID_CASE)
    assert response.status_code == 201, response.text
    case = response.json()
    assert set(case) == {"id", "title", "vignette", "symptoms", "age_years", "created_at"}
    assert response.headers["location"] == f"/api/v1/clinical-cases/{case['id']}"
    assert case["symptoms"] == ["Fever", "Cough"]
    assert case["created_at"].endswith(("Z", "+00:00"))
    engine.dispose()
    assert client.get(response.headers["location"]).json() == case
    for diagnosis, score in [(" ＦＬＵ ", 100), ("INFLUENZA", 100), ("Influenza.", 0), ("Cold", 0)]:
        attempt = client.post(f"/api/v1/clinical-cases/{case['id']}/attempts", json={"diagnosis": diagnosis})
        assert attempt.status_code == 201, attempt.text
        assert attempt.json()["score"] == score
        assert attempt.json()["max_score"] == 100
        assert attempt.json()["is_correct"] == (score == 100)
        assert "reference" not in attempt.text.lower()
    with Session(engine) as session:
        record = session.get(ClinicalCaseRecord, UUID(case["id"]))
        assert record.reference_diagnosis == "Influenza"
        assert len(record.accepted_answers) == 1
        assert session.scalar(select(func.count()).select_from(ClinicalCaseSymptom)) == 2
        attempts = session.scalars(select(ClinicalCaseAttempt)).all()
        assert len(attempts) == 4
        assert attempts[0].diagnosis == "ＦＬＵ"
    assert client.get("/ready").json() == {"status": "ok"}


def test_missing_case_and_malformed_ids(postgres, client):
    path = f"/api/v1/clinical-cases/{uuid4()}"
    for response in [client.get(path), client.post(f"{path}/attempts", json={"diagnosis": "Flu"})]:
        assert response.status_code == 404
        assert response.json() == {"error": {"code": "case_not_found", "message": "Clinical case not found."}}
    assert client.get("/api/v1/clinical-cases/not-a-uuid").status_code == 422


def test_author_key_guards_writes_and_never_echoes_input(client, monkeypatch):
    monkeypatch.setenv("AUTHOR_API_KEY", "test-author-key")
    for path, body in [("/api/v1/clinical-cases", VALID_CASE), ("/api/v1/clinical-cases/extract", {"source_text": "Synthetic clinical source text."})]:
        for headers in [{}, {"X-Author-Key": "wrong"}, {b"X-Author-Key": b"\xc3\xa9"}]:
            response = client.post(path, json=body, headers=headers)
            assert response.status_code == 401
            assert "test-author-key" not in response.text
    assert client.get("/health").status_code == 200
    response = client.post("/api/v1/clinical-cases", json=VALID_CASE | {"private_source": "DO_NOT_ECHO"}, headers={"X-Author-Key": "test-author-key"})
    assert response.status_code == 422
    assert "DO_NOT_ECHO" not in response.text


def test_analytics_requires_configured_author_key(client, monkeypatch):
    response = client.get("/api/v1/analytics")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "author_unavailable"
    monkeypatch.setenv("AUTHOR_API_KEY", "analytics-secret")
    for headers in [{}, {"X-Author-Key": "wrong"}]:
        response = client.get("/api/v1/analytics", headers=headers)
        assert response.status_code == 401
        assert "analytics-secret" not in response.text


def test_analytics_aggregates_utc_window_and_older_case_attempts(postgres, client, monkeypatch):
    from app import main

    engine, _ = postgres
    fixed_end = datetime(2026, 10, 8, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(main, "utc_now", lambda: fixed_end)
    monkeypatch.setenv("AUTHOR_API_KEY", "analytics-secret")
    window_start = fixed_end - timedelta(days=30)
    older_case_id = UUID(int=4)
    with Session(engine) as session:
        cases = []
        for identifier, created_at in [
            (1, window_start),
            (2, fixed_end),
            (3, fixed_end + timedelta(seconds=1)),
            (4, window_start - timedelta(days=1)),
        ]:
            record = build_case(ClinicalCaseCreate(**VALID_CASE))
            record.id = UUID(int=identifier)
            record.created_at = created_at
            session.add(record)
            cases.append(record)
        session.flush()
        for case_index, created_at, correct in [
            (3, window_start, True),  # An old case still contributes its in-window attempt.
            (3, window_start - timedelta(seconds=1), True),
            (3, fixed_end - timedelta(days=1), False),
            (0, fixed_end - timedelta(days=2), False),
            (0, fixed_end, True),
            (1, fixed_end + timedelta(seconds=1), True),
        ]:
            session.add(ClinicalCaseAttempt(
                clinical_case_id=cases[case_index].id,
                diagnosis="private diagnosis that must not be returned",
                score=100 if correct else 0,
                is_correct=correct,
                created_at=created_at,
            ))
        session.commit()

    response = client.get("/api/v1/analytics?days=30", headers={"X-Author-Key": "analytics-secret"})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    result = response.json()
    assert set(result) == {
        "days", "start_at", "end_at", "case_count", "attempt_count",
        "correct_attempt_count", "correct_percentage",
    }
    assert result["days"] == 30
    assert datetime.fromisoformat(result["start_at"]) == window_start
    assert datetime.fromisoformat(result["end_at"]) == fixed_end
    assert result["case_count"] == 1
    assert result["attempt_count"] == 3
    assert result["correct_attempt_count"] == 1
    assert result["correct_percentage"] == 33.3
    assert "private diagnosis" not in response.text
    assert str(older_case_id) not in response.text


def test_analytics_empty_counts_and_days_validation(postgres, client, monkeypatch):
    monkeypatch.setenv("AUTHOR_API_KEY", "analytics-secret")
    headers = {"X-Author-Key": "analytics-secret"}
    for days in [7, 30, 90]:
        response = client.get("/api/v1/analytics", params={"days": days}, headers=headers)
        assert response.status_code == 200
        assert response.json()["days"] == days
    empty = client.get("/api/v1/analytics", headers=headers)
    assert empty.status_code == 200
    assert empty.json()["case_count"] == 0
    assert empty.json()["attempt_count"] == 0
    assert empty.json()["correct_attempt_count"] == 0
    assert empty.json()["correct_percentage"] is None
    for days in ["6", "14", "91", "0", "-7", "abc"]:
        assert client.get("/api/v1/analytics", params={"days": days}, headers=headers).status_code == 422


def test_extraction_success_requires_review(client, monkeypatch):
    async def extract(source_text):
        assert source_text == "Synthetic clinical source text."
        return ClinicalCaseDraft(title="Fever", vignette="Synthetic fever.", symptoms=["Fever"])
    monkeypatch.setattr(llm, "extract_case", extract)
    response = client.post("/api/v1/clinical-cases/extract", json={"source_text": " Synthetic clinical source text. "})
    assert response.status_code == 200
    assert response.json()["draft"]["age_years"] is None
    assert response.json()["warnings"] == ["Review the draft for accuracy and remove any revealed diagnosis before saving."]


@pytest.mark.parametrize("exception,status,code", [
    (llm.ExtractionFailed, 502, "extraction_failed"),
    (llm.ExtractionUnavailable, 503, "extraction_unavailable"),
    (llm.ExtractionTimeout, 504, "extraction_timeout"),
])
def test_extraction_errors_are_sanitized(client, monkeypatch, exception, status, code):
    async def extract(source_text):
        raise exception("SECRET_PROVIDER_DETAILS")
    monkeypatch.setattr(llm, "extract_case", extract)
    response = client.post("/api/v1/clinical-cases/extract", json={"source_text": "Synthetic clinical source text."})
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert "SECRET_PROVIDER_DETAILS" not in response.text


def test_database_error_is_sanitized(client):
    def unavailable():
        raise OperationalError("SECRET_SQL", {}, Exception("SECRET_DATABASE"))
        yield
    app.dependency_overrides[get_session] = unavailable
    try:
        response = client.get("/ready")
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "database_unavailable"
        assert "SECRET" not in response.text
    finally:
        app.dependency_overrides.clear()


def test_database_constraints_reject_invalid_scores(postgres):
    engine, _ = postgres
    with engine.connect() as connection:
        with pytest.raises(IntegrityError) as error:
            connection.execute(text("INSERT INTO clinical_case_attempts (id, clinical_case_id, diagnosis, score, is_correct, created_at) VALUES (:id, :case_id, 'Flu', 50, true, now())"), {"id": uuid4(), "case_id": uuid4()})
        assert error.value.orig.sqlstate == "23514"
        assert error.value.orig.diag.constraint_name in {"ck_attempt_score", "ck_attempt_consistency"}


@pytest.mark.parametrize("field,value", [
    ("title", "bad\x00title"),
    ("vignette", "bad\x00vignette"),
    ("symptoms", ["bad\x00symptom"]),
    ("reference_diagnosis", "bad\x00reference"),
    ("accepted_answers", ["bad\x00answer"]),
])
def test_persisted_case_text_rejects_nul_before_sql(postgres, client, field, value):
    engine, _ = postgres
    response = client.post("/api/v1/clinical-cases", json=VALID_CASE | {field: value})
    assert response.status_code == 422
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(ClinicalCaseRecord)) == 0


def test_attempt_rejects_nul_without_persisting(postgres, client):
    engine, _ = postgres
    case = client.post("/api/v1/clinical-cases", json=VALID_CASE).json()
    response = client.post(f"/api/v1/clinical-cases/{case['id']}/attempts", json={"diagnosis": "Flu\x00"})
    assert response.status_code == 422
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(ClinicalCaseAttempt)) == 0


def test_catalog_order_pagination_and_hidden_answers(postgres, client, monkeypatch):
    engine, _ = postgres
    assert client.get("/api/v1/clinical-cases").json() == {"items": [], "has_more": False}
    with Session(engine) as session:
        for identifier, day in [(1, 2), (2, 1), (3, 2)]:
            record = build_case(ClinicalCaseCreate(**VALID_CASE))
            record.id = UUID(int=identifier)
            record.created_at = datetime(2026, 1, day, tzinfo=timezone.utc)
            session.add(record)
        session.commit()
    monkeypatch.setenv("AUTHOR_API_KEY", "catalog-is-public")
    first = client.get("/api/v1/clinical-cases?page_size=2").json()
    second = client.get("/api/v1/clinical-cases?page_size=2&page=2").json()
    assert [case["id"] for case in first["items"] + second["items"]] == [str(UUID(int=i)) for i in [3, 1, 2]]
    assert first["has_more"] is True
    assert second["has_more"] is False
    for case in first["items"] + second["items"]:
        assert set(case) == {"id", "title", "vignette", "symptoms", "age_years", "created_at"}
        assert case["symptoms"] == ["Fever", "Cough"]
    assert client.get("/api/v1/clinical-cases?page=3&page_size=2").json() == {"items": [], "has_more": False}


@pytest.mark.parametrize("query", ["page=0", "page=-1", "page=1000001", "page=x", "page_size=0", "page_size=101"])
def test_catalog_rejects_invalid_pagination(client, query):
    assert client.get(f"/api/v1/clinical-cases?{query}").status_code == 422


def test_catalog_search_is_literal_public_and_paginated(postgres, client):
    for title, vignette in [("Fever follow-up", "Public note"), ("Unrelated title", "A FEVER started yesterday"), ("Oxygen 98%_room/air", "Unrelated description")]:
        response = client.post("/api/v1/clinical-cases", json=VALID_CASE | {
            "title": title, "vignette": vignette,
            "reference_diagnosis": "hidden-reference", "accepted_answers": ["hidden-synonym"],
        })
        assert response.status_code == 201
    params = {"q": "  fEvEr  ", "page_size": 1}
    first = client.get("/api/v1/clinical-cases", params=params).json()
    second = client.get("/api/v1/clinical-cases", params=params | {"page": 2}).json()
    assert len(first["items"]) == len(second["items"]) == 1
    assert first["items"][0]["id"] != second["items"][0]["id"]
    assert first["has_more"] and not second["has_more"]
    for term in ["%", "_", "/", "%_room/air"]:
        matches = client.get("/api/v1/clinical-cases", params={"q": term}).json()["items"]
        assert [item["title"] for item in matches] == ["Oxygen 98%_room/air"]
    for term in ["missing", "hidden-reference", "hidden-synonym"]:
        assert client.get("/api/v1/clinical-cases", params={"q": term}).json() == {"items": [], "has_more": False}
    assert len(client.get("/api/v1/clinical-cases", params={"q": "   "}).json()["items"]) == 3


@pytest.mark.parametrize("query", ["x" * 201, "bad\x00query"])
def test_catalog_rejects_invalid_search(client, query):
    assert client.get("/api/v1/clinical-cases", params={"q": query}).status_code == 422
