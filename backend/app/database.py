import os
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session


class Base(DeclarativeBase):
    pass


@lru_cache
def get_engine():
    url = os.environ.get("DATABASE_URL", "postgresql+psycopg://eximion:eximion@localhost:5432/eximion")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=2,
        pool_timeout=10,
        connect_args={"connect_timeout": 5, "options": "-c statement_timeout=10000"},
        hide_parameters=True,
    )


def get_session():
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session
