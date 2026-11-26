"""Alembic environment: runs migrations against the app's own database engine.

New migration after changing a model in app/db.py (run from backend/):
    python -m alembic -c alembic.ini revision --autogenerate -m "what changed"
"""
from alembic import context

from app.db import Base, engine

target_metadata = Base.metadata

with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
    connection.commit()
