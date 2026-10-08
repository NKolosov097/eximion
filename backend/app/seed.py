from uuid import UUID

from sqlalchemy.orm import Session

from app.cases import build_case
from app.database import get_engine
from app.models import ClinicalCaseRecord
from app.schemas import ClinicalCaseCreate


DEMO_ID = UUID("4613eeb7-7064-41da-bb06-62630b3eaebc")


def seed_demo():
    with Session(get_engine()) as session:
        if session.get(ClinicalCaseRecord, DEMO_ID) is not None:
            return
        record = build_case(ClinicalCaseCreate(
            title="Fever and dry cough",
            vignette="A previously healthy 28-year-old presents with abrupt fever, dry cough, muscle aches, and fatigue for two days during winter. Several coworkers have similar symptoms. This is a synthetic educational case.",
            symptoms=["Fever", "Dry cough", "Muscle aches", "Fatigue"],
            age_years=28,
            reference_diagnosis="Influenza",
            accepted_answers=["Flu"],
        ))
        record.id = DEMO_ID
        session.add(record)
        session.commit()


if __name__ == "__main__":
    seed_demo()
    print(f"Demonstration case is available: {DEMO_ID}")
