from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.telemetry import operation


Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120, pattern=r"^[^\x00]*$")]
Vignette = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000, pattern=r"^[^\x00]*$")]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200, pattern=r"^[^\x00]*$")]


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="wrap")
    @classmethod
    def trace_validation(cls, data, handler):
        if cls.__name__ in {"ClinicalCaseCreate", "ExtractionRequest", "AttemptCreate"}:
            with operation("request.validate", validation_error_status=422):
                return handler(data)
        return handler(data)


class ClinicalCaseDraft(RequestModel):
    title: Title
    vignette: Vignette
    symptoms: Annotated[list[ShortText], Field(min_length=1, max_length=20)]
    age_years: Annotated[int, Field(strict=True, ge=0, le=120)] | None = None


class ClinicalCaseCreate(ClinicalCaseDraft):
    reference_diagnosis: ShortText
    accepted_answers: Annotated[list[ShortText], Field(max_length=20)] = Field(default_factory=list)
    guest_acknowledged: bool = False


class ClinicalCase(ClinicalCaseDraft):
    age_years: Annotated[int, Field(strict=True, ge=0, le=120)] | None
    id: UUID
    created_at: datetime
    archived: bool = False
    latest_score: Literal[0, 100] | None = None


class ClinicalCasePage(BaseModel):
    items: list[ClinicalCase]
    has_more: bool


class ExtractionRequest(RequestModel):
    source_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=20000)]


class ExtractionResponse(BaseModel):
    draft: ClinicalCaseDraft
    warnings: list[str]


class AttemptCreate(RequestModel):
    diagnosis: ShortText
    alternative_diagnoses: Annotated[list[ShortText], Field(max_length=5)] = Field(default_factory=list)
    reasoning: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000, pattern=r"^[^\x00]*$")] = ""
    guest_acknowledged: bool = False


class Credentials(RequestModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")]
    password: Annotated[str, StringConstraints(min_length=12, max_length=128, pattern=r"^[^\x00]*$")]


class LoginCredentials(RequestModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")]
    password: Annotated[str, StringConstraints(min_length=1, max_length=128, pattern=r"^[^\x00]*$")]


class Account(BaseModel):
    id: UUID
    username: str


class CurrentAccount(BaseModel):
    user: Account | None


class AuthSession(BaseModel):
    user: Account
    session_token: str


class AttemptHistory(BaseModel):
    id: UUID
    clinical_case_id: UUID
    title: str
    archived: bool
    diagnosis: str
    alternative_diagnoses: list[str]
    reasoning: str
    score: Literal[0, 100]
    is_correct: bool
    created_at: datetime


class OwnedCase(BaseModel):
    id: UUID
    title: str
    archived: bool
    can_edit: bool


class Profile(BaseModel):
    user: Account
    attempt_count: int
    correct_count: int
    incorrect_count: int
    points: int
    attempts: list[AttemptHistory]
    has_more: bool
    cases: list[OwnedCase]
    cases_has_more: bool


class AttemptResult(BaseModel):
    accepted_diagnoses: list[str]
    matched_alternative_diagnoses: list[str]
    id: UUID
    clinical_case_id: UUID
    score: Literal[0, 100]
    max_score: Literal[100]
    is_correct: bool
    feedback: str
    created_at: datetime


class AnalyticsSummary(BaseModel):
    days: Literal[7, 30, 90]
    start_at: datetime
    end_at: datetime
    case_count: Annotated[int, Field(ge=0)]
    attempt_count: Annotated[int, Field(ge=0)]
    correct_attempt_count: Annotated[int, Field(ge=0)]
    correct_percentage: Annotated[float, Field(ge=0, le=100)] | None


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
