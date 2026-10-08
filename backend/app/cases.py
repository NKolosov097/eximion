import unicodedata

from app.models import ClinicalCaseAcceptedAnswer, ClinicalCaseRecord, ClinicalCaseSymptom
from app.schemas import ClinicalCase, ClinicalCaseCreate


def normalize_diagnosis(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def build_case(data: ClinicalCaseCreate) -> ClinicalCaseRecord:
    normalized_reference = normalize_diagnosis(data.reference_diagnosis)
    seen = {normalized_reference}
    answers = []
    for answer in data.accepted_answers:
        normalized = normalize_diagnosis(answer)
        if normalized not in seen:
            answers.append(ClinicalCaseAcceptedAnswer(answer=answer, normalized_answer=normalized))
            seen.add(normalized)
    return ClinicalCaseRecord(
        title=data.title,
        vignette=data.vignette,
        age_years=data.age_years,
        reference_diagnosis=data.reference_diagnosis,
        normalized_reference_diagnosis=normalized_reference,
        symptoms=[ClinicalCaseSymptom(position=i, text=text) for i, text in enumerate(data.symptoms)],
        accepted_answers=answers,
    )


def public_case(record: ClinicalCaseRecord) -> ClinicalCase:
    return ClinicalCase(
        id=record.id, title=record.title, vignette=record.vignette,
        symptoms=[symptom.text for symptom in record.symptoms],
        age_years=record.age_years, created_at=record.created_at,
    )
