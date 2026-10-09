import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app import database


@pytest.fixture
def postgres(monkeypatch):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.fail("TEST_DATABASE_URL is required for real PostgreSQL integration tests.")
    parsed = make_url(url)
    if parsed.get_backend_name() != "postgresql" or not parsed.database or not parsed.database.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a dedicated PostgreSQL database ending in _test.")
    parsed = parsed.set(drivername="postgresql+psycopg")
    admin = create_engine(parsed)
    schema = f"test_{uuid4().hex}"
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(parsed, connect_args={"options": f"-c search_path={schema}"}, hide_parameters=True)
    monkeypatch.setattr(database, "get_engine", lambda: engine)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    try:
        yield engine, config
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.hookimpl(tryfirst=True)
def pytest_collection_modifyitems(items):
    # fixturenames includes transitive dependencies, so wrappers cannot hide PostgreSQL use.
    for item in items:
        marker = "integration" if "postgres" in item.fixturenames else "unit"
        item.add_marker(getattr(pytest.mark, marker))


@pytest.fixture
def author_identity(request):
    from app.auth import require_user
    from app.main import app
    from app.models import User
    from sqlalchemy.orm import Session
    user = User(id=uuid4(), username="fixture_author", password_hash="unused")
    if "postgres" in request.fixturenames:
        engine, _ = request.getfixturevalue("postgres")
        with Session(engine, expire_on_commit=False) as session:
            session.add(user)
            session.commit()
    app.dependency_overrides[require_user] = lambda: user
    try:
        yield user
    finally:
        app.dependency_overrides.pop(require_user, None)
