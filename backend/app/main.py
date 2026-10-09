import os
import secrets
from datetime import timedelta
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import llm
from app.auth import router as auth_router, OptionalUser, CurrentUser
from app.errors import APIError
from app.cases import build_case, normalize_diagnosis, public_case
from app.database import commit, get_session
from app.models import ClinicalCaseAttempt, ClinicalCaseRecord, utc_now
from app.schemas import Account, AttemptHistory, CaseManagement, CaseSnapshot, OwnedCase, Profile, AnalyticsSummary, AttemptCreate, AttemptResult, ClinicalCase, ClinicalCaseCreate, ClinicalCasePage, ErrorResponse, ExtractionRequest, ExtractionResponse
from app.telemetry import TelemetryMiddleware, set_request_error, traced


app = FastAPI(title="Clinical Cases API - Test Assignment for Eximion", version="1.0.0")
CORS_ORIGINS = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Author-Key", "Authorization", "traceparent"],
    expose_headers=["Location", "X-Trace-ID"],
)
app.add_middleware(TelemetryMiddleware, cors_origins=CORS_ORIGINS)
SessionDependency = Annotated[Session, Depends(get_session)]
DATABASE_ERRORS: dict[int | str, dict[str, Any]] = {503: {"model": ErrorResponse}}
CASE_ERRORS: dict[int | str, dict[str, Any]] = {404: {"model": ErrorResponse}, **DATABASE_ERRORS}


app.include_router(auth_router)


@app.exception_handler(APIError)
@traced("error.handle")
async def api_error_handler(request: Request, exc: APIError):
    set_request_error(exc)
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})


@app.exception_handler(SQLAlchemyError)
@traced("error.database")
async def database_error_handler(request: Request, exc: SQLAlchemyError):
    set_request_error(exc)
    return JSONResponse(status_code=503, content={"error": {"code": "database_unavailable", "message": "The database is temporarily unavailable."}})


@app.exception_handler(RequestValidationError)
@traced("request.validate", status=422)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    set_request_error(exc)
    # Validation must never echo clinical text, credentials, or unknown request fields.
    details = [{"type": error["type"], "loc": error["loc"], "msg": error["msg"]} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": details})


@traced("author.authorize")
def require_author(x_author_key: Annotated[str | None, Header()] = None):
    check_author_key(x_author_key)


@traced("author.authorize")
def require_configured_author(x_author_key: Annotated[str | None, Header()] = None):
    if not os.environ.get("AUTHOR_API_KEY"):
        raise APIError(503, "author_unavailable", "Author access is not configured.")
    check_author_key(x_author_key)


def check_author_key(x_author_key: str | None):
    expected = os.environ.get("AUTHOR_API_KEY")
    if expected and (x_author_key is None or not secrets.compare_digest(x_author_key.encode(), expected.encode())):
        raise APIError(401, "unauthorized", "A valid author key is required.")


@traced("case.load")
def find_case(case_id: UUID, session: Session) -> ClinicalCaseRecord:
    record = session.get(ClinicalCaseRecord, case_id)
    if record is None:
        raise APIError(404, "case_not_found", "Clinical case not found.")
    return record


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready", responses=DATABASE_ERRORS)
@traced("database.ready")
def ready(session: SessionDependency):
    session.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.post("/api/v1/clinical-cases/extract", response_model=ExtractionResponse, dependencies=[Depends(require_author)], responses={status: {"model": ErrorResponse} for status in (401, 502, 503, 504)})
@traced("case.extract")
async def extract_clinical_case(data: ExtractionRequest):
    try:
        draft = await llm.extract_case(data.source_text)
    except llm.ExtractionTimeout:
        raise APIError(504, "extraction_timeout", "Case extraction timed out. Please try again.") from None
    except llm.ExtractionUnavailable:
        raise APIError(503, "extraction_unavailable", "Case extraction is temporarily unavailable.") from None
    except llm.ExtractionFailed:
        raise APIError(502, "extraction_failed", "Case extraction failed. Please review the source text and try again.") from None
    return ExtractionResponse(draft=draft, warnings=["Review the draft for accuracy and remove any revealed diagnosis before saving."])


@app.post("/api/v1/clinical-cases", response_model=ClinicalCase, status_code=201, dependencies=[Depends(require_author)], responses={401: {"model": ErrorResponse}, **DATABASE_ERRORS})
@traced("case.create")
def create_clinical_case(data: ClinicalCaseCreate, response: Response, session: SessionDependency, user: OptionalUser):
    require_guest_ack(user, data.guest_acknowledged)
    record = build_case(data)
    record.owner_id = user.id if user else None
    session.add(record)
    commit(session)
    response.headers["Location"] = f"/api/v1/clinical-cases/{record.id}"
    return public_case(record)


@app.get("/api/v1/clinical-cases", response_model=ClinicalCasePage, responses=DATABASE_ERRORS)
@traced("case.list")
def list_clinical_cases(
    session: SessionDependency,
    user: OptionalUser,
    response: Response,
    answered: Literal["all", "answered", "unanswered"] = "all",
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Annotated[str, Query(max_length=200, pattern=r"^[^\x00]*$", description="Case-insensitive literal search in public titles and vignettes.")] = "",
):
    response.headers["Cache-Control"] = "no-store"
    if answered != "all" and user is None:
        raise APIError(401, "sign_in_required", "Sign in to filter your answers.")
    query = select(ClinicalCaseRecord).where(ClinicalCaseRecord.archived_at.is_(None))
    own_attempt = select(ClinicalCaseAttempt.id).where(ClinicalCaseAttempt.clinical_case_id == ClinicalCaseRecord.id, ClinicalCaseAttempt.user_id == user.id).exists() if user else None
    if answered == "answered" and own_attempt is not None:
        query = query.where(own_attempt)
    elif answered == "unanswered" and own_attempt is not None:
        query = query.where(~own_attempt)
    if term := q.strip():
        query = query.where(or_(
            ClinicalCaseRecord.title.icontains(term, autoescape=True),
            ClinicalCaseRecord.vignette.icontains(term, autoescape=True),
        ))
    records = session.scalars(
        query
        .order_by(ClinicalCaseRecord.created_at.desc(), ClinicalCaseRecord.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size + 1)
    ).all()
    items = [public_case(record) for record in records[:page_size]]
    if user and items:
        latest = session.execute(select(ClinicalCaseAttempt.clinical_case_id, ClinicalCaseAttempt.score, ClinicalCaseAttempt.case_snapshot)
            .where(ClinicalCaseAttempt.user_id == user.id, ClinicalCaseAttempt.clinical_case_id.in_([item.id for item in items]))
            .distinct(ClinicalCaseAttempt.clinical_case_id)
            .order_by(ClinicalCaseAttempt.clinical_case_id, ClinicalCaseAttempt.created_at.desc(), ClinicalCaseAttempt.id.desc())).all()
        scores = cast(dict[UUID, tuple[int, dict | None]], {case_id: (score, snapshot) for case_id, score, snapshot in latest})
        for item in items:
            if item.id in scores:
                score, snapshot = scores[item.id]
                item.latest_score = cast(Literal[0, 100], score)
                item.latest_score_is_previous_version = snapshot is not None and snapshot["revision"] != item.revision
    return ClinicalCasePage(
        items=items,
        has_more=len(records) > page_size,
    )


@app.get("/api/v1/analytics", response_model=AnalyticsSummary, dependencies=[Depends(require_configured_author)], responses={401: {"model": ErrorResponse}, 503: {"model": ErrorResponse}})
@traced("analytics.read")
def get_analytics(
    response: Response,
    session: SessionDependency,
    days: Annotated[Literal["7", "30", "90"], Query()] = "30",
):
    period_days = cast(Literal[7, 30, 90], int(days))
    end_at = utc_now()
    start_at = end_at - timedelta(days=period_days)
    in_period = (ClinicalCaseRecord.created_at >= start_at, ClinicalCaseRecord.created_at < end_at)
    attempt_period = (ClinicalCaseAttempt.created_at >= start_at, ClinicalCaseAttempt.created_at < end_at)
    case_count = session.scalar(select(func.count()).select_from(ClinicalCaseRecord).where(*in_period)) or 0
    attempt_counts = session.execute(
        select(
            func.count().label("attempt_count"),
            func.count().filter(ClinicalCaseAttempt.is_correct.is_(True)).label("correct_attempt_count"),
        ).select_from(ClinicalCaseAttempt).where(*attempt_period)
    ).one()
    attempt_count = attempt_counts.attempt_count
    correct_attempt_count = attempt_counts.correct_attempt_count
    response.headers["Cache-Control"] = "no-store"
    return AnalyticsSummary(
        days=period_days,
        start_at=start_at,
        end_at=end_at,
        case_count=case_count,
        attempt_count=attempt_count,
        correct_attempt_count=correct_attempt_count,
        correct_percentage=round(correct_attempt_count * 100 / attempt_count, 1) if attempt_count else None,
    )


@app.get("/api/v1/clinical-cases/{id}", response_model=ClinicalCase, responses=CASE_ERRORS)
@traced("case.read")
def get_clinical_case(id: UUID, session: SessionDependency):
    return public_case(find_case(id, session))


@app.post("/api/v1/clinical-cases/{id}/attempts", response_model=AttemptResult, status_code=201, responses=CASE_ERRORS)
@traced("case.attempt")
def create_attempt(id: UUID, data: AttemptCreate, session: SessionDependency, user: OptionalUser):
    require_guest_ack(user, data.guest_acknowledged)
    record = locked_case(id, session)
    if record.archived_at is not None:
        raise APIError(409, "case_archived", "This case is archived and no longer accepts answers.")
    if data.case_revision is not None and data.case_revision != record.revision:
        raise APIError(409, "case_changed", "This case has changed. Refresh the case and review it before submitting again.")
    snapshot = snapshot_case(record)
    matched_alternatives = [diagnosis for diagnosis in data.alternative_diagnoses if grade(record, diagnosis)]
    is_correct = grade(record, data.diagnosis)
    score: Literal[0, 100] = 100 if is_correct else 0
    attempt = ClinicalCaseAttempt(case_snapshot=snapshot.model_dump(), clinical_case_id=id, diagnosis=data.diagnosis, score=score, is_correct=is_correct, user_id=user.id if user else None, alternative_diagnoses=data.alternative_diagnoses, reasoning=data.reasoning)
    session.add(attempt)
    commit(session)
    return AttemptResult(
        id=attempt.id, clinical_case_id=id, score=score, max_score=100, is_correct=is_correct,
        feedback="Your diagnosis matches an accepted answer." if is_correct else "Your diagnosis does not match an accepted answer.",
        created_at=attempt.created_at,
        accepted_diagnoses=snapshot.accepted_diagnoses,
        matched_alternative_diagnoses=matched_alternatives,
    )


@traced("diagnosis.grade")
def grade(record: ClinicalCaseRecord, diagnosis: str) -> bool:
    accepted = {record.normalized_reference_diagnosis, *(answer.normalized_answer for answer in record.accepted_answers)}
    return normalize_diagnosis(diagnosis) in accepted


def require_guest_ack(user, acknowledged: bool):
    if user is None and not acknowledged:
        raise APIError(422, "guest_ack_required", "Confirm that this guest submission will not belong to an account.")


def locked_case(case_id: UUID, session: Session) -> ClinicalCaseRecord:
    record = session.scalar(select(ClinicalCaseRecord).where(ClinicalCaseRecord.id == case_id).with_for_update())
    if record is None:
        raise APIError(404, "case_not_found", "Clinical case not found.")
    return record


def owned_case(case_id: UUID, session: Session, user) -> ClinicalCaseRecord:
    record = locked_case(case_id, session)
    if record.owner_id != user.id:
        raise APIError(404, "case_not_found", "Clinical case not found.")
    return record


def snapshot_case(record: ClinicalCaseRecord) -> CaseSnapshot:
    return CaseSnapshot(revision=record.revision, title=record.title, vignette=record.vignette, age_years=record.age_years, symptoms=[s.text for s in record.symptoms], accepted_diagnoses=[record.reference_diagnosis, *[a.answer for a in record.accepted_answers]])


def can_edit(record: ClinicalCaseRecord) -> bool:
    return record.archived_at is None


@app.get("/api/v1/profile", response_model=Profile)
def profile(user: CurrentUser, response: Response, session: SessionDependency, page: Annotated[int, Query(ge=1, le=1000000)] = 1, case_page: Annotated[int, Query(ge=1, le=1000000)] = 1):
    response.headers["Cache-Control"] = "no-store"
    counts = session.execute(select(func.count(), func.count().filter(ClinicalCaseAttempt.is_correct.is_(True)), func.coalesce(func.sum(ClinicalCaseAttempt.score), 0)).where(ClinicalCaseAttempt.user_id == user.id)).one()
    rows = session.execute(select(ClinicalCaseAttempt, ClinicalCaseRecord).join(ClinicalCaseRecord).where(ClinicalCaseAttempt.user_id == user.id).order_by(ClinicalCaseAttempt.created_at.desc(), ClinicalCaseAttempt.id.desc()).offset((page - 1) * 20).limit(21)).all()
    cases = session.scalars(select(ClinicalCaseRecord).where(ClinicalCaseRecord.owner_id == user.id).order_by(ClinicalCaseRecord.created_at.desc(), ClinicalCaseRecord.id.desc()).offset((case_page - 1) * 20).limit(21)).all()
    return Profile(user=Account(id=user.id, username=user.username), attempt_count=counts[0], correct_count=counts[1], incorrect_count=counts[0]-counts[1], points=counts[2],
        attempts=[AttemptHistory(id=a.id, clinical_case_id=a.clinical_case_id, title=snapshot.title, case_snapshot=snapshot, case_updated=snapshot.revision != record.revision, archived=record.archived_at is not None, diagnosis=a.diagnosis, alternative_diagnoses=a.alternative_diagnoses, reasoning=a.reasoning, score=a.score, is_correct=a.is_correct, created_at=a.created_at) for a, record in rows[:20] for snapshot in [CaseSnapshot.model_validate(a.case_snapshot) if a.case_snapshot else snapshot_case(record)]], has_more=len(rows)>20,
        cases=[OwnedCase(id=c.id, title=c.title, archived=c.archived_at is not None, can_edit=can_edit(c)) for c in cases[:20]], cases_has_more=len(cases)>20)


@app.get("/api/v1/clinical-cases/{id}/management", response_model=CaseManagement)
def case_management(id: UUID, user: CurrentUser, response: Response, session: SessionDependency):
    response.headers["Cache-Control"] = "no-store"
    record = find_case(id, session)
    allowed = record.owner_id == user.id and record.archived_at is None
    return CaseManagement(can_edit=allowed, can_hide=allowed)


@app.get("/api/v1/clinical-cases/{id}/edit", response_model=ClinicalCaseCreate)
def read_owned_case(id: UUID, user: CurrentUser, response: Response, session: SessionDependency):
    response.headers["Cache-Control"] = "no-store"
    record = owned_case(id, session, user)
    if not can_edit(record):
        raise APIError(409, "case_locked", "Hidden cases cannot be edited.")
    return ClinicalCaseCreate(title=record.title, vignette=record.vignette, age_years=record.age_years, symptoms=[s.text for s in record.symptoms], reference_diagnosis=record.reference_diagnosis, accepted_answers=[a.answer for a in record.accepted_answers])


@app.put("/api/v1/clinical-cases/{id}", response_model=ClinicalCase)
def update_owned_case(id: UUID, data: ClinicalCaseCreate, user: CurrentUser, session: SessionDependency):
    record = owned_case(id, session, user)
    if not can_edit(record):
        raise APIError(409, "case_locked", "Hidden cases cannot be edited.")
    # Old service revisions may still create snapshot-free attempts during rollout.
    legacy = session.scalars(select(ClinicalCaseAttempt).where(ClinicalCaseAttempt.clinical_case_id == id, ClinicalCaseAttempt.case_snapshot.is_(None))).all()
    if legacy:
        snapshot = snapshot_case(record).model_dump()
        for attempt in legacy:
            attempt.case_snapshot = snapshot
    replacement = build_case(data)
    record.revision += 1
    for field in ("title", "vignette", "age_years", "reference_diagnosis", "normalized_reference_diagnosis"):
        setattr(record, field, getattr(replacement, field))
    record.symptoms.clear()
    record.accepted_answers.clear()
    session.flush()
    record.symptoms = replacement.symptoms
    record.accepted_answers = replacement.accepted_answers
    commit(session)
    return public_case(record)


@app.delete("/api/v1/clinical-cases/{id}")
def archive_owned_case(id: UUID, user: CurrentUser, session: SessionDependency):
    record = owned_case(id, session, user)
    record.archived_at = record.archived_at or utc_now()
    commit(session)
    return {"archived": True}
