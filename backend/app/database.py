import os
from functools import lru_cache

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session

from app.telemetry import operation, traced


@event.listens_for(Engine, "before_cursor_execute")
def query_started(connection, cursor, statement, parameters, context, executemany):
    context._telemetry_operation = operation("db.query")
    context._telemetry_operation.__enter__()


@event.listens_for(Engine, "after_cursor_execute")
def query_finished(connection, cursor, statement, parameters, context, executemany):
    operation_context = getattr(context, "_telemetry_operation", None)
    if operation_context is not None:
        context._telemetry_operation = None
        operation_context.__exit__(None, None, None)


@event.listens_for(Engine, "handle_error")
def query_failed(context):
    operation_context = getattr(context.execution_context, "_telemetry_operation", None)
    if operation_context is not None:
        context.execution_context._telemetry_operation = None
        exc = context.original_exception
        operation_context.__exit__(type(exc), exc, exc.__traceback__)


@traced("db.transaction")
def commit(session):
    session.commit()


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
        try:
            yield session
        finally:
            if session.in_transaction():
                with operation("db.transaction.rollback"):
                    session.rollback()
