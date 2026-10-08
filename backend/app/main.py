import os
import secrets
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import llm
from app.cases import build_case, normalize_diagnosis, public_case
from app.database import commit, get_session
from app.models import ClinicalCaseAttempt, ClinicalCaseRecord
from app.schemas import AttemptCreate, AttemptResult, ClinicalCase, ClinicalCaseCreate, ErrorResponse, ExtractionRequest, ExtractionResponse
from app.telemetry import TelemetryMiddleware, set_request_error, traced


app = FastAPI(title="Eximion API", version="1.0.0")
CORS_ORIGINS = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Author-Key", "traceparent"],
    expose_headers=["Location", "X-Trace-ID"],
)
app.add_middleware(TelemetryMiddleware, cors_origins=CORS_ORIGINS)
SessionDependency = Annotated[Session, Depends(get_session)]
DATABASE_ERRORS: dict[int | str, dict[str, Any]] = {503: {"model": ErrorResponse}}
CASE_ERRORS: dict[int | str, dict[str, Any]] = {404: {"model": ErrorResponse}, **DATABASE_ERRORS}


class APIError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


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
def create_clinical_case(data: ClinicalCaseCreate, response: Response, session: SessionDependency):
    record = build_case(data)
    session.add(record)
    commit(session)
    response.headers["Location"] = f"/api/v1/clinical-cases/{record.id}"
    return public_case(record)


@app.get("/api/v1/clinical-cases/{id}", response_model=ClinicalCase, responses=CASE_ERRORS)
@traced("case.read")
def get_clinical_case(id: UUID, session: SessionDependency):
    return public_case(find_case(id, session))


@app.post("/api/v1/clinical-cases/{id}/attempts", response_model=AttemptResult, status_code=201, responses=CASE_ERRORS)
@traced("case.attempt")
def create_attempt(id: UUID, data: AttemptCreate, session: SessionDependency):
    record = find_case(id, session)
    is_correct = grade(record, data.diagnosis)
    score: Literal[0, 100] = 100 if is_correct else 0
    attempt = ClinicalCaseAttempt(clinical_case_id=id, diagnosis=data.diagnosis, score=score, is_correct=is_correct)
    session.add(attempt)
    commit(session)
    return AttemptResult(
        id=attempt.id, clinical_case_id=id, score=score, max_score=100, is_correct=is_correct,
        feedback="Your diagnosis matches an accepted answer." if is_correct else "Your diagnosis does not match an accepted answer.",
        created_at=attempt.created_at,
    )


@traced("diagnosis.grade")
def grade(record: ClinicalCaseRecord, diagnosis: str) -> bool:
    accepted = {record.normalized_reference_diagnosis, *(answer.normalized_answer for answer in record.accepted_answers)}
    return normalize_diagnosis(diagnosis) in accepted
