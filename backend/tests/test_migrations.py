from alembic import command
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session
from uuid import UUID

from app import seed
from app.models import ClinicalCaseRecord


def test_migration_roundtrip_and_idempotent_seed(postgres, monkeypatch):
    engine, config = postgres
    command.check(config)
    monkeypatch.setattr(seed, "get_engine", lambda: engine)
    seed.seed_demo()
    seed.seed_demo()
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(ClinicalCaseRecord)) == 3
        assert seed.DEMO_ID == UUID("4613eeb7-7064-41da-bb06-62630b3eaebc")
        assert session.get(ClinicalCaseRecord, seed.DEMO_ID).symptoms[0].text == "Fever"
        assert session.get(ClinicalCaseRecord, seed.ASTHMA_DEMO_ID).reference_diagnosis == "Asthma"
        assert session.get(ClinicalCaseRecord, seed.CYSTITIS_DEMO_ID).reference_diagnosis == "Acute uncomplicated cystitis"
        assert all(record.owner_id is None for record in session.scalars(select(ClinicalCaseRecord)))
        session.get(ClinicalCaseRecord, seed.DEMO_ID).title = "Preserved existing title"
        session.get(ClinicalCaseRecord, seed.ASTHMA_DEMO_ID).title = "Preserved asthma title"
        session.commit()
    seed.seed_demo()
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(ClinicalCaseRecord)) == 3
        assert session.get(ClinicalCaseRecord, seed.DEMO_ID).title == "Preserved existing title"
        assert session.get(ClinicalCaseRecord, seed.ASTHMA_DEMO_ID).title == "Preserved asthma title"
    command.downgrade(config, "base")
    assert inspect(engine).get_table_names() == ["alembic_version"]
    command.upgrade(config, "head")
    assert "clinical_cases" in inspect(engine).get_table_names()
