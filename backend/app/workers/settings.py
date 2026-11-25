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
    charge_account_fees,
    charge_monthly_card_maintenance_fees,
    collect_card_overdrafts,
    daily_reconciliation,
    expire_agent_cash_out_codes,
    expire_card_holds,
    expire_fx_quotes,
    expire_payout_quotes,
    issue_pending_cards,
    process_outbox,
    reconcile_payouts,
    release_due_escrows,
    rescreen_customers,
    sweep_expired_claim_payments,
    sweep_expired_payment_requests,
    sweep_expired_rent_payment_links,
    weekly_settlement_run,
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
        # hourly in bounded batches; idempotent per card per 30 days
        cron(charge_monthly_card_maintenance_fees, minute=0),
        cron(issue_pending_cards, minute=set(range(0, 60, 2))),
        cron(expire_card_holds, minute=15),
        cron(collect_card_overdrafts, minute=set(range(0, 60, 5))),
        # every 10 seconds: outbox delivery (sandbox settlements, merchant webhooks)
        cron(process_outbox, second=set(range(0, 60, 10))),
        cron(expire_fx_quotes, minute=set(range(0, 60, 5))),
        cron(daily_reconciliation, hour=2, minute=30),
        cron(rescreen_customers, hour=3, minute=15),
        cron(expire_payout_quotes, minute=set(range(0, 60, 5))),
        cron(reconcile_payouts, hour=4, minute=0),
        cron(release_due_escrows, minute=set(range(0, 60, 10))),
        # hourly in bounded batches; one decision per customer per month
        cron(charge_account_fees, minute=40),
        cron(expire_agent_cash_out_codes, minute=set(range(0, 60, 2))),
        # Mondays 06:00 UTC: cross-border bulk settlement run for treasury
        cron(weekly_settlement_run, weekday=0, hour=6, minute=0),
    ]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = _redis_settings()
