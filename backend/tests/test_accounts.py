from datetime import timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app.models import ClinicalCaseAttempt, ClinicalCaseRecord, User, UserSession, utc_now
from test_cases import VALID_CASE


@pytest.fixture
def client(postgres, monkeypatch):
    monkeypatch.delenv("AUTHOR_API_KEY", raising=False)
    with TestClient(app) as client:
        yield client


def register(client, name="alice"):
    result = client.post("/api/v1/auth/register", json={"username":name,"password":"synthetic-password-123"})
    assert result.status_code == 201, result.text
    return {"Authorization": "Bearer " + result.json()["session_token"]}


def test_sessions_validation_expiry_and_logout(client, postgres):
    assert client.get("/api/v1/auth/me").json() == {"user": None}
    headers = register(client, "Alice")
    assert client.get("/api/v1/auth/me",headers=headers).json()["user"]["username"] == "alice"
    assert client.post("/api/v1/auth/register",json={"username":"alice","password":"synthetic-password-123"}).status_code == 409
    wrong_password = client.post("/api/v1/auth/login",json={"username":"alice","password":"bad"})
    wrong_username = client.post("/api/v1/auth/login",json={"username":"missing","password":"synthetic-password-123"})
    assert wrong_password.status_code == wrong_username.status_code == 401
    assert wrong_password.json() == wrong_username.json() == {"error":{"code":"invalid_credentials","message":"Incorrect username or password."}}
    result = client.post("/api/v1/auth/login",json={"username":"ALICE","password":"synthetic-password-123"})
    assert result.status_code == 200
    assert client.post("/api/v1/auth/logout",headers=headers).status_code == 200
    assert client.get("/api/v1/auth/me",headers=headers).status_code == 401
    headers = {"Authorization":"Bearer " + result.json()["session_token"]}
    with Session(postgres[0]) as session:
        assert session.scalar(select(User)).password_hash != "synthetic-password-123"
        tokens = session.scalars(select(UserSession)).all()
        assert all(row.token_hash not in headers["Authorization"] for row in tokens)
        for row in tokens: row.expires_at = utc_now() - timedelta(seconds=1)
        session.commit()
    assert client.get("/api/v1/profile",headers=headers).status_code == 401
    assert client.get("/api/v1/profile").status_code == 401


def test_guest_confirmation_and_no_later_claim(client):
    payload = {**VALID_CASE,"guest_acknowledged":False}
    assert client.post("/api/v1/clinical-cases",json=payload).status_code == 422
    case = client.post("/api/v1/clinical-cases",json=VALID_CASE).json()
    url = f"/api/v1/clinical-cases/{case['id']}"
    assert client.post(url+"/attempts",json={"diagnosis":"Flu"}).status_code == 422
    assert client.post(url+"/attempts",json={"diagnosis":"Flu","guest_acknowledged":True}).status_code == 201
    headers = register(client)
    profile = client.get("/api/v1/profile",headers=headers).json()
    assert profile["attempt_count"] == 0 and profile["cases"] == []
    assert client.get(url+"/edit",headers=headers).status_code == 404
    assert client.delete(url,headers=headers).status_code == 404


def test_ownership_grading_history_filter_edit_archive(client, postgres):
    alice = register(client)
    bob = register(client,"bobby")
    case = client.post("/api/v1/clinical-cases",json=VALID_CASE,headers=alice).json()
    url = f"/api/v1/clinical-cases/{case['id']}"
    assert client.get(url+"/edit",headers=bob).status_code == 404
    assert client.put(url,json=VALID_CASE,headers=bob).status_code == 404
    assert client.put(url,json={**VALID_CASE,"title":"Updated title"},headers=alice).status_code == 200
    assert client.get(url+"/edit",headers=alice).json()["title"] == "Updated title"
    assert "reference_diagnosis" not in client.get(url).json()
    result = client.post(url+"/attempts",headers=bob,json={"diagnosis":"Cold","alternative_diagnoses":[" Flu ","Asthma"],"reasoning":" Cough and fever "}).json()
    assert result["score"] == 0 and result["matched_alternative_diagnoses"] == ["Flu"]
    assert result["accepted_diagnoses"] == ["Influenza","Flu"]
    assert client.put(url,json=VALID_CASE,headers=alice).status_code == 409
    assert client.post(url+"/attempts",headers=bob,json={"diagnosis":"Flu"}).status_code == 201
    profile = client.get("/api/v1/profile",headers=bob)
    assert profile.headers["cache-control"] == "no-store"
    data = profile.json()
    assert (data["attempt_count"],data["correct_count"],data["incorrect_count"],data["points"]) == (2,1,1,100)
    assert data["attempts"][1]["reasoning"] == "Cough and fever"
    assert data["attempts"][1]["alternative_diagnoses"] == ["Flu","Asthma"]
    assert client.get("/api/v1/profile",headers=alice).json()["attempts"] == []
    assert client.get("/api/v1/clinical-cases?answered=answered").status_code == 401
    assert client.get("/api/v1/clinical-cases?answered=answered",headers=bob).json()["items"][0]["latest_score"] == 100
    assert client.get("/api/v1/clinical-cases?answered=unanswered",headers=bob).json()["items"] == []
    assert client.get("/api/v1/clinical-cases?answered=unanswered",headers=alice).json()["items"][0]["id"] == case["id"]
    assert client.delete(url,headers=bob).status_code == 404
    assert client.delete(url,headers=alice).status_code == 200
    assert client.get(url).json()["archived"] is True
    assert client.get("/api/v1/clinical-cases").json()["items"] == []
    assert client.post(url+"/attempts",headers=bob,json={"diagnosis":"Flu"}).status_code == 409
    assert client.get("/api/v1/profile",headers=bob).json()["attempts"][0]["archived"] is True
    with Session(postgres[0]) as session:
        assert session.get(ClinicalCaseRecord,UUID(case["id"])).owner_id is not None
        assert all(row.user_id for row in session.scalars(select(ClinicalCaseAttempt)))


@pytest.mark.parametrize("extra",[{"alternative_diagnoses":["a"]*6},{"alternative_diagnoses":[""]},{"alternative_diagnoses":["a"*201]},{"reasoning":"a"*2001},{"reasoning":"bad\x00text"},{"user_id":"00000000-0000-0000-0000-000000000000"}])
def test_attempt_trust_boundary(client, extra):
    case = client.post("/api/v1/clinical-cases",json=VALID_CASE).json()
    result = client.post(f"/api/v1/clinical-cases/{case['id']}/attempts",json={"diagnosis":"Flu","guest_acknowledged":True,**extra})
    assert result.status_code == 422


def test_login_throttle_and_invalid_session_never_downgrades(client):
    register(client)
    for _ in range(9):
        assert client.post("/api/v1/auth/login",json={"username":"alice","password":"wrong-password-123"}).status_code == 401
    assert client.post("/api/v1/auth/login",json={"username":"alice","password":"synthetic-password-123"}).status_code == 429
    assert client.post("/api/v1/clinical-cases",json=VALID_CASE,headers={"Authorization":"Bearer invalid"}).status_code == 401


def test_concurrent_attempt_locks_out_owner_edit(client, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event, Lock
    from app import main
    alice = register(client)
    case = client.post("/api/v1/clinical-cases",json=VALID_CASE,headers=alice).json()
    url = f"/api/v1/clinical-cases/{case['id']}"
    original = main.locked_case
    locked, editing, release = Event(), Event(), Event()
    counter_lock = Lock()
    calls = 0
    def coordinated(case_id, session):
        nonlocal calls
        with counter_lock:
            calls += 1
            first = calls == 1
        if not first: editing.set()
        record = original(case_id, session)
        if first:
            locked.set()
            assert release.wait(10)
        return record
    monkeypatch.setattr(main,"locked_case",coordinated)
    with ThreadPoolExecutor(max_workers=2) as pool:
        attempt = pool.submit(client.post,url+"/attempts",json={"diagnosis":"Flu","guest_acknowledged":True})
        assert locked.wait(10)
        edit = pool.submit(client.put,url,json=VALID_CASE,headers=alice)
        assert editing.wait(10)
        release.set()
        assert attempt.result(timeout=10).status_code == 201
        assert edit.result(timeout=10).status_code == 409


def test_old_rows_preserved_by_account_migration(postgres):
    from alembic import command
    from sqlalchemy import text
    from uuid import uuid4
    engine, config = postgres
    command.downgrade(config,"4975e664eeb0")
    case_id, attempt_id = uuid4(), uuid4()
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO clinical_cases (id,title,vignette,reference_diagnosis,normalized_reference_diagnosis,created_at) VALUES (:id,'Old case','Old vignette','Flu','flu',now())"),{"id":case_id})
        connection.execute(text("INSERT INTO clinical_case_attempts (id,clinical_case_id,diagnosis,score,is_correct,created_at) VALUES (:id,:case,'Flu',100,true,now())"),{"id":attempt_id,"case":case_id})
    command.upgrade(config,"head")
    with Session(engine) as session:
        record = session.get(ClinicalCaseRecord,case_id)
        attempt = session.get(ClinicalCaseAttempt,attempt_id)
        assert record.title == "Old case" and record.owner_id is None and record.archived_at is None
        assert attempt.user_id is None and attempt.alternative_diagnoses == [] and attempt.reasoning == "" and attempt.score == 100
