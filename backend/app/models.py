from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String(32), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class UserSession(Base):
    __tablename__ = "user_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class AuthThrottle(Base):
    __tablename__ = "auth_throttles"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ClinicalCaseRecord(Base):
    __tablename__ = "clinical_cases"
    __table_args__ = (
        CheckConstraint("age_years IS NULL OR age_years BETWEEN 0 AND 120", name="ck_case_age"),
        CheckConstraint("char_length(title) BETWEEN 1 AND 120", name="ck_case_title"),
        CheckConstraint("char_length(vignette) BETWEEN 1 AND 8000", name="ck_case_vignette"),
        CheckConstraint("char_length(reference_diagnosis) BETWEEN 1 AND 200", name="ck_case_reference"),
        CheckConstraint("char_length(normalized_reference_diagnosis) > 0", name="ck_case_normalized_reference"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    title: Mapped[str] = mapped_column(String(120))
    vignette: Mapped[str] = mapped_column(Text)
    age_years: Mapped[int | None] = mapped_column(Integer)
    reference_diagnosis: Mapped[str] = mapped_column(String(200))
    normalized_reference_diagnosis: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    symptoms: Mapped[list[ClinicalCaseSymptom]] = relationship(
        cascade="all, delete-orphan", order_by="ClinicalCaseSymptom.position", lazy="selectin"
    )
    accepted_answers: Mapped[list[ClinicalCaseAcceptedAnswer]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


class ClinicalCaseSymptom(Base):
    __tablename__ = "clinical_case_symptoms"
    __table_args__ = (
        CheckConstraint("position BETWEEN 0 AND 19", name="ck_symptom_position"),
        CheckConstraint("char_length(text) BETWEEN 1 AND 200", name="ck_symptom_text"),
    )
    clinical_case_id: Mapped[UUID] = mapped_column(ForeignKey("clinical_cases.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str] = mapped_column(String(200))


class ClinicalCaseAcceptedAnswer(Base):
    __tablename__ = "clinical_case_accepted_answers"
    __table_args__ = (
        UniqueConstraint("clinical_case_id", "normalized_answer", name="uq_case_normalized_answer"),
        CheckConstraint("char_length(answer) BETWEEN 1 AND 200", name="ck_answer_text"),
        CheckConstraint("char_length(normalized_answer) > 0", name="ck_answer_normalized"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    clinical_case_id: Mapped[UUID] = mapped_column(ForeignKey("clinical_cases.id", ondelete="CASCADE"), index=True)
    answer: Mapped[str] = mapped_column(String(200))
    normalized_answer: Mapped[str] = mapped_column(Text)


class ClinicalCaseAttempt(Base):
    __tablename__ = "clinical_case_attempts"
    __table_args__ = (
        CheckConstraint("char_length(diagnosis) BETWEEN 1 AND 200", name="ck_attempt_diagnosis"),
        CheckConstraint("score IN (0, 100)", name="ck_attempt_score"),
        CheckConstraint("(is_correct AND score = 100) OR (NOT is_correct AND score = 0)", name="ck_attempt_consistency"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    clinical_case_id: Mapped[UUID] = mapped_column(ForeignKey("clinical_cases.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    alternative_diagnoses: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    reasoning: Mapped[str] = mapped_column(Text, default="", server_default="")
    diagnosis: Mapped[str] = mapped_column(String(200))
    score: Mapped[int] = mapped_column(Integer)
    is_correct: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
