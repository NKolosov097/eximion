from alembic import context

from app.database import Base, get_engine
from app import models


if context.is_offline_mode():
    context.configure(url=get_engine().url.render_as_string(hide_password=False), target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    with get_engine().connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
