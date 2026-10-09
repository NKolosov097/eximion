import pytest
from pydantic import ValidationError

from app.cases import build_case, normalize_diagnosis
from app.schemas import ClinicalCaseCreate, ClinicalCaseDraft


VALID_CASE = {
    "guest_acknowledged": True,
    "title": " Fever and cough ",
    "vignette": "A synthetic adult presents with fever and cough.",
    "symptoms": [" Fever ", "Cough"],
    "age_years": 28,
    "reference_diagnosis": "Influenza",
    "accepted_answers": ["Flu", " FLU ", "INFLUENZA"],
}


def test_unicode_normalization_is_exact_and_deduplicates():
    assert normalize_diagnosis("  ＦＬＵ\u00a0\t A  ") == "flu a"
    assert normalize_diagnosis("Straße") == "strasse"
    assert normalize_diagnosis("Flu.") != normalize_diagnosis("Flu")
    assert normalize_diagnosis("café") != normalize_diagnosis("cafe")
    record = build_case(ClinicalCaseCreate(**VALID_CASE))
    assert record.title == "Fever and cough"
    assert [answer.normalized_answer for answer in record.accepted_answers] == ["flu"]
    assert [symptom.text for symptom in record.symptoms] == ["Fever", "Cough"]


@pytest.mark.parametrize("update", [
    {"title": " "}, {"vignette": "x" * 8001}, {"symptoms": []},
    {"symptoms": [" "]}, {"symptoms": ["x"] * 21},
    {"age_years": True}, {"age_years": "28"}, {"age_years": 28.0},
    {"age_years": -1}, {"age_years": 121}, {"source_text": "private source"},
    {"reference_diagnosis": " "}, {"accepted_answers": ["x"] * 21},
])
def test_create_validation(update):
    with pytest.raises(ValidationError):
        ClinicalCaseCreate(**(VALID_CASE | update))


def test_optional_age_and_unicode_character_lengths():
    draft = ClinicalCaseDraft(title="😀" * 120, vignette="Synthetic", symptoms=["Fever"])
    assert draft.age_years is None
    with pytest.raises(ValidationError):
        ClinicalCaseDraft(title="😀" * 121, vignette="Synthetic", symptoms=["Fever"])
