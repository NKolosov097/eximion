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


class ClinicalCase(ClinicalCaseDraft):
    age_years: Annotated[int, Field(strict=True, ge=0, le=120)] | None
    id: UUID
    created_at: datetime


class ExtractionRequest(RequestModel):
    source_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=20000)]


class ExtractionResponse(BaseModel):
    draft: ClinicalCaseDraft
    warnings: list[str]


class AttemptCreate(RequestModel):
    diagnosis: ShortText


class AttemptResult(BaseModel):
    id: UUID
    clinical_case_id: UUID
    score: Literal[0, 100]
    max_score: Literal[100]
    is_correct: bool
    feedback: str
    created_at: datetime


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
