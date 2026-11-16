"""Admin: the network control centre — countries, currencies, custodians,
providers, corridors/FX, fees, limits, approvals, ledger, reconciliation,
compliance, transfers, webhooks, audit log and merchant KYB.

Configuration that can expose customers to money movement (activating a
country/corridor/custodian/provider, enabling a currency's wallets, ledger
adjustments, unfreezing) is only ever *requested* here; it runs when a
second admin approves it (maker-checker, app.governance.approvals).
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, require
from app.core.errors import ApiError
from app.db.deps import get_db
from app.governance import approvals
from app.ledger import posting
from app.models.ledger import (
    FundingRequest,
    JournalEntry,
    JournalLine,
    LedgerAccount,
    WithdrawalRequest,
)
from app.models.merchant import Merchant
from app.models.platform import (
    ApprovalRequest,
    AuditLog,
    ComplianceCase,
    Country,
    CountryCurrency,
    CountryCustodian,
    Custodian,
    FeeSchedule,
    PaymentCorridor,
    PaymentProvider,
    ProviderWebhook,
    ReconciliationItem,
    ReconciliationRun,
    RiskEvent,
    ScreeningResult,
    TransactionLimit,
    Transfer,
)
from app.models.reference import Currency
from app.models.user import User
from app.network import compliance, transfers
from app.reconciliation import engine as recon
from app.schemas.base import CamelModel

router = APIRouter(tags=["admin-network"])


def row(obj) -> dict:
    """Model → camelCase JSON-ready dict."""
    from pydantic.alias_generators import to_camel

    out = {}
    for col in obj.__table__.columns:
        value = getattr(obj, col.key)
        if isinstance(value, Decimal):
            value = str(value)
        elif isinstance(value, uuid.UUID):
            value = str(value)
        elif isinstance(value, datetime):
            value = value.isoformat()
        out[to_camel(col.key)] = value
    return out


def _uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as e:
        raise ApiError("Not found", status_code=404) from e


async def _get(db, model, key):
    obj = await db.get(model, key)
    if obj is None:
        raise ApiError(f"{model.__name__} not found", status_code=404)
    return obj


def _apply(obj, body: CamelModel, *, exclude: set[str] = frozenset()) -> None:
    for key, value in body.model_dump(exclude_unset=True).items():
        if key not in exclude:
            setattr(obj, key, value)


# ─── Countries ──────────────────────────────────────────────────────────────


class CountryIn(CamelModel):
    code: str = Field(min_length=2, max_length=2)
    name: str
    region: str = "Africa"
    dial_code: str | None = None
    default_currency: str
    kyc_requirements: dict = {}
    regulatory_notes: str | None = None


class CountryPatch(CamelModel):
    name: str | None = None
    region: str | None = None
    dial_code: str | None = None
    default_currency: str | None = None
    kyc_requirements: dict | None = None
    regulatory_notes: str | None = None
    compliance_approved: bool | None = None
    provider_ready: bool | None = None


@router.get("/network/countries")
async def list_countries(_=Depends(require("network.view")), db: AsyncSession = Depends(get_db)):
    countries = (await db.execute(select(Country).order_by(Country.region, Country.name))).scalars().all()
    custodians = {
        c for (c,) in (await db.execute(select(CountryCustodian.country_code).where(
            CountryCustodian.status == "active", CountryCustodian.role == "primary"))).all()
    }
    return [{**row(c), "hasActiveCustodian": c.code in custodians} for c in countries]


@router.post("/network/countries", status_code=201)
async def create_country(body: CountryIn, _=Depends(require("network.manage")), db: AsyncSession = Depends(get_db)):
    code = body.code.upper()
    if await db.get(Country, code):
        raise ApiError("Country already exists", status_code=409)
    await _get(db, Currency, body.default_currency.upper())
    country = Country(code=code, name=body.name, region=body.region, dial_code=body.dial_code,
                      default_currency=body.default_currency.upper(), status="planned",
                      compliance_approved=False, custodian_ready=False, provider_ready=False,
                      kyc_requirements=body.kyc_requirements, regulatory_notes=body.regulatory_notes)
    db.add(country)
    db.add(CountryCurrency(country_code=code, currency_code=country.default_currency, wallet_enabled=False))
    await db.flush()
    return row(country)


@router.patch("/network/countries/{code}")
async def update_country(code: str, body: CountryPatch, _=Depends(require("network.manage")),
                         db: AsyncSession = Depends(get_db)):
    country = await _get(db, Country, code.upper())
    _apply(country, body)
    await db.flush()
    return row(country)


# ─── Currencies ─────────────────────────────────────────────────────────────


class CurrencyIn(CamelModel):
    code: str = Field(min_length=3, max_length=3)
    name: str
    symbol: str
    decimals: int = 2


class CurrencyPatch(CamelModel):
    name: str | None = None
    symbol: str | None = None
    status: str | None = None


@router.get("/network/currencies")
async def list_currencies(_=Depends(require("network.view")), db: AsyncSession = Depends(get_db)):
    return [row(c) for c in (await db.execute(select(Currency).order_by(Currency.code))).scalars()]


@router.post("/network/currencies", status_code=201)
async def create_currency(body: CurrencyIn, _=Depends(require("network.manage")), db: AsyncSession = Depends(get_db)):
    code = body.code.upper()
    if await db.get(Currency, code):
        raise ApiError("Currency already exists", status_code=409)
    currency = Currency(code=code, name=body.name, symbol=body.symbol, decimals=body.decimals, status="active",
                        wallet_enabled=False)
    db.add(currency)
    await db.flush()
    return row(currency)


@router.patch("/network/currencies/{code}")
async def update_currency(code: str, body: CurrencyPatch, _=Depends(require("network.manage")),
                          db: AsyncSession = Depends(get_db)):
    # Decimal precision is immutable once created: changing it would change
    # the meaning of every historical amount.
    currency = await _get(db, Currency, code.upper())
    if body.status is not None and body.status not in ("active", "inactive"):
        raise ApiError("Invalid status")
    _apply(currency, body)
    await db.flush()
    return row(currency)


# ─── Custodians ─────────────────────────────────────────────────────────────


class CustodianIn(CamelModel):
    name: str
    country_code: str
    institution_type: str
    regulatory_status: str = "not_started"
    safeguarding_arrangement: str | None = None
    api_config_ref: str | None = None
    contact: dict = {}


class CustodianPatch(CamelModel):
    name: str | None = None
    status: str | None = None
    integration_status: str | None = None
    regulatory_status: str | None = None
    safeguarding_arrangement: str | None = None
    api_config_ref: str | None = None
    contact: dict | None = None


class CustodianAssignmentIn(CamelModel):
    country_code: str
    currency_code: str
    custodian_id: str
    role: str = "primary"
    settlement_account_ref: str | None = None
    collection_methods: list = []
    withdrawal_methods: list = []
    reconciliation_settings: dict = {}


@router.get("/network/custodians")
async def list_custodians(_=Depends(require("network.view")), db: AsyncSession = Depends(get_db)):
    custodians = [row(c) for c in (await db.execute(select(Custodian).order_by(Custodian.country_code))).scalars()]
    links = [row(link) for link in (await db.execute(select(CountryCustodian))).scalars()]
    return {"custodians": custodians, "assignments": links}


@router.post("/network/custodians", status_code=201)
async def create_custodian(body: CustodianIn, _=Depends(require("network.manage")),
                           db: AsyncSession = Depends(get_db)):
    await _get(db, Country, body.country_code.upper())
    custodian = Custodian(name=body.name, country_code=body.country_code.upper(),
                          institution_type=body.institution_type, status="prospect", integration_status="none",
                          regulatory_status=body.regulatory_status,
                          safeguarding_arrangement=body.safeguarding_arrangement,
                          api_config_ref=body.api_config_ref, contact=body.contact)
    db.add(custodian)
    await db.flush()
    return row(custodian)


@router.patch("/network/custodians/{custodian_id}")
async def update_custodian(custodian_id: str, body: CustodianPatch, _=Depends(require("network.manage")),
                           db: AsyncSession = Depends(get_db)):
    custodian = await _get(db, Custodian, _uuid(custodian_id))
    _apply(custodian, body)
    await db.flush()
    return row(custodian)


@router.post("/network/custodian-assignments", status_code=201)
async def assign_custodian(body: CustodianAssignmentIn, _=Depends(require("network.manage")),
                           db: AsyncSession = Depends(get_db)):
    """Creates a *pending* assignment. Activation is a maker-checker action
    (country_custodian.activate) and never re-points live balances."""
    custodian = await _get(db, Custodian, _uuid(body.custodian_id))
    if body.role not in ("primary", "backup"):
        raise ApiError("Invalid role")
    link = CountryCustodian(country_code=body.country_code.upper(), currency_code=body.currency_code.upper(),
                            custodian_id=custodian.id, role=body.role, status="pending",
                            settlement_account_ref=body.settlement_account_ref,
                            collection_methods=body.collection_methods, withdrawal_methods=body.withdrawal_methods,
                            reconciliation_settings=body.reconciliation_settings)
    db.add(link)
    await db.flush()
    return row(link)


# ─── Providers ──────────────────────────────────────────────────────────────


class ProviderIn(CamelModel):
    code: str
    name: str
    provider_type: str
    country_code: str | None = None
    currencies: list = []
    methods: list = []
    limits: dict = {}
    credentials_ref: str | None = None


class ProviderPatch(CamelModel):
    name: str | None = None
    currencies: list | None = None
    methods: list | None = None
    limits: dict | None = None
    credentials_ref: str | None = None
    webhook_status: str | None = None


@router.get("/network/providers")
async def list_providers(_=Depends(require("network.view")), db: AsyncSession = Depends(get_db)):
    return [row(p) for p in (await db.execute(select(PaymentProvider).order_by(PaymentProvider.code))).scalars()]


@router.post("/network/providers", status_code=201)
async def create_provider(body: ProviderIn, _=Depends(require("network.manage")), db: AsyncSession = Depends(get_db)):
    provider = PaymentProvider(code=body.code, name=body.name, provider_type=body.provider_type,
                               country_code=body.country_code, currencies=body.currencies, methods=body.methods,
                               mode="sandbox", status="inactive", webhook_status="not_configured",
                               limits=body.limits, credentials_ref=body.credentials_ref)
    db.add(provider)
    await db.flush()
    return row(provider)


@router.patch("/network/providers/{provider_id}")
async def update_provider(provider_id: str, body: ProviderPatch, _=Depends(require("network.manage")),
                          db: AsyncSession = Depends(get_db)):
    provider = await _get(db, PaymentProvider, _uuid(provider_id))
    _apply(provider, body)
    await db.flush()
    return row(provider)


# ─── Corridors & FX ─────────────────────────────────────────────────────────


class CorridorIn(CamelModel):
    from_country: str
    to_country: str
    from_currency: str
    to_currency: str
    rail_provider_id: str | None = None
    settlement_model: str = "prefunded"
    min_amount: Decimal = Decimal("10")
    max_amount: Decimal = Decimal("50000")
    max_rate_age_seconds: int = 3600
    fx_markup_bps: int = 0
    quote_ttl_seconds: int = 60
    liquidity_limit: Decimal | None = None
    notes: str | None = None


class CorridorPatch(CamelModel):
    rail_provider_id: str | None = None
    settlement_model: str | None = None
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None
    max_rate_age_seconds: int | None = None
    fx_markup_bps: int | None = None
    quote_ttl_seconds: int | None = None
    liquidity_limit: Decimal | None = None
    notes: str | None = None


class RateIn(CamelModel):
    rate: Decimal = Field(gt=0)
    source: str = "manual"


@router.get("/network/corridors")
async def list_corridors(_=Depends(require("network.view")), db: AsyncSession = Depends(get_db)):
    from app.network.routing import rate_is_fresh

    out = []
    for c in (await db.execute(select(PaymentCorridor).order_by(PaymentCorridor.from_country))).scalars():
        out.append({**row(c), "rateFresh": rate_is_fresh(c)})
    return out


@router.post("/network/corridors", status_code=201)
async def create_corridor(body: CorridorIn, _=Depends(require("network.manage")), db: AsyncSession = Depends(get_db)):
    for code in (body.from_country, body.to_country):
        await _get(db, Country, code.upper())
    data = body.model_dump()
    data["rail_provider_id"] = _uuid(body.rail_provider_id) if body.rail_provider_id else None
    corridor = PaymentCorridor(**{**data, "from_country": body.from_country.upper(),
                                  "to_country": body.to_country.upper(),
                                  "from_currency": body.from_currency.upper(),
                                  "to_currency": body.to_currency.upper(), "status": "draft",
                                  "rate_source": "manual"})
    db.add(corridor)
    await db.flush()
    return row(corridor)


@router.patch("/network/corridors/{corridor_id}")
async def update_corridor(corridor_id: str, body: CorridorPatch, _=Depends(require("network.manage")),
                          db: AsyncSession = Depends(get_db)):
    corridor = await _get(db, PaymentCorridor, _uuid(corridor_id))
    data = body.model_dump(exclude_unset=True)
    if "rail_provider_id" in data and data["rail_provider_id"]:
        data["rail_provider_id"] = _uuid(data["rail_provider_id"])
    for k, v in data.items():
        setattr(corridor, k, v)
    await db.flush()
    return row(corridor)


@router.post("/network/corridors/{corridor_id}/rate")
async def set_corridor_rate(corridor_id: str, body: RateIn, _=Depends(require("fx.manage")),
                            db: AsyncSession = Depends(get_db)):
    """Record the provider's executable rate. Quotes refuse rates older than
    the corridor's max_rate_age_seconds."""
    corridor = await _get(db, PaymentCorridor, _uuid(corridor_id))
    corridor.rate = body.rate
    corridor.rate_source = body.source
    corridor.rate_updated_at = datetime.now(UTC)
    await db.flush()
    return row(corridor)


# ─── Fees & limits ──────────────────────────────────────────────────────────


class FeeIn(CamelModel):
    product: str
    country_code: str | None = None
    currency: str | None = None
    method: str | None = None
    merchant_category: str | None = None
    customer_type: str | None = None
    corridor_id: str | None = None
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None
    percentage: Decimal = Decimal("0")
    fixed: Decimal = Decimal("0")
    cap: Decimal | None = None
    priority: int = 0
    effective_from: datetime | None = None


@router.get("/network/fees")
async def list_fees(_=Depends(require("fees.view")), db: AsyncSession = Depends(get_db)):
    return [row(f) for f in (await db.execute(
        select(FeeSchedule).order_by(FeeSchedule.product, FeeSchedule.created_at.desc()))).scalars()]


@router.post("/network/fees", status_code=201)
async def create_fee(body: FeeIn, _=Depends(require("fees.manage")), db: AsyncSession = Depends(get_db)):
    """Fees are versioned: a change is a new rule (optionally future-dated)
    plus retiring the old one — never an edit, so history stays exact."""
    from app.models.platform import FEE_PRODUCTS

    if body.product not in FEE_PRODUCTS:
        raise ApiError(f"Unknown product. Use one of: {', '.join(FEE_PRODUCTS)}")
    if body.percentage < 0 or body.fixed < 0:
        raise ApiError("Fees can't be negative")
    data = body.model_dump()
    data["corridor_id"] = _uuid(body.corridor_id) if body.corridor_id else None
    fee = FeeSchedule(**data, active=True)
    db.add(fee)
    await db.flush()
    return row(fee)


@router.post("/network/fees/{fee_id}/retire")
async def retire_fee(fee_id: str, _=Depends(require("fees.manage")), db: AsyncSession = Depends(get_db)):
    fee = await _get(db, FeeSchedule, _uuid(fee_id))
    fee.active = False
    fee.effective_to = datetime.now(UTC)
    await db.flush()
    return row(fee)


class LimitIn(CamelModel):
    product: str
    country_code: str | None = None
    currency: str | None = None
    kyc_level: int = 0
    per_transaction_min: Decimal | None = None
    per_transaction_max: Decimal | None = None
    daily_max: Decimal | None = None
    monthly_max: Decimal | None = None


@router.get("/network/limits")
async def list_limits(_=Depends(require("fees.view")), db: AsyncSession = Depends(get_db)):
    return [row(x) for x in (await db.execute(select(TransactionLimit).order_by(
        TransactionLimit.product, TransactionLimit.kyc_level))).scalars()]


@router.post("/network/limits", status_code=201)
async def create_limit(body: LimitIn, _=Depends(require("network.manage")), db: AsyncSession = Depends(get_db)):
    limit = TransactionLimit(**body.model_dump(), active=True)
    db.add(limit)
    await db.flush()
    return row(limit)


@router.post("/network/limits/{limit_id}/retire")
async def retire_limit(limit_id: str, _=Depends(require("network.manage")), db: AsyncSession = Depends(get_db)):
    limit = await _get(db, TransactionLimit, _uuid(limit_id))
    limit.active = False
    await db.flush()
    return row(limit)


# ─── Approvals ──────────────────────────────────────────────────────────────


class ApprovalIn(CamelModel):
    action: str
    payload: dict
    reason: str
    evidence: list = []


class DecisionIn(CamelModel):
    approve: bool
    note: str | None = None


@router.get("/approvals")
async def list_approvals(status: str | None = Query(default=None), _=Depends(require("approvals.view")),
                         db: AsyncSession = Depends(get_db)):
    stmt = select(ApprovalRequest).order_by(ApprovalRequest.created_at.desc()).limit(200)
    if status:
        stmt = stmt.where(ApprovalRequest.status == status)
    return [row(a) for a in (await db.execute(stmt)).scalars()]


@router.post("/approvals", status_code=201)
async def create_approval(body: ApprovalIn, ctx: AdminContext = Depends(require("approvals.view")),
                          db: AsyncSession = Depends(get_db)):
    req = await approvals.request(db, ctx, action=body.action, payload=body.payload, reason=body.reason,
                                  evidence=body.evidence)
    return row(req)


@router.post("/approvals/{request_id}/decide")
async def decide_approval(request_id: str, body: DecisionIn, ctx: AdminContext = Depends(require("approvals.decide")),
                          db: AsyncSession = Depends(get_db)):
    return row(await approvals.decide(db, ctx, request_id, approve=body.approve, note=body.note))


# ─── Ledger ─────────────────────────────────────────────────────────────────


@router.get("/ledger/accounts")
async def ledger_accounts(prefix: str | None = Query(default=None), _=Depends(require("ledger.view")),
                          db: AsyncSession = Depends(get_db)):
    stmt = select(LedgerAccount).order_by(LedgerAccount.code).limit(500)
    if prefix:
        stmt = stmt.where(LedgerAccount.code.like(f"{prefix}%"))
    else:
        stmt = stmt.where(~LedgerAccount.code.like("wallet:%"), ~LedgerAccount.code.like("merchant:%"),
                          ~LedgerAccount.code.like("campaign:%"))
    return [row(a) for a in (await db.execute(stmt)).scalars()]


@router.get("/ledger/summary")
async def ledger_summary(_=Depends(require("ledger.view")), db: AsyncSession = Depends(get_db)):
    """Balances by account family and currency (each currency on its own)."""
    rows = (await db.execute(select(
        func.split_part(LedgerAccount.code, ":", 1), LedgerAccount.currency, func.sum(LedgerAccount.balance),
        func.count()).group_by(func.split_part(LedgerAccount.code, ":", 1), LedgerAccount.currency))).all()
    return [{"family": f, "currency": c, "balance": str(b), "accounts": n} for f, c, b, n in rows]


@router.get("/ledger/entries")
async def ledger_entries(kind: str | None = Query(default=None), reference: str | None = Query(default=None),
                         limit: int = Query(default=100, le=500), _=Depends(require("ledger.view")),
                         db: AsyncSession = Depends(get_db)):
    stmt = select(JournalEntry).order_by(JournalEntry.posted_at.desc()).limit(limit)
    if kind:
        stmt = stmt.where(JournalEntry.kind == kind)
    if reference:
        stmt = stmt.where(JournalEntry.reference == reference)
    entries = list((await db.execute(stmt)).scalars())
    accounts = {}
    ids = {line.account_id for e in entries for line in e.lines}
    if ids:
        accounts = {a.id: a.code for a in (await db.execute(
            select(LedgerAccount).where(LedgerAccount.id.in_(ids)))).scalars()}
    return [{**row(e), "lines": [{**row(line), "accountCode": accounts.get(line.account_id)} for line in e.lines]}
            for e in entries]


@router.get("/ledger/accounts/{account_id}/lines")
async def account_lines(account_id: str, _=Depends(require("ledger.view")), db: AsyncSession = Depends(get_db)):
    account = await _get(db, LedgerAccount, _uuid(account_id))
    lines = (await db.execute(select(JournalLine, JournalEntry).join(JournalEntry).where(
        JournalLine.account_id == account.id).order_by(JournalLine.created_at.desc()).limit(500))).all()
    return {"account": row(account), "lines": [{**row(line), "reference": e.reference, "kind": e.kind,
                                                "description": e.description} for line, e in lines]}


# ─── Reconciliation ─────────────────────────────────────────────────────────


class StatementIn(CamelModel):
    provider: str
    csv: str


class ResolveIn(CamelModel):
    resolution: str
    note: str


@router.get("/reconciliation/runs")
async def recon_runs(_=Depends(require("reconciliation.view")), db: AsyncSession = Depends(get_db)):
    return [row(r) for r in (await db.execute(
        select(ReconciliationRun).order_by(ReconciliationRun.started_at.desc()).limit(100))).scalars()]


@router.post("/reconciliation/runs/ledger", status_code=201)
async def recon_run_ledger(ctx: AdminContext = Depends(require("reconciliation.run")),
                           db: AsyncSession = Depends(get_db)):
    run = await recon.run_ledger_integrity(db, started_by=ctx.admin.email if ctx.admin else "master_key")
    return row(run)


@router.post("/reconciliation/runs/statement", status_code=201)
async def recon_run_statement(body: StatementIn, ctx: AdminContext = Depends(require("reconciliation.run")),
                              db: AsyncSession = Depends(get_db)):
    run = await recon.run_provider_statement(db, provider=body.provider, csv_text=body.csv,
                                             started_by=ctx.admin.email if ctx.admin else "master_key")
    return row(run)


@router.get("/reconciliation/runs/{run_id}/items")
async def recon_items(run_id: str, _=Depends(require("reconciliation.view")), db: AsyncSession = Depends(get_db)):
    return [row(i) for i in (await db.execute(select(ReconciliationItem).where(
        ReconciliationItem.run_id == _uuid(run_id)).order_by(ReconciliationItem.created_at))).scalars()]


@router.post("/reconciliation/items/{item_id}/resolve")
async def recon_resolve(item_id: str, body: ResolveIn, ctx: AdminContext = Depends(require("reconciliation.resolve")),
                        db: AsyncSession = Depends(get_db)):
    """Closes an exception with an explanation. Any money correction it
    needs is a separate ledger.adjustment approval — never an edit here."""
    if body.resolution not in ("resolved", "ignored") or len(body.note.strip()) < 5:
        raise ApiError("Resolution must be resolved/ignored with a note")
    item = await _get(db, ReconciliationItem, _uuid(item_id))
    item.resolution = body.resolution
    item.resolution_note = body.note
    item.resolved_by = ctx.admin.email if ctx.admin else "master_key"
    await db.flush()
    return row(item)


@router.get("/funding-requests")
async def list_funding(status: str | None = Query(default=None), _=Depends(require("transactions.view")),
                       db: AsyncSession = Depends(get_db)):
    stmt = select(FundingRequest).order_by(FundingRequest.created_at.desc()).limit(200)
    if status:
        stmt = stmt.where(FundingRequest.status == status)
    return [row(f) for f in (await db.execute(stmt)).scalars()]


@router.get("/withdrawal-requests")
async def list_withdrawals(status: str | None = Query(default=None), _=Depends(require("transactions.view")),
                           db: AsyncSession = Depends(get_db)):
    stmt = select(WithdrawalRequest).order_by(WithdrawalRequest.created_at.desc()).limit(200)
    if status:
        stmt = stmt.where(WithdrawalRequest.status == status)
    return [row(w) for w in (await db.execute(stmt)).scalars()]


@router.post("/withdrawal-requests/{withdrawal_id}/confirm")
async def confirm_withdrawal(withdrawal_id: str, _=Depends(require("reconciliation.resolve")),
                             db: AsyncSession = Depends(get_db)):
    """Finance confirms a payout reached the beneficiary (bank statement):
    pending-payout liability → provider clearing."""
    from app.ledger import accounts as ledger_accounts

    w = (await db.execute(select(WithdrawalRequest).where(WithdrawalRequest.id == _uuid(withdrawal_id))
                          .with_for_update())).scalar_one_or_none()
    if w is None:
        raise ApiError("Withdrawal not found", status_code=404)
    if w.status != "submitted":
        raise ApiError(f"Withdrawal is {w.status}", status_code=409)
    await posting.post(db, kind="withdrawal_settled", description=f"Payout {w.reference} confirmed",
                       legs=[posting.debit(await ledger_accounts.payouts_pending(db, w.currency), w.amount),
                             posting.credit(await ledger_accounts.provider_clearing(db, w.provider, w.currency),
                                            w.amount)],
                       details={"withdrawal_request_id": str(w.id)})
    w.status = "completed"
    await db.flush()
    return row(w)


# ─── Compliance ─────────────────────────────────────────────────────────────


class CaseIn(CamelModel):
    title: str
    user_id: str | None = None
    merchant_id: str | None = None
    priority: str = "medium"


class CasePatch(CamelModel):
    status: str | None = None
    priority: str | None = None
    note: str | None = None
    assign_to_me: bool | None = None


@router.get("/compliance/cases")
async def list_cases(status: str | None = Query(default=None), _=Depends(require("compliance.view")),
                     db: AsyncSession = Depends(get_db)):
    stmt = select(ComplianceCase).order_by(ComplianceCase.created_at.desc()).limit(200)
    if status:
        stmt = stmt.where(ComplianceCase.status == status)
    return [row(c) for c in (await db.execute(stmt)).scalars()]


@router.post("/compliance/cases", status_code=201)
async def create_case(body: CaseIn, _=Depends(require("compliance.manage")), db: AsyncSession = Depends(get_db)):
    case = ComplianceCase(title=body.title, user_id=_uuid(body.user_id) if body.user_id else None,
                          merchant_id=_uuid(body.merchant_id) if body.merchant_id else None,
                          priority=body.priority, status="open", notes=[], evidence=[])
    db.add(case)
    await db.flush()
    return row(case)


@router.patch("/compliance/cases/{case_id}")
async def update_case(case_id: str, body: CasePatch, ctx: AdminContext = Depends(require("compliance.manage")),
                      db: AsyncSession = Depends(get_db)):
    case = await _get(db, ComplianceCase, _uuid(case_id))
    if body.status:
        case.status = body.status
        if body.status.startswith("closed"):
            case.closed_at = datetime.now(UTC)
    if body.priority:
        case.priority = body.priority
    if body.assign_to_me and ctx.admin:
        case.assigned_to = ctx.admin.id
    if body.note:
        case.notes = [*case.notes, {"at": datetime.now(UTC).isoformat(),
                                    "by": ctx.admin.email if ctx.admin else "master_key", "note": body.note}]
    await db.flush()
    return row(case)


@router.get("/compliance/risk-events")
async def list_risk_events(_=Depends(require("compliance.view")), db: AsyncSession = Depends(get_db)):
    return [row(e) for e in (await db.execute(
        select(RiskEvent).order_by(RiskEvent.created_at.desc()).limit(300))).scalars()]


@router.get("/compliance/screening")
async def list_screening(_=Depends(require("compliance.view")), db: AsyncSession = Depends(get_db)):
    return [row(s) for s in (await db.execute(
        select(ScreeningResult).order_by(ScreeningResult.created_at.desc()).limit(300))).scalars()]


# ─── Cross-border transfers ─────────────────────────────────────────────────


class FailIn(CamelModel):
    reason: str


@router.get("/cross-border-transfers")
async def list_transfers(status: str | None = Query(default=None), _=Depends(require("transactions.view")),
                         db: AsyncSession = Depends(get_db)):
    stmt = select(Transfer).order_by(Transfer.created_at.desc()).limit(200)
    if status:
        stmt = stmt.where(Transfer.status == status)
    return [row(t) for t in (await db.execute(stmt)).scalars()]


@router.post("/cross-border-transfers/{reference}/fail")
async def fail_transfer(reference: str, body: FailIn, _=Depends(require("reconciliation.resolve")),
                        db: AsyncSession = Depends(get_db)):
    """Operations marks an unsettled transfer as failed after confirming with
    the rail; the sender is refunded in full."""
    return row(await transfers.fail(db, reference, reason=f"admin: {body.reason}"))


# ─── Webhooks & audit ───────────────────────────────────────────────────────


@router.get("/webhooks")
async def list_webhooks(_=Depends(require("webhooks.view")), db: AsyncSession = Depends(get_db)):
    return [row(w) for w in (await db.execute(
        select(ProviderWebhook).order_by(ProviderWebhook.received_at.desc()).limit(300))).scalars()]


@router.get("/audit")
async def list_audit(action: str | None = Query(default=None), limit: int = Query(default=200, le=1000),
                     _=Depends(require("audit.view")), db: AsyncSession = Depends(get_db)):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action.like(f"%{action}%"))
    return [row(a) for a in (await db.execute(stmt)).scalars()]


# ─── Merchant KYB ───────────────────────────────────────────────────────────


class KybDecision(CamelModel):
    approve: bool
    reason: str | None = None


@router.get("/merchants/kyb")
async def kyb_queue(status: str = Query(default="pending"), _=Depends(require("merchants.view")),
                    db: AsyncSession = Depends(get_db)):
    return [row(m) for m in (await db.execute(select(Merchant).where(Merchant.kyb_status == status)
                                                .order_by(Merchant.created_at))).scalars()]


@router.post("/merchants/{merchant_id}/kyb")
async def kyb_decide(merchant_id: str, body: KybDecision, _=Depends(require("merchants.kyb_review")),
                     db: AsyncSession = Depends(get_db)):
    from app.models.enums import NotificationType
    from app.services import notification_service

    merchant = await _get(db, Merchant, _uuid(merchant_id))
    if merchant.kyb_status != "pending":
        raise ApiError(f"Merchant KYB is {merchant.kyb_status}", status_code=409)
    merchant.kyb_reviewed_at = datetime.now(UTC)
    if body.approve:
        merchant.kyb_status = "approved"
        merchant.verification_tier = "business"  # full KYB lifts the individual-seller caps
        merchant.kyb_rejection_reason = None
        await compliance.record_screening(db, merchant_id=merchant.id)
    else:
        if not body.reason:
            raise ApiError("A rejection reason is required")
        # An individual seller whose upgrade is rejected keeps selling under
        # the individual caps; a business is simply rejected.
        merchant.kyb_status = "approved" if merchant.verification_tier == "individual" else "rejected"
        merchant.kyb_rejection_reason = body.reason
    await notification_service.create_notification(
        db, merchant.user_id, NotificationType.SUCCESS if body.approve else NotificationType.WARNING,
        "Business verification " + ("approved" if body.approve else "rejected"),
        f"{merchant.business_name}: " + ("you can now accept payments." if body.approve else body.reason),
        related_id=str(merchant.id), related_type="merchant",
    )
    await db.flush()
    return row(merchant)


# ─── Network overview (dashboard) ───────────────────────────────────────────


@router.get("/network/overview")
async def overview(_=Depends(require("dashboard.view")), db: AsyncSession = Depends(get_db)):
    async def count(stmt):
        return (await db.execute(stmt)).scalar_one()

    by_status = dict((await db.execute(select(Country.status, func.count()).group_by(Country.status))).all())
    volume = (await db.execute(select(JournalLine.currency, func.sum(JournalLine.debit)).join(JournalEntry).where(
        JournalEntry.kind.in_(("p2p_transfer", "cross_border_debit", "merchant_payment", "payment_link_payment",
                               "wallet_topup", "withdrawal"))).group_by(JournalLine.currency))).all()
    return {
        "countries": by_status,
        "users": await count(select(func.count()).select_from(User)),
        "activeWallets": await count(select(func.count()).select_from(LedgerAccount).where(
            LedgerAccount.code.like("wallet:%"))),
        "merchants": await count(select(func.count()).select_from(Merchant)),
        "pendingKyb": await count(select(func.count()).select_from(Merchant).where(Merchant.kyb_status == "pending")),
        "pendingApprovals": await count(select(func.count()).select_from(ApprovalRequest).where(
            ApprovalRequest.status == "pending")),
        "openCases": await count(select(func.count()).select_from(ComplianceCase).where(
            ComplianceCase.status.in_(("open", "investigating", "escalated")))),
        "transfersInFlight": await count(select(func.count()).select_from(Transfer).where(
            Transfer.status.in_(("sender_debited", "instructed", "settled")))),
        "fundingInReview": await count(select(func.count()).select_from(FundingRequest).where(
            FundingRequest.status == "review")),
        "providers": [{"code": p.code, "status": p.status, "mode": p.mode} for p in
                      (await db.execute(select(PaymentProvider))).scalars()],
        "volumeByCurrency": [{"currency": c, "volume": str(v)} for c, v in volume],
    }


# ─── Private documents ──────────────────────────────────────────────────────


@router.get("/files/signed-url")
async def file_signed_url(ref: str = Query(...), _=Depends(require("kyc.view"))):
    """Short-lived link to a private KYC/KYB document."""
    from app.integrations import supabase_client

    if ref.startswith("data:"):
        return {"url": ref}
    try:
        return {"url": await supabase_client.signed_url(ref)}
    except RuntimeError as e:
        raise ApiError(str(e), status_code=503) from e


@router.get("/enquiries")
async def list_enquiries(_=Depends(require("support.view")), db: AsyncSession = Depends(get_db)):
    from app.models.platform import Enquiry

    return [row(e) for e in (await db.execute(select(Enquiry).order_by(Enquiry.created_at.desc()).limit(300))).scalars()]


@router.patch("/enquiries/{enquiry_id}")
async def update_enquiry(enquiry_id: str, body: dict, _=Depends(require("support.manage")),
                         db: AsyncSession = Depends(get_db)):
    from app.models.platform import Enquiry

    enquiry = await _get(db, Enquiry, _uuid(enquiry_id))
    if body.get("status") in ("new", "in_progress", "closed"):
        enquiry.status = body["status"]
    await db.flush()
    return row(enquiry)
