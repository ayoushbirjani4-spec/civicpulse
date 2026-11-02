from alembic import context

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app.db import Base, engine


def include_object(obj, name, type_, reflected, compare_to):
    # PostGIS adds its own tables (spatial_ref_sys, the tiger geocoder). A table that
    # exists only in the database is never ours to drop; removing a table is written by hand.
    return not (type_ == "table" and reflected and compare_to is None)


with engine.connect() as connection:
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()
