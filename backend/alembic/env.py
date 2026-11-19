import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

import app.models  # noqa: F401  — registers every model on Base.metadata
from alembic import context
from app.core.config import get_settings
from app.db.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
# ConfigParser treats "%" as interpolation; percent-encoded passwords need "%%".
config.set_main_option("sqlalchemy.url", settings.sqlalchemy_database_url.replace("%", "%%"))
target_metadata = Base.metadata


def _connect_args() -> dict:
    """Same connection rules as the app (app/db/base.py): TLS in production,
    and no prepared-statement cache behind a transaction pooler (Supabase
    Supavisor on port 6543)."""
    args: dict = {"ssl": "require"} if settings.is_production else {}
    if settings.db_pgbouncer:
        args |= {"statement_cache_size": 0, "prepared_statement_cache_size": 0}
    return args


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=_connect_args(),
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
