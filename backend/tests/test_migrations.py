from alembic import command
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from app import seed
from app.models import ClinicalCaseRecord


def test_migration_roundtrip_and_idempotent_seed(postgres, monkeypatch):
    engine, config = postgres
    command.check(config)
    monkeypatch.setattr(seed, "get_engine", lambda: engine)
    seed.seed_demo()
    seed.seed_demo()
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(ClinicalCaseRecord)) == 1
        assert session.get(ClinicalCaseRecord, seed.DEMO_ID).symptoms[0].text == "Fever"
    command.downgrade(config, "base")
    assert inspect(engine).get_table_names() == ["alembic_version"]
    command.upgrade(config, "head")
    assert "clinical_cases" in inspect(engine).get_table_names()
