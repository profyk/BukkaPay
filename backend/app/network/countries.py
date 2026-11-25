"""Country availability.

A country is *open* (customers may sign up, sign in and transact) only when
its status is `pilot` or `live`. Moving it there is a maker-checker request
(country.set_status) that is refused unless the readiness checklist passes:

  required   compliance sign-off (who, regulator, licence model)
             an active primary custodian for the country's currency
             wallets enabled for that currency
             a live collection rail (bank / mobile money / card pay-in)
             a live payout rail (bank / mobile money)
             a live KYC provider
             transaction limits configured for the country
  advisory   card issuing, fee rules, an active corridor, cash agents

"Live" means a provider_countries row with status `live` for a provider
that is itself `active` in `production` mode. Seeded catalogue rows start
`planned` and never count.

Suspended countries refuse sign-ups and money movement, but existing
customers can still sign in to see their balance and contact support.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.platform import (
    Country,
    CountryCurrency,
    CountryCustodian,
    FeeSchedule,
    PaymentCorridor,
    PaymentProvider,
    ProviderCountry,
    TransactionLimit,
)
from app.models.reference import Currency
from app.reference.africa import COLLECT, PAYOUT

OPERATING = ("pilot", "live")
SIGN_IN_ALLOWED = ("pilot", "live", "suspended")


async def get(db: AsyncSession, code: str | None) -> Country | None:
    if not code:
        return None
    return await db.get(Country, code.strip().upper())


async def require_operating(db: AsyncSession, code: str | None, *, what: str = "BukkaPay") -> Country:
    country = await get(db, code)
    if country is None:
        raise ApiError(f"Unknown country: {code}")
    if country.status not in OPERATING:
        raise ApiError(f"{what} is not available in {country.name} yet", status_code=403)
    return country


async def require_sign_in_allowed(db: AsyncSession, code: str | None) -> None:
    """Sign-in: open countries, plus suspended ones (customers must still be
    able to reach their money and support). Unknown/blank = legacy account."""
    country = await get(db, code)
    if country is not None and country.status not in SIGN_IN_ALLOWED:
        raise ApiError(f"BukkaPay is not available in {country.name} yet", status_code=403)


# ─── readiness ──────────────────────────────────────────────────────────────


def _item(key: str, label: str, ok: bool, detail: str, *, required: bool = True, fix: str | None = None) -> dict:
    return {"key": key, "label": label, "ok": bool(ok), "required": required, "detail": detail, "fix": fix}


async def _live_coverage(db: AsyncSession, code: str) -> list[tuple[ProviderCountry, PaymentProvider]]:
    return list((await db.execute(
        select(ProviderCountry, PaymentProvider).join(PaymentProvider, PaymentProvider.id == ProviderCountry.provider_id)
        .where(ProviderCountry.country_code == code, ProviderCountry.status == "live",
               PaymentProvider.status == "active", PaymentProvider.mode == "production")
    )).all())


async def has_active_custodian(db: AsyncSession, country_code: str, currency: str | None = None) -> bool:
    q = select(CountryCustodian.id).where(CountryCustodian.country_code == country_code,
                                          CountryCustodian.role == "primary", CountryCustodian.status == "active")
    if currency:
        q = q.where(CountryCustodian.currency_code == currency)
    return (await db.execute(q)).first() is not None


async def readiness(db: AsyncSession, country: Country) -> dict:
    code, ccy = country.code, country.default_currency
    live = await _live_coverage(db, code)

    def providers_with(caps) -> list[str]:
        return sorted({p.name for pc, p in live if set(pc.capabilities or []) & set(caps)})

    collect, payout, kyc = providers_with(COLLECT), providers_with(PAYOUT), providers_with(("kyc",))
    cards = providers_with(("card_issuing",))
    custodian = await has_active_custodian(db, code, ccy)
    cc = await db.get(CountryCurrency, (code, ccy))
    currency = await db.get(Currency, ccy)
    wallets = bool(cc and cc.wallet_enabled and currency and currency.wallet_enabled)
    limits = (await db.execute(select(func.count()).select_from(TransactionLimit).where(
        TransactionLimit.country_code == code, TransactionLimit.active.is_(True)))).scalar_one()
    fee_rules = (await db.execute(select(func.count()).select_from(FeeSchedule).where(
        FeeSchedule.country_code == code, FeeSchedule.active.is_(True)))).scalar_one()
    corridors = (await db.execute(select(func.count()).select_from(PaymentCorridor).where(
        (PaymentCorridor.from_country == code) | (PaymentCorridor.to_country == code),
        PaymentCorridor.status.in_(("pilot", "active"))))).scalar_one()
    from app.models.revenue import Agent

    agents = (await db.execute(select(func.count()).select_from(Agent).where(
        Agent.country == code, Agent.status == "active"))).scalar_one()

    signed = country.compliance_approved
    items = [
        _item("compliance", "Compliance sign-off", signed,
              f"Signed off by {country.compliance_signed_by or 'an admin'}"
              + (f" ({country.licence_model}, {country.regulator})" if country.licence_model else "")
              if signed else "No sign-off recorded: licence model, regulator and AML programme for this country",
              fix="Countries → Compliance sign-off"),
        _item("custodian", f"Safeguarding custodian ({ccy})", custodian,
              "Active primary custodian" if custodian else f"No active primary custodian holding {ccy} funds",
              fix="Custodians → assign and approve"),
        _item("wallets", f"{ccy} wallets enabled", wallets,
              "Customers can hold this currency" if wallets else f"{ccy} wallets are off for this country",
              fix="Currencies → enable wallets (approval)"),
        _item("collection", "Live collection rail", bool(collect),
              ", ".join(collect) if collect else "No live bank, mobile-money or card pay-in provider",
              fix="Providers → coverage → mark live"),
        _item("payout", "Live payout rail", bool(payout),
              ", ".join(payout) if payout else "No live bank or mobile-money payout provider",
              fix="Providers → coverage → mark live"),
        _item("kyc", "Live identity verification", bool(kyc),
              ", ".join(kyc) if kyc else "No live KYC provider for this country",
              fix="Providers → coverage → mark live"),
        _item("limits", "Transaction limits", limits > 0,
              f"{limits} active limit rule(s)" if limits else "No limits for this country (KYC tiers)",
              fix="Fees & Limits → add limits"),
        _item("cards", "Card issuing", bool(cards), ", ".join(cards) if cards else "No live card programme",
              required=False, fix="Providers → coverage"),
        _item("fees", "Country fee rules", fee_rules > 0,
              f"{fee_rules} active rule(s)" if fee_rules else "Global fee rules apply", required=False,
              fix="Fees & Limits"),
        _item("corridors", "Cross-border corridors", corridors > 0,
              f"{corridors} open corridor(s)" if corridors else "Domestic only", required=False,
              fix="Corridors & FX"),
        _item("agents", "Cash agents", agents > 0, f"{agents} active agent(s)" if agents else "No cash agents yet",
              required=False, fix="Agents"),
    ]
    blocking = [i for i in items if i["required"] and not i["ok"]]
    return {"country": code, "ready": not blocking, "open": country.status in OPERATING,
            "passed": sum(1 for i in items if i["required"] and i["ok"]),
            "required": sum(1 for i in items if i["required"]), "items": items}


async def set_status(db: AsyncSession, country: Country, status: str) -> Country:
    """Apply a status change. `pilot`/`live` require the readiness checklist,
    except `pilot` for a country already operating (grandfathered, e.g. ZA)."""
    if status not in ("planned", "pilot", "live", "suspended"):
        raise ApiError("Invalid country status")
    if status in OPERATING:
        check = await readiness(db, country)
        grandfathered = status == "pilot" and country.status in OPERATING
        if not check["ready"] and not grandfathered:
            missing = "; ".join(i["label"] for i in check["items"] if i["required"] and not i["ok"])
            raise ApiError(f"{country.name} can't be set to {status}. Missing: {missing}", status_code=409)
        country.provider_ready = True
    if status == "live" and country.launched_at is None:
        country.launched_at = datetime.now(UTC)
    country.status = status
    await db.flush()
    return country


async def record_compliance(db: AsyncSession, country: Country, *, approved: bool, actor: str,
                            regulator: str | None, licence_model: str | None, notes: str | None) -> Country:
    if approved and not (regulator and licence_model):
        raise ApiError("Record the regulator and the licence model with the sign-off")
    if not approved and country.status in OPERATING:
        raise ApiError("Suspend the country before withdrawing its compliance sign-off", status_code=409)
    country.compliance_approved = approved
    country.regulator = regulator or country.regulator
    country.licence_model = licence_model or country.licence_model
    country.compliance_signed_by = actor if approved else None
    country.compliance_signed_at = datetime.now(UTC) if approved else None
    if notes:
        country.regulatory_notes = notes
    await db.flush()
    return country


async def list_public(db: AsyncSession) -> list[Country]:
    return list((await db.execute(select(Country).order_by(Country.region, Country.name))).scalars())
