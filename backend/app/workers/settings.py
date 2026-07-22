"""ARQ worker settings. Run with:

    arq app.workers.settings.WorkerSettings

Runs as a separate Railway service from the API (see railway.worker.json)
so periodic sweeps and any future enqueued jobs don't compete with
request-handling capacity.
"""

from arq.connections import RedisSettings
from arq.cron import cron

from app.core.config import get_settings
from app.core.logging import configure_logging, log
from app.workers.tasks import (
    charge_monthly_card_maintenance_fees,
    sweep_expired_claim_payments,
    sweep_expired_payment_requests,
    sweep_expired_rent_payment_links,
)


async def on_startup(ctx: dict) -> None:
    configure_logging(get_settings().env)
    log.info("worker_startup")


async def on_shutdown(ctx: dict) -> None:
    log.info("worker_shutdown")


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


class WorkerSettings:
    functions: list = []
    cron_jobs = [
        cron(sweep_expired_claim_payments, minute=set(range(0, 60, 5))),
        cron(sweep_expired_payment_requests, minute=set(range(0, 60, 5))),
        cron(sweep_expired_rent_payment_links, minute=set(range(0, 60, 5))),
        cron(charge_monthly_card_maintenance_fees, hour=3, minute=0),
    ]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = _redis_settings()
