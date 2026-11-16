"""Load app.reference.seed into an empty schema built with create_all (tests,
local development). Production gets the same data from migration 0017."""

from decimal import Decimal

from sqlalchemy import insert, select

from app.models.platform import (
    Country,
    CountryCurrency,
    FeeSchedule,
    PaymentCorridor,
    PaymentProvider,
    TransactionLimit,
)
from app.models.reference import Currency
from app.reference import currencies, seed


async def seed_reference_data(conn) -> None:
    for code, name, symbol, decimals, enabled in currencies.SEED:
        await conn.execute(insert(Currency).values(code=code, name=name, symbol=symbol, decimals=decimals,
                                                   status="active", wallet_enabled=enabled))
    for code, name, symbol, decimals in seed.EXTRA_CURRENCIES:
        await conn.execute(insert(Currency).values(code=code, name=name, symbol=symbol, decimals=decimals,
                                                   status="active", wallet_enabled=False))
    for code, name, region, dial, currency in seed.COUNTRIES:
        pilot = code in seed.PILOT_COUNTRIES
        await conn.execute(insert(Country).values(
            code=code, name=name, region=region, dial_code=dial, default_currency=currency,
            status="pilot" if pilot else "planned", compliance_approved=False, custodian_ready=False,
            provider_ready=pilot, kyc_requirements={"wallet": 1, "cross_border": 2}))
        await conn.execute(insert(CountryCurrency).values(country_code=code, currency_code=currency,
                                                          wallet_enabled=pilot))
    for p in seed.PROVIDERS:
        await conn.execute(insert(PaymentProvider).values(webhook_status="not_configured", limits={}, **p))
    sandbox_id = (await conn.execute(select(PaymentProvider.id).where(PaymentProvider.code == "sandbox"))).scalar_one()
    for fc, tc, fcur, tcur in seed.DRAFT_CORRIDORS:
        await conn.execute(insert(PaymentCorridor).values(
            from_country=fc, to_country=tc, from_currency=fcur, to_currency=tcur, rail_provider_id=sandbox_id,
            settlement_model="prefunded", status="draft", min_amount=Decimal(10), max_amount=Decimal(50000),
            rate_source="manual", max_rate_age_seconds=3600, fx_markup_bps=0, quote_ttl_seconds=60))
    for product, pct, fixed, currency, country in seed.FEES:
        await conn.execute(insert(FeeSchedule).values(product=product, percentage=Decimal(pct), fixed=Decimal(fixed),
                                                      currency=currency, country_code=country, priority=0,
                                                      active=True))
    for product, level, mn, mx, daily, monthly in seed.LIMITS:
        await conn.execute(insert(TransactionLimit).values(
            product=product, country_code="ZA", currency="ZAR", kyc_level=level,
            per_transaction_min=Decimal(mn), per_transaction_max=Decimal(mx) if mx else None,
            daily_max=Decimal(daily) if daily else None, monthly_max=Decimal(monthly) if monthly else None,
            active=True))
