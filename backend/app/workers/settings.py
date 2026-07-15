"""ARQ worker settings. Run with:

    arq app.workers.settings.WorkerSettings

Task functions and cron jobs are added here as background-job domains land
(webhook processing, autopay execution, expiry sweeps, notification
dispatch — see the phased plan).
"""

from arq.connections import RedisSettings

from app.core.config import get_settings
from app.core.logging import configure_logging, log


async def on_startup(ctx: dict) -> None:
    configure_logging(get_settings().env)
    log.info("worker_startup")


async def on_shutdown(ctx: dict) -> None:
    log.info("worker_shutdown")


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


class WorkerSettings:
    functions: list = []
    cron_jobs: list = []
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = _redis_settings()
