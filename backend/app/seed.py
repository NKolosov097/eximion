from uuid import UUID

from sqlalchemy.orm import Session

from app.cases import build_case
from app.database import get_engine
from app.models import ClinicalCaseRecord
from app.schemas import ClinicalCaseCreate


DEMO_ID = UUID("4613eeb7-7064-41da-bb06-62630b3eaebc")
ASTHMA_DEMO_ID = UUID("fbd148cb-8719-4e31-81a7-e0577c327038")
CYSTITIS_DEMO_ID = UUID("7bea171a-1cb8-4d06-bbd7-1b480a5c8c85")
DEMO_CASES = (
    (DEMO_ID, ClinicalCaseCreate(
        title="Fever and dry cough",
        vignette="A previously healthy 28-year-old presents with abrupt fever, dry cough, muscle aches, and fatigue for two days during winter. Several coworkers have similar symptoms. This is a synthetic educational case.",
        symptoms=["Fever", "Dry cough", "Muscle aches", "Fatigue"],
        age_years=28,
        reference_diagnosis="Influenza",
        accepted_answers=["Flu"],
    )),
    (ASTHMA_DEMO_ID, ClinicalCaseCreate(
        title="Recurring wheeze after exercise",
        vignette="A 22-year-old reports repeated episodes of wheezing, chest tightness and shortness of breath after running, with occasional cough at night. Symptoms vary over several months, and the patient feels well between episodes. There is a history of seasonal allergic rhinitis. Spirometry shows airflow obstruction that significantly improves after a bronchodilator. This is a synthetic educational case.",
        symptoms=["Episodic wheezing", "Exercise-related shortness of breath", "Chest tightness", "Night-time cough"],
        age_years=22,
        reference_diagnosis="Asthma",
        accepted_answers=["Bronchial asthma"],
    )),
    (CYSTITIS_DEMO_ID, ClinicalCaseCreate(
        title="Burning urination and frequent urges",
        vignette="A previously healthy, nonpregnant 31-year-old woman presents with two days of burning on urination, frequent small-volume urination and urgency. She has mild suprapubic discomfort, no fever, no flank pain, and no vaginal discharge or irritation. Urine dipstick is positive for nitrites and leukocyte esterase. This is a synthetic educational case.",
        symptoms=["Dysuria", "Urinary frequency", "Urinary urgency", "Suprapubic discomfort"],
        age_years=31,
        reference_diagnosis="Acute uncomplicated cystitis",
        accepted_answers=["Cystitis", "Acute cystitis", "Uncomplicated cystitis", "Lower urinary tract infection", "Urinary tract infection", "UTI"],
    )),
)


def seed_demo():
    with Session(get_engine()) as session:
        for case_id, data in DEMO_CASES:
            if session.get(ClinicalCaseRecord, case_id) is not None:
                continue
            record = build_case(data)
            record.id = case_id
            session.add(record)
        session.commit()


if __name__ == "__main__":
    seed_demo()
    print(f"{len(DEMO_CASES)} demonstration cases are available.")
