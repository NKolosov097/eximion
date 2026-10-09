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
    assert client.put(url,json=VALID_CASE,headers=alice).status_code == 200
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


def test_concurrent_attempt_preserves_snapshot_before_owner_edit(client, monkeypatch, postgres):
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
        edit = pool.submit(client.put,url,json={**VALID_CASE,"reference_diagnosis":"Asthma","accepted_answers":[]},headers=alice)
        assert editing.wait(10)
        release.set()
        result = attempt.result(timeout=10)
        assert result.status_code == 201
        assert result.json()["accepted_diagnoses"] == ["Influenza", "Flu"]
        assert edit.result(timeout=10).status_code == 200
    assert client.get(url).json()["revision"] == 2
    with Session(postgres[0]) as session:
        saved = session.scalar(select(ClinicalCaseAttempt))
        assert saved.case_snapshot["revision"] == 1 and saved.score == 100


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
        assert attempt.case_snapshot["title"] == "Old case"
        assert attempt.case_snapshot["accepted_diagnoses"] == ["Flu"]
        assert record.revision == 1
        assert attempt.user_id is None and attempt.alternative_diagnoses == [] and attempt.reasoning == "" and attempt.score == 100


def test_case_revisions_preserve_history_reject_stale_and_hide(client, postgres):
    alice, bob = register(client), register(client, "bobby")
    case = client.post("/api/v1/clinical-cases", json=VALID_CASE, headers=alice).json()
    url = f"/api/v1/clinical-cases/{case['id']}"
    owner = client.get(url + "/management", headers=alice)
    assert owner.json() == {"can_edit": True, "can_hide": True}
    assert owner.headers["cache-control"] == "no-store"
    assert client.get(url + "/management", headers=bob).json() == {"can_edit": False, "can_hide": False}
    assert client.get(url + "/management").status_code == 401
    first = client.post(url + "/attempts", headers=bob, json={"diagnosis": "Flu", "case_revision": 1})
    assert first.status_code == 201 and first.json()["score"] == 100
    before = client.get("/api/v1/profile", headers=bob).json()["attempts"][0]
    assert before["case_snapshot"]["accepted_diagnoses"] == ["Influenza", "Flu"]
    updated = {**VALID_CASE, "title": "Changed case", "vignette": "New case description", "reference_diagnosis": "Asthma", "accepted_answers": []}
    assert client.put(url, json=updated, headers=alice).json()["revision"] == 2
    history = client.get("/api/v1/profile", headers=bob).json()
    old = history["attempts"][0]
    assert old["case_snapshot"] == before["case_snapshot"] and old["title"] == case["title"]
    assert old["case_updated"] and old["score"] == 100 and history["points"] == 100
    catalog = client.get("/api/v1/clinical-cases", headers=bob).json()["items"][0]
    assert catalog["latest_score"] == 100 and catalog["latest_score_is_previous_version"]
    stale = client.post(url + "/attempts", headers=bob, json={"diagnosis": "Flu", "case_revision": 1})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "case_changed"
    assert client.get("/api/v1/profile", headers=bob).json()["attempt_count"] == 1
    assert client.post(url + "/attempts", headers=bob, json={"diagnosis": "Asthma", "case_revision": 2}).json()["score"] == 100
    assert not client.get("/api/v1/clinical-cases", headers=bob).json()["items"][0]["latest_score_is_previous_version"]
    assert client.get("/api/v1/profile", headers=alice).json()["cases"][0]["can_edit"]
    assert "case_snapshot" not in client.get(url).json() and "reference_diagnosis" not in client.get(url).json()
    assert client.put(url, json=updated, headers=bob).status_code == 404
    assert client.delete(url, headers=bob).status_code == 404
    assert client.delete(url, headers=alice).status_code == 200
    assert client.get(url + "/management", headers=alice).json() == {"can_edit": False, "can_hide": False}
    assert client.get("/api/v1/clinical-cases").json()["items"] == []
    assert client.put(url, json=updated, headers=alice).status_code == 409
    assert client.post(url + "/attempts", headers=bob, json={"diagnosis": "Asthma", "case_revision": 2}).status_code == 409
    assert client.get("/api/v1/profile", headers=bob).json()["points"] == 200


def test_rolling_deployment_null_snapshot_frozen_before_edit(client, postgres):
    alice = register(client)
    case = client.post("/api/v1/clinical-cases", json=VALID_CASE, headers=alice).json()
    with Session(postgres[0]) as session:
        attempt = ClinicalCaseAttempt(clinical_case_id=UUID(case["id"]), diagnosis="Flu", score=100, is_correct=True)
        session.add(attempt)
        session.commit()
        attempt_id = attempt.id
        assert attempt.case_snapshot is None
    url = f"/api/v1/clinical-cases/{case['id']}"
    assert client.put(url, headers=alice, json={**VALID_CASE, "title": "Later title"}).status_code == 200
    with Session(postgres[0]) as session:
        attempt = session.get(ClinicalCaseAttempt, attempt_id)
        assert attempt.case_snapshot["title"] == case["title"] and attempt.case_snapshot["revision"] == 1
        assert attempt.score == 100


def test_concurrent_edit_rejects_waiting_stale_answer(client, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event, Lock
    from app import main
    alice = register(client)
    case = client.post("/api/v1/clinical-cases", json=VALID_CASE, headers=alice).json()
    url = f"/api/v1/clinical-cases/{case['id']}"
    original = main.locked_case
    locked, waiting, release = Event(), Event(), Event()
    mutex = Lock()
    calls = 0
    def coordinated(case_id, session):
        nonlocal calls
        with mutex:
            calls += 1
            first = calls == 1
        if not first: waiting.set()
        record = original(case_id, session)
        if first:
            locked.set()
            assert release.wait(10)
        return record
    monkeypatch.setattr(main, "locked_case", coordinated)
    with ThreadPoolExecutor(max_workers=2) as pool:
        edit = pool.submit(client.put, url, json={**VALID_CASE, "title": "Changed title"}, headers=alice)
        assert locked.wait(10)
        attempt = pool.submit(client.post, url + "/attempts", json={"diagnosis": "Flu", "case_revision": 1}, headers=alice)
        assert waiting.wait(10)
        release.set()
        assert edit.result(timeout=10).status_code == 200
        assert attempt.result(timeout=10).json()["error"]["code"] == "case_changed"
    assert client.get("/api/v1/profile", headers=alice).json()["attempt_count"] == 0
