"""BukkaPay Boardroom API: analytics, financial reporting, investors, use of
funds, governance, documents, announcements, users and audit.

Every route goes through `require(permission)` (deny by default, role read
from the database). Every change is written to the Boardroom audit trail.
Investor-facing routes return company aggregates; an investor's own records
are looked up from their session, never from an id in the request.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.board import _log, require
from app.board import analytics as an
from app.board import audit, notify
from app.board import governance as gov
from app.board import permissions as perms
from app.board import service as svc
from app.board.money import ZERO, s
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.board import BoardAccessLog, BoardFinancial, BoardMember, BoardSession, BoardUpdate
from app.models.boardroom import (
    FUND_CATEGORIES,
    BoardAgendaItem,
    BoardBudget,
    BoardDocument,
    BoardKpiTarget,
    BoardMeeting,
    BoardMeetingAttendee,
    BoardMinutes,
    BoardNotification,
    BoardReportingPeriod,
    BoardReportPublication,
    BoardResolution,
    BoardResolutionEligibility,
    BoardResolutionVote,
    BoardRevenueStream,
    BoardroomAuditLog,
    BusinessMilestone,
    CapitalAllocation,
    CapitalAllocationChange,
    CapitalExpenditure,
    CompanyRisk,
    FundingRound,
    InvestorInvestment,
    InvestorProfile,
    ShareholderRecord,
)
from app.schemas.base import CamelModel

router = APIRouter(prefix="/api/board", tags=["boardroom"])


def _uuid(v: str | None) -> uuid.UUID:
    try:
        return uuid.UUID(str(v))
    except (ValueError, TypeError) as e:
        raise ApiError("Not found", status_code=404) from e


async def _get(db: AsyncSession, model, id_: str):
    obj = await db.get(model, _uuid(id_))
    if obj is None:
        raise ApiError("Not found", status_code=404)
    return obj


def _iso(v):
    return v.isoformat() if v else None


def who(m: BoardMember) -> str:
    return audit.actor_label(m)


async def _reporting(db: AsyncSession) -> str:
    return await svc.reporting_currency(db)


def period_params(kind: str = Query(default="month", pattern="^(day|week|month|quarter|year|custom)$"),
                  start: date | None = None, end: date | None = None) -> an.Period:
    return an.period_of(kind, start, end)


def _ccy(v: str) -> str:
    v = (v or "").upper()
    if len(v) != 3 or not v.isalpha():
        raise ValueError("Use a three-letter currency code")
    return v


# ═══ analytics ══════════════════════════════════════════════════════════════

@router.get("/dashboard")
async def dashboard(request: Request, p: an.Period = Depends(period_params),
                    m: BoardMember = Depends(require("dashboard.view")), db: AsyncSession = Depends(get_db)):
    reporting = await _reporting(db)
    ov = await svc.overview(db, months=12)
    ad = await an.adoption(db, p)
    rev = await an.revenue(db, p, reporting)
    prev = await an.revenue(db, p.previous(), reporting)
    cur = await an.currencies(db, p)
    cus = await an.custodians(db) if perms.can(m, "custodians.view") else None
    st = await gov.statements(db, p.start, p.end, reporting) if perms.can(m, "financials.view") else None
    if not perms.can(m, "financials.view"):
        for row in ov["series"]:
            row["costBreakdown"] = None
    recon = None
    if cus is not None:
        recon = ("reconciled" if cus["custodians"] and all((c["latest"] or {}).get("status") == "reconciled"
                                                           for c in cus["custodians"])
                 else "not_reconciled" if cus["custodians"] else "no_custodians")
    await _log(db, m, "viewed_executive_dashboard", request)
    return {
        "period": p.as_dict(), "previous": p.previous().as_dict(), "reportingCurrency": reporting,
        "generatedAt": datetime.now(UTC).isoformat(),
        "dataSources": ["Ledger", "Operational records", "Management accounts" if st and st["status"] != "unavailable"
                        else "Management accounts (not entered for this period)"],
        "reconciliationStatus": recon,
        "kpis": {
            "registeredCustomers": ad["customers"]["registered"], "newCustomers": ad["customers"]["newRegistrations"],
            "newCustomersChange": ad["customers"]["newRegistrationsChange"],
            "activeCustomers": ad["customers"]["active"], "activeCustomersChange": ad["customers"]["activeChange"],
            "monthlyActiveCustomers": ad["customers"]["monthlyActive"],
            "activeWallets": (await an.wallet(db, p))["activeWallets"],
            "totalMerchants": ad["merchants"]["registered"], "activeMerchants": ad["merchants"]["active"],
            "revenue": rev["converted"]["revenue"], "revenuePrevious": prev["converted"]["revenue"],
            "revenueChange": an._pct(Decimal(rev["converted"]["revenue"] or 0), Decimal(prev["converted"]["revenue"] or 0)),
            "grossProfit": rev["converted"]["grossProfit"],
            "transactionVolume": rev["converted"]["grossTransactionVolume"],
            "netProfit": (st or {}).get("totals", {}).get("netProfit") if st else None,
            "operatingExpenses": (st or {}).get("totals", {}).get("operatingExpenses") if st else None,
            "availableCash": ov["kpis"].get("cash"),
            "customerWalletLiabilities": [{"currency": c["code"], "amount": c["customerWalletBalances"]}
                                          for c in cur["currencies"]],
            "operationalCountries": ov["kpis"].get("countriesLive"), "pilotCountries": ov["kpis"].get("countriesPilot"),
            "supportedCurrencies": [c["code"] for c in cur["currencies"] if c["walletEnabled"]],
        },
        "series": ov["series"], "revenueStreams": rev["streams"], "currencies": cur["currencies"],
        "byCountry": ad["customers"]["byCountry"], "paymentMethods": (await an.wallet(db, p))["activity"],
        "fxMethodology": rev["converted"]["methodology"], "monthlyFxMethodology": ov.get("fxMethodology"),
        "statementsStatus": st["status"] if st else None,
    }


@router.get("/adoption")
async def adoption(request: Request, p: an.Period = Depends(period_params), country: str | None = Query(None, max_length=2),
                   m: BoardMember = Depends(require("adoption.view")), db: AsyncSession = Depends(get_db)):
    await _log(db, m, "viewed_adoption", request)
    return await an.adoption(db, p, country=country)


@router.get("/currencies")
async def currencies(p: an.Period = Depends(period_params), m: BoardMember = Depends(require("analytics.view")),
                     db: AsyncSession = Depends(get_db)):
    return await an.currencies(db, p)


@router.get("/wallets")
async def wallets(p: an.Period = Depends(period_params), country: str | None = Query(None, max_length=2),
                  currency: str | None = Query(None, max_length=3), group: str | None = Query(None, max_length=40),
                  m: BoardMember = Depends(require("analytics.view")), db: AsyncSession = Depends(get_db)):
    data = await an.wallet(db, p, country=country, currency=currency, group=group)
    if not perms.can(m, "financials.view"):
        data["financialModel"] = {k: v for k, v in data["financialModel"].items()
                                  if k in ("customer_liabilities", "merchant_liabilities", "safeguarded_assets")}
    return data


@router.get("/revenue")
async def revenue(p: an.Period = Depends(period_params), m: BoardMember = Depends(require("revenue.view")),
                  db: AsyncSession = Depends(get_db)):
    return await an.revenue(db, p, await _reporting(db))


@router.get("/financials")
async def financials(request: Request, start: date = Query(...), end: date = Query(...),
                     m: BoardMember = Depends(require("financials.view")), db: AsyncSession = Depends(get_db)):
    if end < start or (end - start).days > 3 * 366:
        raise ApiError("Choose up to three years", status_code=422)
    await _log(db, m, "viewed_financials", request)
    return await gov.statements(db, start, end, await _reporting(db))


@router.get("/financials.csv")
async def financials_csv(request: Request, start: date = Query(...), end: date = Query(...),
                         m: BoardMember = Depends(require("financials.view")), db: AsyncSession = Depends(get_db)):
    st = await gov.statements(db, start, end, await _reporting(db))
    await _log(db, m, "exported_financials_csv", request)
    cols = ["month", "accountsStatus", "revenue", "directCosts", "grossProfit", "operatingExpenses", "otherIncome",
            "ebitda", "depreciation", "amortisation", "financeCosts", "tax", "netProfit", "cash",
            "operatingCashFlow", "investingCashFlow", "financingCashFlow"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"BukkaPay financial statements in {st['reportingCurrency']} ({st['status']}). Each month converted "
                "at its own month-end rate."])
    w.writerow(cols)
    for r in st["months"]:
        w.writerow(["" if r.get(c) is None else r.get(c) for c in cols])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="bukkapay-financials.csv"',
                                      "Cache-Control": "no-store"})


@router.get("/cross-border")
async def cross_border(p: an.Period = Depends(period_params), m: BoardMember = Depends(require("crossborder.view")),
                       db: AsyncSession = Depends(get_db)):
    return await an.cross_border(db, p)


@router.get("/pos")
async def pos(p: an.Period = Depends(period_params), m: BoardMember = Depends(require("pos.view")),
              db: AsyncSession = Depends(get_db)):
    return await an.pos(db, p)


@router.get("/fx")
async def fx(p: an.Period = Depends(period_params), m: BoardMember = Depends(require("fx.view")),
             db: AsyncSession = Depends(get_db)):
    return await an.fx(db, p, await _reporting(db))


@router.get("/custodians")
async def custodians(m: BoardMember = Depends(require("custodians.view")), db: AsyncSession = Depends(get_db)):
    return await an.custodians(db)


class ReconIn(CamelModel):
    custodian_id: str
    currency: str
    statement_date: date
    reported_balance: Decimal = Field(ge=0, max_digits=20, decimal_places=2)
    pending_settlements: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=2)
    source: Literal["live_integration", "manual_statement", "management_reported"]
    document_id: str | None = None
    notes: str | None = Field(default=None, max_length=2000)

    _c = field_validator("currency")(lambda cls, v: _ccy(v))


@router.post("/custodians/reconciliations", status_code=201)
async def record_recon(body: ReconIn, request: Request, m: BoardMember = Depends(require("custodians.record")),
                       db: AsyncSession = Depends(get_db)):
    doc = None
    if body.document_id:
        d = await _get(db, BoardDocument, body.document_id)
        doc = d.id
    r = await an.record_reconciliation(db, custodian_id=_uuid(body.custodian_id), currency=body.currency,
                                       statement_date=body.statement_date, reported_balance=body.reported_balance,
                                       source=body.source, pending=body.pending_settlements, document_id=doc,
                                       notes=body.notes, by=who(m))
    await audit.record(db, "custodian.reconciliation_recorded", member=m, target_type="custodian_reconciliation",
                       target_id=r.id, after=audit.snapshot(r, ("custodian_id", "currency", "statement_date",
                                                                "reported_balance", "ledger_liability", "difference",
                                                                "source", "status")), request=request)
    return {"id": str(r.id), "status": r.status, "difference": s(r.difference, r.currency)}


@router.get("/countries")
async def countries(p: an.Period = Depends(period_params), m: BoardMember = Depends(require("countries.view")),
                    db: AsyncSession = Depends(get_db)):
    return await an.countries(db, p)


@router.get("/health")
async def health(m: BoardMember = Depends(require("risks.view")), db: AsyncSession = Depends(get_db)):
    return await an.health(db, await _reporting(db))


@router.get("/insights")
async def insights(request: Request, ai: bool = False, m: BoardMember = Depends(require("insights.view")),
                   db: AsyncSession = Depends(get_db)):
    ov = await svc.overview(db, months=6)
    facts = gov.observations(ov)
    out = {"observations": facts, "aiEnabled": gov.insights_configured(), "ai": None,
           "disclaimer": "Observations are calculated from the figures on this dashboard. They are not audited "
                         "financial reporting. Projections are labelled as such."}
    if ai:
        # Approved aggregates only: no customer, merchant or staff records ever go to a model.
        packet = {"reportingCurrency": ov["reportingCurrency"], "kpis": ov["kpis"],
                  "series": [{k: r.get(k) for k in ("month", "signups", "users", "mau", "transactions", "tpv",
                                                    "revenue", "grossProfit", "operatingCosts", "netProfit", "cash")}
                             for r in ov["series"]],
                  "revenueStreams": ov["revenueStreams"], "unconverted": ov["unconverted"]}
        out["ai"] = await gov.ai_summary(packet)
        await _log(db, m, "requested_ai_summary", request)
    return out


# ═══ investors and fundraising ══════════════════════════════════════════════

def _inv_row(i: InvestorInvestment) -> dict:
    return {"id": str(i.id), "roundId": str(i.round_id) if i.round_id else None, "instrument": i.instrument,
            "currency": i.currency, "committed": s(i.committed_amount, i.currency),
            "received": s(i.received_amount, i.currency),
            "outstanding": s(Decimal(i.committed_amount) - Decimal(i.received_amount), i.currency),
            "commitmentDate": _iso(i.commitment_date), "receivedDate": _iso(i.received_date), "status": i.status,
            "legalReference": i.legal_reference}


async def _register_totals(db: AsyncSession) -> tuple[Decimal, dict[str, Decimal]]:
    total = Decimal((await db.execute(select(func.coalesce(func.sum(ShareholderRecord.shares), 0)))).scalar_one())
    by_class = dict((await db.execute(select(ShareholderRecord.share_class, func.sum(ShareholderRecord.shares))
                                      .group_by(ShareholderRecord.share_class))).all())
    return total, {k: Decimal(v) for k, v in by_class.items()}


@router.get("/investments/me")
async def my_investments(request: Request, m: BoardMember = Depends(require("investments.own")),
                         db: AsyncSession = Depends(get_db)):
    """The signed-in member's own records only (looked up from their session)."""
    prof = (await db.execute(select(InvestorProfile).where(InvestorProfile.member_id == m.id))).scalar_one_or_none()
    await _log(db, m, "viewed_own_investments", request)
    if prof is None:
        return {"profile": None, "investments": [], "shareholdings": [],
                "note": "No investment records are linked to your account yet."}
    invs = (await db.execute(select(InvestorInvestment).where(InvestorInvestment.investor_id == prof.id)
                             .order_by(InvestorInvestment.commitment_date))).scalars().all()
    shares = (await db.execute(select(ShareholderRecord).where(ShareholderRecord.investor_id == prof.id)
                               .order_by(ShareholderRecord.effective_date))).scalars().all()
    total, by_class = await _register_totals(db)
    mine = sum((Decimal(x.shares) for x in shares), ZERO)
    return {"profile": {"legalName": prof.legal_name, "entityType": prof.entity_type, "country": prof.country},
            "investments": [_inv_row(i) for i in invs],
            "shareholdings": [{"shareClass": x.share_class, "shares": str(x.shares), "effectiveDate": _iso(x.effective_date),
                               "legalReference": x.legal_reference, "voting": x.voting,
                               "classPercent": an._ratio(x.shares, by_class.get(x.share_class), "0.0001")} for x in shares],
            "totalShares": str(mine), "ownershipPercent": an._ratio(mine, total, "0.0001"),
            "note": "Ownership is calculated from the share register recorded from BukkaPay's approved legal records. "
                    "The legal register is the authoritative record."}


async def _round_rows(db: AsyncSession) -> list[dict]:
    rounds = (await db.execute(select(FundingRound).order_by(FundingRound.opened_on.desc().nullslast(),
                                                             FundingRound.created_at.desc()))).scalars().all()
    sums = {r: (Decimal(c), Decimal(x), n) for r, c, x, n in (await db.execute(
        select(InvestorInvestment.round_id, func.coalesce(func.sum(InvestorInvestment.committed_amount), 0),
               func.coalesce(func.sum(InvestorInvestment.received_amount), 0), func.count())
        .where(InvestorInvestment.status != "cancelled").group_by(InvestorInvestment.round_id))).all()}
    out = []
    for r in rounds:
        c, x, n = sums.get(r.id, (ZERO, ZERO, 0))
        target = Decimal(r.target_amount)
        out.append({"id": str(r.id), "name": r.name, "instrument": r.instrument, "currency": r.currency,
                    "target": s(target, r.currency), "committed": s(c, r.currency), "received": s(x, r.currency),
                    "remaining": s(max(target - c, ZERO), r.currency), "progress": an._ratio(c, target),
                    "receivedProgress": an._ratio(x, target), "investors": n, "status": r.status,
                    "openedOn": _iso(r.opened_on), "closedOn": _iso(r.closed_on),
                    "valuationPreMoney": s(r.valuation_pre_money, r.currency) if r.valuation_pre_money and r.valuation_reference else None,
                    "valuationReference": r.valuation_reference if r.valuation_pre_money else None,
                    "notes": r.notes})
    return out


@router.get("/fundraising")
async def fundraising(m: BoardMember = Depends(require("fundraising.view")), db: AsyncSession = Depends(get_db)):
    return {"rounds": await _round_rows(db),
            "note": "Totals per round across all investors. Individual investors' amounts are private.",
            "valuationNote": "A valuation is shown only with the approval it rests on."}


@router.get("/investors")
async def investors(m: BoardMember = Depends(require("investors.view")), db: AsyncSession = Depends(get_db)):
    profs = (await db.execute(select(InvestorProfile).order_by(InvestorProfile.legal_name))).scalars().all()
    invs = (await db.execute(select(InvestorInvestment))).scalars().all()
    shares = (await db.execute(select(ShareholderRecord))).scalars().all()
    total, _ = await _register_totals(db)
    members = {x.id: x for x in (await db.execute(select(BoardMember))).scalars()}
    out = []
    for p in profs:
        mine = [x for x in shares if x.investor_id == p.id]
        n = sum((Decimal(x.shares) for x in mine), ZERO)
        out.append({"id": str(p.id), "legalName": p.legal_name, "entityType": p.entity_type, "country": p.country,
                    "contactEmail": p.contact_email if perms.can(m, "investors.manage") else None,
                    "member": members[p.member_id].name if p.member_id in members else None,
                    "memberId": str(p.member_id) if p.member_id else None, "notes": p.notes if perms.can(m, "investors.manage") else None,
                    "investments": [_inv_row(i) for i in invs if i.investor_id == p.id],
                    "shareholdings": [{"id": str(x.id), "shareClass": x.share_class, "shares": str(x.shares),
                                       "effectiveDate": _iso(x.effective_date), "legalReference": x.legal_reference,
                                       "voting": x.voting} for x in mine],
                    "totalShares": str(n), "ownershipPercent": an._ratio(n, total, "0.0001")})
    return {"investors": out, "registerTotalShares": str(total), "rounds": await _round_rows(db)}


class InvestorIn(CamelModel):
    legal_name: str = Field(min_length=2, max_length=200)
    entity_type: Literal["individual", "company", "fund", "trust", "other"] = "individual"
    country: str | None = Field(default=None, min_length=2, max_length=2)
    contact_email: str | None = Field(default=None, max_length=255)
    member_id: str | None = None
    notes: str | None = Field(default=None, max_length=4000)


async def _link_member(db: AsyncSession, member_id: str | None, prof_id=None) -> uuid.UUID | None:
    if not member_id:
        return None
    mm = await _get(db, BoardMember, member_id)
    other = (await db.execute(select(InvestorProfile).where(InvestorProfile.member_id == mm.id))).scalar_one_or_none()
    if other is not None and other.id != prof_id:
        raise ApiError("That member is already linked to another investor record", status_code=409)
    return mm.id


@router.post("/investors", status_code=201)
async def create_investor(body: InvestorIn, request: Request, m: BoardMember = Depends(require("investors.manage")),
                          db: AsyncSession = Depends(get_db)):
    p = InvestorProfile(legal_name=body.legal_name, entity_type=body.entity_type,
                        country=body.country.upper() if body.country else None, contact_email=body.contact_email,
                        notes=body.notes, member_id=await _link_member(db, body.member_id))
    db.add(p)
    await db.flush()
    await audit.record(db, "investor.created", member=m, target_type="investor_profile", target_id=p.id,
                       after=body.model_dump(), request=request)
    return {"id": str(p.id)}


@router.patch("/investors/{investor_id}")
async def update_investor(investor_id: str, body: InvestorIn, request: Request,
                          m: BoardMember = Depends(require("investors.manage")), db: AsyncSession = Depends(get_db)):
    p = await _get(db, InvestorProfile, investor_id)
    fields = ("legal_name", "entity_type", "country", "contact_email", "notes", "member_id")
    before = audit.snapshot(p, fields)
    p.legal_name, p.entity_type, p.contact_email, p.notes = body.legal_name, body.entity_type, body.contact_email, body.notes
    p.country = body.country.upper() if body.country else None
    p.member_id = await _link_member(db, body.member_id, p.id)
    await audit.record(db, "investor.updated", member=m, target_type="investor_profile", target_id=p.id,
                       before=before, after=audit.snapshot(p, fields), request=request)
    return {"id": str(p.id)}


class RoundIn(CamelModel):
    name: str = Field(min_length=2, max_length=120)
    instrument: str = Field(min_length=2, max_length=30)
    currency: str = "USD"
    target_amount: Decimal = Field(ge=0, max_digits=20, decimal_places=2)
    valuation_pre_money: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=2)
    valuation_reference: str | None = Field(default=None, max_length=500)
    status: Literal["planned", "open", "closed", "cancelled"] = "planned"
    opened_on: date | None = None
    closed_on: date | None = None
    notes: str | None = Field(default=None, max_length=4000)

    _c = field_validator("currency")(lambda cls, v: _ccy(v))


ROUND_FIELDS = ("name", "instrument", "currency", "target_amount", "valuation_pre_money", "valuation_reference",
                "status", "opened_on", "closed_on", "notes")


@router.post("/rounds", status_code=201)
async def create_round(body: RoundIn, request: Request, m: BoardMember = Depends(require("investors.manage")),
                       db: AsyncSession = Depends(get_db)):
    if body.valuation_pre_money is not None and not body.valuation_reference:
        raise ApiError("Add the approval reference for the valuation (e.g. the board resolution)", status_code=422)
    r = FundingRound(**body.model_dump())
    db.add(r)
    await db.flush()
    await audit.record(db, "round.created", member=m, target_type="funding_round", target_id=r.id,
                       after=body.model_dump(), request=request)
    return {"id": str(r.id)}


@router.patch("/rounds/{round_id}")
async def update_round(round_id: str, body: RoundIn, request: Request,
                       m: BoardMember = Depends(require("investors.manage")), db: AsyncSession = Depends(get_db)):
    r = await _get(db, FundingRound, round_id)
    if body.valuation_pre_money is not None and not body.valuation_reference:
        raise ApiError("Add the approval reference for the valuation", status_code=422)
    before = audit.snapshot(r, ROUND_FIELDS)
    for k, v in body.model_dump().items():
        setattr(r, k, v)
    await audit.record(db, "round.updated", member=m, target_type="funding_round", target_id=r.id, before=before,
                       after=audit.snapshot(r, ROUND_FIELDS), request=request)
    return {"id": str(r.id)}


class InvestmentIn(CamelModel):
    round_id: str | None = None
    instrument: str = Field(min_length=2, max_length=30)
    currency: str
    committed_amount: Decimal = Field(ge=0, max_digits=20, decimal_places=2)
    received_amount: Decimal = Field(default=Decimal(0), ge=0, max_digits=20, decimal_places=2)
    commitment_date: date | None = None
    received_date: date | None = None
    status: Literal["committed", "partially_received", "received", "cancelled"] = "committed"
    legal_reference: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=4000)

    _c = field_validator("currency")(lambda cls, v: _ccy(v))


INV_FIELDS = ("round_id", "instrument", "currency", "committed_amount", "received_amount", "commitment_date",
              "received_date", "status", "legal_reference", "notes")


async def _inv_values(db: AsyncSession, body: InvestmentIn) -> dict:
    d = body.model_dump()
    if body.received_amount > body.committed_amount:
        raise ApiError("Received can't be more than committed", status_code=422)
    if body.round_id:
        rnd = await _get(db, FundingRound, body.round_id)
        if rnd.currency != body.currency:
            raise ApiError(f"This round is in {rnd.currency}; record the investment in {rnd.currency}", status_code=422)
        d["round_id"] = rnd.id
    else:
        d["round_id"] = None
    return d


@router.post("/investors/{investor_id}/investments", status_code=201)
async def add_investment(investor_id: str, body: InvestmentIn, request: Request,
                         m: BoardMember = Depends(require("investors.manage")), db: AsyncSession = Depends(get_db)):
    p = await _get(db, InvestorProfile, investor_id)
    i = InvestorInvestment(investor_id=p.id, **(await _inv_values(db, body)))
    db.add(i)
    await db.flush()
    await audit.record(db, "investment.recorded", member=m, target_type="investor_investment", target_id=i.id,
                       after=audit.snapshot(i, INV_FIELDS), request=request)
    return {"id": str(i.id)}


@router.patch("/investments/{investment_id}")
async def update_investment(investment_id: str, body: InvestmentIn, request: Request,
                            m: BoardMember = Depends(require("investors.manage")), db: AsyncSession = Depends(get_db)):
    i = await _get(db, InvestorInvestment, investment_id)
    before = audit.snapshot(i, INV_FIELDS)
    for k, v in (await _inv_values(db, body)).items():
        setattr(i, k, v)
    await audit.record(db, "investment.updated", member=m, target_type="investor_investment", target_id=i.id,
                       before=before, after=audit.snapshot(i, INV_FIELDS), request=request)
    return {"id": str(i.id)}


class ShareIn(CamelModel):
    share_class: str = Field(default="Ordinary", min_length=1, max_length=40)
    shares: Decimal = Field(gt=0, max_digits=24, decimal_places=0)
    effective_date: date
    legal_reference: str = Field(min_length=2, max_length=500)
    source_document_id: str | None = None
    voting: bool = True
    notes: str | None = Field(default=None, max_length=2000)


@router.post("/investors/{investor_id}/shareholdings", status_code=201)
async def add_shareholding(investor_id: str, body: ShareIn, request: Request,
                           m: BoardMember = Depends(require("investors.manage")), db: AsyncSession = Depends(get_db)):
    """Copies a line from the approved legal share register. Doesn't issue shares."""
    p = await _get(db, InvestorProfile, investor_id)
    doc = (await _get(db, BoardDocument, body.source_document_id)).id if body.source_document_id else None
    x = ShareholderRecord(investor_id=p.id, share_class=body.share_class, shares=body.shares,
                          effective_date=body.effective_date, legal_reference=body.legal_reference,
                          source_document_id=doc, voting=body.voting, notes=body.notes)
    db.add(x)
    await db.flush()
    await audit.record(db, "shareholding.recorded", member=m, target_type="shareholder_record", target_id=x.id,
                       after=body.model_dump(), request=request)
    return {"id": str(x.id)}


@router.delete("/shareholdings/{record_id}")
async def remove_shareholding(record_id: str, request: Request, m: BoardMember = Depends(require("investors.manage")),
                              db: AsyncSession = Depends(get_db)):
    x = await _get(db, ShareholderRecord, record_id)
    before = audit.snapshot(x, ("investor_id", "share_class", "shares", "effective_date", "legal_reference"))
    await db.delete(x)
    await audit.record(db, "shareholding.removed", member=m, target_type="shareholder_record", target_id=record_id,
                       before=before, request=request)
    return {"removed": True}


# ═══ use of funds ═══════════════════════════════════════════════════════════

FUND_LABELS = {c: c.replace("_", " ").capitalize().replace("Pos ", "POS ").replace("Psp ", "PSP ")
               for c in FUND_CATEGORIES}


@router.get("/use-of-funds")
async def use_of_funds(round_id: str | None = None, m: BoardMember = Depends(require("use_of_funds.view")),
                       db: AsyncSession = Depends(get_db)):
    q = select(CapitalAllocation)
    if round_id:
        q = q.where(CapitalAllocation.round_id == _uuid(round_id))
    allocs = (await db.execute(q)).scalars().all()
    spent = {a: (Decimal(t), n) for a, t, n in (await db.execute(
        select(CapitalExpenditure.allocation_id, func.sum(CapitalExpenditure.amount), func.count())
        .group_by(CapitalExpenditure.allocation_id))).all()}
    exps = (await db.execute(select(CapitalExpenditure).order_by(CapitalExpenditure.spent_on.desc()))).scalars().all()
    rows = []
    for a in sorted(allocs, key=lambda x: FUND_CATEGORIES.index(x.category) if x.category in FUND_CATEGORIES else 99):
        sp, n = spent.get(a.id, (ZERO, 0))
        rows.append({"id": str(a.id), "roundId": str(a.round_id) if a.round_id else None, "category": a.category,
                     "label": FUND_LABELS.get(a.category, a.category), "currency": a.currency,
                     "approvedBudget": s(a.approved_budget, a.currency), "allocated": s(a.allocated, a.currency),
                     "spent": s(sp, a.currency), "remaining": s(Decimal(a.allocated) - sp, a.currency),
                     "utilisation": an._ratio(sp, a.allocated), "responsible": a.responsible, "notes": a.notes,
                     "expenditures": [{"id": str(e.id), "date": e.spent_on.isoformat(), "amount": s(e.amount, e.currency),
                                       "currency": e.currency, "description": e.description, "supplier": e.supplier,
                                       "invoiceDocumentId": str(e.invoice_document_id) if e.invoice_document_id else None,
                                       "recordedBy": e.recorded_by} for e in exps if e.allocation_id == a.id]})
    changes = (await db.execute(select(CapitalAllocationChange).order_by(CapitalAllocationChange.created_at.desc())
                                .limit(100))).scalars().all()
    totals: dict[str, dict] = {}
    for r in rows:
        t = totals.setdefault(r["currency"], {"approved": ZERO, "allocated": ZERO, "spent": ZERO})
        t["approved"] += Decimal(r["approvedBudget"])
        t["allocated"] += Decimal(r["allocated"])
        t["spent"] += Decimal(r["spent"])
    return {"categories": rows, "categoryOptions": [{"code": c, "label": FUND_LABELS[c]} for c in FUND_CATEGORIES],
            "totals": [{"currency": c, "approvedBudget": s(t["approved"], c), "allocated": s(t["allocated"], c),
                        "spent": s(t["spent"], c), "remaining": s(t["allocated"] - t["spent"], c),
                        "utilisation": an._ratio(t["spent"], t["allocated"])} for c, t in totals.items()],
            "changes": [{"id": str(c.id), "category": c.category, "currency": c.currency, "before": c.before,
                         "after": c.after, "reason": c.reason, "status": c.status, "proposedBy": c.proposed_by,
                         "decidedBy": c.decided_by, "decidedAt": _iso(c.decided_at), "createdAt": _iso(c.created_at)}
                        for c in changes],
            "approvalRule": "Budget changes take effect only after someone other than the proposer approves them."}


class AllocationChangeIn(CamelModel):
    round_id: str | None = None
    category: str
    currency: str = "USD"
    approved_budget: Decimal = Field(ge=0, max_digits=20, decimal_places=2)
    allocated: Decimal = Field(ge=0, max_digits=20, decimal_places=2)
    responsible: str | None = Field(default=None, max_length=160)
    reason: str = Field(min_length=5, max_length=2000)

    _c = field_validator("currency")(lambda cls, v: _ccy(v))


@router.post("/use-of-funds/changes", status_code=201)
async def propose_change(body: AllocationChangeIn, request: Request,
                         m: BoardMember = Depends(require("use_of_funds.propose")), db: AsyncSession = Depends(get_db)):
    if body.category not in FUND_CATEGORIES:
        raise ApiError("Unknown category", status_code=422)
    if body.allocated > body.approved_budget:
        raise ApiError("You can't allocate more than the approved budget", status_code=422)
    rid = _uuid(body.round_id) if body.round_id else None
    if rid:
        await _get(db, FundingRound, str(rid))
    a = (await db.execute(select(CapitalAllocation).where(CapitalAllocation.round_id.is_(None) if rid is None else
                                                          CapitalAllocation.round_id == rid,
                                                          CapitalAllocation.category == body.category))).scalar_one_or_none()
    if a is not None and a.currency != body.currency:
        raise ApiError(f"This budget is in {a.currency}", status_code=422)
    c = CapitalAllocationChange(allocation_id=a.id if a else None, round_id=rid, category=body.category,
                                currency=body.currency,
                                before=audit.snapshot(a, ("approved_budget", "allocated", "responsible")) if a else None,
                                after={"approved_budget": str(body.approved_budget), "allocated": str(body.allocated),
                                       "responsible": body.responsible},
                                reason=body.reason, proposed_by=who(m))
    db.add(c)
    await db.flush()
    await audit.record(db, "use_of_funds.change_proposed", member=m, target_type="capital_allocation_change",
                       target_id=c.id, after=c.after, request=request)
    approvers = [x for x in await notify.recipients(db, "use_of_funds.approve") if x.id != m.id]
    await notify.notify(db, approvers, kind="approval_needed", title="A budget change needs approval",
                        body=f"{FUND_LABELS[body.category]}: proposed by {m.name}.", link="/use-of-funds")
    return {"id": str(c.id), "status": c.status}


class DecisionIn(CamelModel):
    approve: bool
    note: str | None = Field(default=None, max_length=1000)


@router.post("/use-of-funds/changes/{change_id}/decide")
async def decide_change(change_id: str, body: DecisionIn, request: Request,
                        m: BoardMember = Depends(require("use_of_funds.approve")), db: AsyncSession = Depends(get_db)):
    c = await _get(db, CapitalAllocationChange, change_id)
    if c.status != "pending":
        raise ApiError("This change has already been decided", status_code=409)
    self_approval = c.proposed_by == who(m)
    if self_approval:
        others = [x for x in await notify.recipients(db, "use_of_funds.approve") if x.id != m.id]
        if others or not svc.is_owner(m):
            raise ApiError("Someone other than the proposer must approve this change", status_code=403)
    c.status = "approved" if body.approve else "rejected"
    c.decided_by = who(m) + (" (self-approved: no second approver is set up)" if self_approval else "")
    c.decided_at = datetime.now(UTC)
    if body.approve:
        a = await db.get(CapitalAllocation, c.allocation_id) if c.allocation_id else None
        if a is None:
            a = CapitalAllocation(round_id=c.round_id, category=c.category, currency=c.currency)
            db.add(a)
        a.approved_budget = Decimal(c.after["approved_budget"])
        a.allocated = Decimal(c.after["allocated"])
        a.responsible = c.after.get("responsible")
        await db.flush()
        c.allocation_id = a.id
    await audit.record(db, f"use_of_funds.change_{c.status}", member=m, target_type="capital_allocation_change",
                       target_id=c.id, before=c.before, after=c.after | {"note": body.note}, request=request)
    return {"status": c.status}


class ExpenditureIn(CamelModel):
    allocation_id: str
    spent_on: date
    amount: Decimal = Field(gt=0, max_digits=20, decimal_places=2)
    currency: str
    description: str = Field(min_length=3, max_length=2000)
    supplier: str | None = Field(default=None, max_length=200)
    invoice_document_id: str | None = None

    _c = field_validator("currency")(lambda cls, v: _ccy(v))


@router.post("/use-of-funds/expenditures", status_code=201)
async def record_expenditure(body: ExpenditureIn, request: Request,
                             m: BoardMember = Depends(require("use_of_funds.propose")), db: AsyncSession = Depends(get_db)):
    a = await _get(db, CapitalAllocation, body.allocation_id)
    if body.currency != a.currency:
        raise ApiError(f"Record spending in the budget's currency ({a.currency})", status_code=422)
    doc = (await _get(db, BoardDocument, body.invoice_document_id)).id if body.invoice_document_id else None
    e = CapitalExpenditure(allocation_id=a.id, spent_on=body.spent_on, amount=body.amount, currency=body.currency,
                           description=body.description, supplier=body.supplier, invoice_document_id=doc,
                           recorded_by=who(m))
    db.add(e)
    await db.flush()
    await audit.record(db, "use_of_funds.expenditure_recorded", member=m, target_type="capital_expenditure",
                       target_id=e.id, after=body.model_dump(), request=request)
    return {"id": str(e.id)}


# ═══ milestones and risks ═══════════════════════════════════════════════════

class MilestoneIn(CamelModel):
    category: str = Field(min_length=2, max_length=40)
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    responsible: str | None = Field(default=None, max_length=160)
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    target_date: date | None = None
    completed_on: date | None = None
    status: Literal["planned", "in_progress", "completed", "delayed", "cancelled"] = "planned"
    progress: int = Field(default=0, ge=0, le=100)
    partnership_stage: Literal["not_applicable", "proposed", "in_discussion", "signed", "live"] = "not_applicable"
    document_ids: list[str] = Field(default_factory=list, max_length=20)
    comments: str | None = Field(default=None, max_length=4000)


MS_FIELDS = ("category", "title", "description", "responsible", "country_code", "target_date", "completed_on",
             "status", "progress", "partnership_stage", "document_ids", "comments")


def _ms(x: BusinessMilestone) -> dict:
    return {"id": str(x.id), **{k: (v.isoformat() if isinstance(v, date) else v) for k, v in
                                ((k, getattr(x, k)) for k in MS_FIELDS)}}


@router.get("/milestones")
async def milestones(m: BoardMember = Depends(require("milestones.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BusinessMilestone).order_by(BusinessMilestone.target_date.nullslast()))).scalars().all()
    return {"milestones": [_ms(x) for x in rows],
            "stageLabels": {"not_applicable": "—", "proposed": "Proposed", "in_discussion": "In discussion",
                            "signed": "Signed (confirmed)", "live": "Live"},
            "note": "Only 'Signed' and 'Live' partnerships are confirmed. 'Proposed' and 'In discussion' are not."}


async def _ms_values(db: AsyncSession, body: MilestoneIn) -> dict:
    d = body.model_dump()
    d["country_code"] = body.country_code.upper() if body.country_code else None
    for did in body.document_ids:
        await _get(db, BoardDocument, did)
    if body.status == "completed":
        d["progress"] = 100
        d["completed_on"] = body.completed_on or datetime.now(UTC).date()
    return d


@router.post("/milestones", status_code=201)
async def create_milestone(body: MilestoneIn, request: Request, m: BoardMember = Depends(require("milestones.manage")),
                           db: AsyncSession = Depends(get_db)):
    x = BusinessMilestone(**(await _ms_values(db, body)))
    db.add(x)
    await db.flush()
    await audit.record(db, "milestone.created", member=m, target_type="business_milestone", target_id=x.id,
                       after=_ms(x), request=request)
    return _ms(x)


@router.patch("/milestones/{milestone_id}")
async def update_milestone(milestone_id: str, body: MilestoneIn, request: Request,
                           m: BoardMember = Depends(require("milestones.manage")), db: AsyncSession = Depends(get_db)):
    x = await _get(db, BusinessMilestone, milestone_id)
    before = _ms(x)
    for k, v in (await _ms_values(db, body)).items():
        setattr(x, k, v)
    await db.flush()
    await audit.record(db, "milestone.updated", member=m, target_type="business_milestone", target_id=x.id,
                       before=before, after=_ms(x), request=request)
    return _ms(x)


class RiskIn(CamelModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    category: str = Field(min_length=2, max_length=40)
    likelihood: int = Field(ge=1, le=5)
    impact: int = Field(ge=1, le=5)
    owner: str | None = Field(default=None, max_length=160)
    mitigation: str | None = Field(default=None, max_length=4000)
    status: Literal["open", "mitigating", "accepted", "closed"] = "open"
    review_date: date | None = None


RISK_FIELDS = ("title", "description", "category", "likelihood", "impact", "owner", "mitigation", "status", "review_date")


def _risk(x: CompanyRisk) -> dict:
    d = {"id": str(x.id), **{k: (v.isoformat() if isinstance(v, date) else v) for k, v in
                             ((k, getattr(x, k)) for k in RISK_FIELDS)}}
    score = x.likelihood * x.impact
    d["score"], d["rating"] = score, "high" if score >= 15 else "medium" if score >= 8 else "low"
    return d


@router.get("/risks")
async def risks(m: BoardMember = Depends(require("risks.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(CompanyRisk))).scalars().all()
    return {"risks": sorted((_risk(x) for x in rows), key=lambda r: (r["status"] == "closed", -r["score"]))}


@router.post("/risks", status_code=201)
async def create_risk(body: RiskIn, request: Request, m: BoardMember = Depends(require("risks.manage")),
                      db: AsyncSession = Depends(get_db)):
    x = CompanyRisk(**body.model_dump())
    db.add(x)
    await db.flush()
    await audit.record(db, "risk.created", member=m, target_type="company_risk", target_id=x.id, after=_risk(x),
                       request=request)
    return _risk(x)


@router.patch("/risks/{risk_id}")
async def update_risk(risk_id: str, body: RiskIn, request: Request, m: BoardMember = Depends(require("risks.manage")),
                      db: AsyncSession = Depends(get_db)):
    x = await _get(db, CompanyRisk, risk_id)
    before = _risk(x)
    for k, v in body.model_dump().items():
        setattr(x, k, v)
    await audit.record(db, "risk.updated", member=m, target_type="company_risk", target_id=x.id, before=before,
                       after=_risk(x), request=request)
    return _risk(x)


# ═══ meetings ═══════════════════════════════════════════════════════════════

async def _members_by_id(db: AsyncSession) -> dict:
    return {x.id: x for x in (await db.execute(select(BoardMember))).scalars()}


async def _meeting(db: AsyncSession, mt: BoardMeeting, viewer: BoardMember) -> dict:
    members = await _members_by_id(db)
    att = (await db.execute(select(BoardMeetingAttendee).where(BoardMeetingAttendee.meeting_id == mt.id))).scalars().all()
    agenda = (await db.execute(select(BoardAgendaItem).where(BoardAgendaItem.meeting_id == mt.id)
                               .order_by(BoardAgendaItem.position))).scalars().all()
    minutes = (await db.execute(select(BoardMinutes).where(BoardMinutes.meeting_id == mt.id))).scalar_one_or_none()
    manage = perms.can(viewer, "meetings.manage")
    show_minutes = minutes is not None and (manage or minutes.status == "published")
    return {"id": str(mt.id), "title": mt.title, "kind": mt.kind, "scheduledAt": mt.scheduled_at.isoformat(),
            "durationMinutes": mt.duration_minutes, "location": mt.location, "videoLink": mt.video_link,
            "status": mt.status, "createdBy": mt.created_by,
            "attendees": [{"memberId": str(a.member_id), "name": members[a.member_id].name if a.member_id in members else "—",
                           "role": perms.role_of(members[a.member_id]) if a.member_id in members else None,
                           "attendance": a.attendance} for a in att],
            "agenda": [{"id": str(i.id), "position": i.position, "title": i.title, "presenter": i.presenter,
                        "notes": i.notes, "documentIds": i.document_ids} for i in agenda],
            "minutes": {"status": minutes.status, "body": minutes.body, "approvedBy": minutes.approved_by,
                        "publishedAt": _iso(minutes.published_at)} if show_minutes else None}


@router.get("/meetings")
async def meetings(m: BoardMember = Depends(require("governance.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardMeeting).order_by(BoardMeeting.scheduled_at.desc()).limit(100))).scalars().all()
    return {"meetings": [await _meeting(db, x, m) for x in rows]}


class MeetingIn(CamelModel):
    title: str = Field(min_length=3, max_length=200)
    kind: Literal["board", "committee", "agm", "egm", "investor"] = "board"
    scheduled_at: datetime
    duration_minutes: int = Field(default=60, ge=10, le=600)
    location: str | None = Field(default=None, max_length=200)
    video_link: str | None = Field(default=None, max_length=500, pattern=r"^https://")
    attendee_ids: list[str] = Field(default_factory=list, max_length=100)


async def _set_attendees(db: AsyncSession, mt: BoardMeeting, ids: list[str]) -> list[BoardMember]:
    wanted = {(await _get(db, BoardMember, i)).id for i in ids}
    existing = {a.member_id: a for a in (await db.execute(select(BoardMeetingAttendee)
                                                          .where(BoardMeetingAttendee.meeting_id == mt.id))).scalars()}
    added = []
    for mid in wanted - set(existing):
        db.add(BoardMeetingAttendee(meeting_id=mt.id, member_id=mid))
        added.append(await db.get(BoardMember, mid))
    for mid in set(existing) - wanted:
        await db.delete(existing[mid])
    await db.flush()
    return added


@router.post("/meetings", status_code=201)
async def create_meeting(body: MeetingIn, request: Request, m: BoardMember = Depends(require("meetings.manage")),
                         db: AsyncSession = Depends(get_db)):
    mt = BoardMeeting(title=body.title, kind=body.kind, scheduled_at=body.scheduled_at,
                      duration_minutes=body.duration_minutes, location=body.location, video_link=body.video_link,
                      created_by=who(m))
    db.add(mt)
    await db.flush()
    added = await _set_attendees(db, mt, body.attendee_ids)
    await audit.record(db, "meeting.created", member=m, target_type="board_meeting", target_id=mt.id,
                       after=body.model_dump(), request=request)
    await notify.notify(db, added, kind="meeting_scheduled", title=f"Meeting scheduled: {mt.title}",
                        body=f"{mt.scheduled_at:%d %b %Y %H:%M} UTC.", link="/meetings")
    return await _meeting(db, mt, m)


@router.patch("/meetings/{meeting_id}")
async def update_meeting(meeting_id: str, body: MeetingIn, request: Request,
                         m: BoardMember = Depends(require("meetings.manage")), db: AsyncSession = Depends(get_db)):
    mt = await _get(db, BoardMeeting, meeting_id)
    before = await _meeting(db, mt, m)
    for k in ("title", "kind", "scheduled_at", "duration_minutes", "location", "video_link"):
        setattr(mt, k, getattr(body, k))
    added = await _set_attendees(db, mt, body.attendee_ids)
    await audit.record(db, "meeting.updated", member=m, target_type="board_meeting", target_id=mt.id, before=before,
                       after=body.model_dump(), request=request)
    await notify.notify(db, added, kind="meeting_scheduled", title=f"Meeting scheduled: {mt.title}",
                        body=f"{mt.scheduled_at:%d %b %Y %H:%M} UTC.", link="/meetings")
    return await _meeting(db, mt, m)


class MeetingStatusIn(CamelModel):
    status: Literal["scheduled", "held", "cancelled"]


@router.post("/meetings/{meeting_id}/status")
async def meeting_status(meeting_id: str, body: MeetingStatusIn, request: Request,
                         m: BoardMember = Depends(require("meetings.manage")), db: AsyncSession = Depends(get_db)):
    mt = await _get(db, BoardMeeting, meeting_id)
    before = mt.status
    mt.status = body.status
    await audit.record(db, "meeting.status_changed", member=m, target_type="board_meeting", target_id=mt.id,
                       before={"status": before}, after={"status": mt.status}, request=request)
    return {"status": mt.status}


class AgendaIn(CamelModel):
    items: list[dict] = Field(max_length=50)


@router.put("/meetings/{meeting_id}/agenda")
async def set_agenda(meeting_id: str, body: AgendaIn, request: Request,
                     m: BoardMember = Depends(require("meetings.manage")), db: AsyncSession = Depends(get_db)):
    mt = await _get(db, BoardMeeting, meeting_id)
    for old in (await db.execute(select(BoardAgendaItem).where(BoardAgendaItem.meeting_id == mt.id))).scalars():
        await db.delete(old)
    await db.flush()
    for i, it in enumerate(body.items):
        title = str(it.get("title") or "").strip()[:200]
        if len(title) < 2:
            raise ApiError(f"Agenda item {i + 1} needs a title", status_code=422)
        docs = [str(d) for d in (it.get("documentIds") or [])][:20]
        for d in docs:
            await _get(db, BoardDocument, d)
        db.add(BoardAgendaItem(meeting_id=mt.id, position=i + 1, title=title,
                               presenter=(str(it.get("presenter") or "")[:160] or None),
                               notes=(str(it.get("notes") or "")[:4000] or None), document_ids=docs))
    await db.flush()
    await audit.record(db, "meeting.agenda_set", member=m, target_type="board_meeting", target_id=mt.id,
                       after={"items": body.items}, request=request)
    return await _meeting(db, mt, m)


class AttendanceIn(CamelModel):
    attendance: dict[str, Literal["invited", "present", "absent", "apologies"]]


@router.put("/meetings/{meeting_id}/attendance")
async def set_attendance(meeting_id: str, body: AttendanceIn, request: Request,
                         m: BoardMember = Depends(require("meetings.manage")), db: AsyncSession = Depends(get_db)):
    mt = await _get(db, BoardMeeting, meeting_id)
    att = {str(a.member_id): a for a in (await db.execute(select(BoardMeetingAttendee)
                                                          .where(BoardMeetingAttendee.meeting_id == mt.id))).scalars()}
    for mid, v in body.attendance.items():
        if mid not in att:
            raise ApiError("Add the person to the meeting first", status_code=422)
        att[mid].attendance = v
    await audit.record(db, "meeting.attendance_recorded", member=m, target_type="board_meeting", target_id=mt.id,
                       after=body.attendance, request=request)
    return await _meeting(db, mt, m)


class MinutesIn(CamelModel):
    body: str = Field(min_length=10, max_length=100_000)
    status: Literal["draft", "approved", "published"] = "draft"


@router.put("/meetings/{meeting_id}/minutes")
async def set_minutes(meeting_id: str, body: MinutesIn, request: Request,
                      m: BoardMember = Depends(require("meetings.manage")), db: AsyncSession = Depends(get_db)):
    mt = await _get(db, BoardMeeting, meeting_id)
    mn = (await db.execute(select(BoardMinutes).where(BoardMinutes.meeting_id == mt.id))).scalar_one_or_none()
    if mn is not None and mn.status == "published":
        raise ApiError("Published minutes can't be changed", status_code=409)
    if mn is None:
        mn = BoardMinutes(meeting_id=mt.id, body=body.body)
        db.add(mn)
    before = {"status": mn.status, "body": mn.body} if mn.id else None
    mn.body, mn.status = body.body, body.status
    if body.status in ("approved", "published"):
        mn.approved_by = mn.approved_by or who(m)
    if body.status == "published":
        mn.published_at = datetime.now(UTC)
    await db.flush()
    await audit.record(db, f"minutes.{body.status}", member=m, target_type="board_minutes", target_id=mn.id,
                       before=before, after={"status": mn.status}, request=request)
    if body.status == "published":
        await notify.notify(db, await notify.recipients(db, "governance.view"), kind="minutes_published",
                            title=f"Minutes published: {mt.title}", link="/meetings")
    return await _meeting(db, mt, m)


# ═══ resolutions ════════════════════════════════════════════════════════════

async def _resolution(db: AsyncSession, r: BoardResolution, viewer: BoardMember) -> dict:
    members = await _members_by_id(db)
    el = (await db.execute(select(BoardResolutionEligibility).where(BoardResolutionEligibility.resolution_id == r.id))).scalars().all()
    votes = (await db.execute(select(BoardResolutionVote).where(BoardResolutionVote.resolution_id == r.id))).scalars().all()
    mine = next((v for v in votes if v.member_id == viewer.id), None)
    manage = perms.can(viewer, "resolutions.manage")
    eligible_me = any(e.member_id == viewer.id for e in el)
    d = {"id": str(r.id), "reference": r.reference, "title": r.title, "body": r.body, "bodyType": r.body_type,
         "threshold": r.threshold, "quorum": r.quorum, "weighted": r.weighted, "weightingBasis": r.weighting_basis,
         "documentIds": r.document_ids, "opensAt": _iso(r.opens_at), "closesAt": _iso(r.closes_at), "status": r.status,
         "outcome": r.outcome, "concludedAt": _iso(r.concluded_at), "createdBy": r.created_by,
         "meetingId": str(r.meeting_id) if r.meeting_id else None,
         "eligibleCount": len(el), "votesCast": len(votes), "iAmEligible": eligible_me,
         "myVote": mine.choice if mine else None, "canVote": eligible_me and mine is None and r.status == "open",
         "result": r.result if r.status == "concluded" else None}
    if manage or r.status == "concluded":
        voted = {v.member_id: v for v in votes}
        d["voters"] = [{"name": members[e.member_id].name if e.member_id in members else "—", "weight": str(e.weight),
                        "voted": e.member_id in voted,
                        "choice": voted[e.member_id].choice if (r.status == "concluded" and e.member_id in voted) else None}
                       for e in el]
    return d


def _can_see_resolution(m: BoardMember, r: BoardResolution, eligible: bool) -> bool:
    if perms.can(m, "resolutions.manage"):
        return True
    if r.status == "draft":
        return False
    if r.body_type == "board":
        return perms.can(m, "governance.view") or eligible
    return perms.can(m, "resolutions.view") and (eligible or perms.can(m, "governance.view"))


@router.get("/resolutions")
async def resolutions(m: BoardMember = Depends(require("resolutions.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardResolution).order_by(BoardResolution.created_at.desc()).limit(200))).scalars().all()
    mine = set((await db.execute(select(BoardResolutionEligibility.resolution_id)
                                 .where(BoardResolutionEligibility.member_id == m.id))).scalars().all())
    return {"resolutions": [await _resolution(db, r, m) for r in rows if _can_see_resolution(m, r, r.id in mine)]}


class ResolutionIn(CamelModel):
    title: str = Field(min_length=5, max_length=200)
    body: str = Field(min_length=10, max_length=50_000)
    body_type: Literal["board", "shareholders"] = "board"
    threshold: Literal["simple_majority", "two_thirds", "three_quarters", "unanimous"] = "simple_majority"
    quorum: int = Field(default=1, ge=1, le=500)
    weighted: bool = False
    weighting_basis: str | None = Field(default=None, max_length=1000)
    closes_at: datetime | None = None
    meeting_id: str | None = None
    document_ids: list[str] = Field(default_factory=list, max_length=20)
    eligible_member_ids: list[str] | None = Field(default=None, max_length=500)


@router.post("/resolutions", status_code=201)
async def create_resolution(body: ResolutionIn, request: Request, m: BoardMember = Depends(require("resolutions.manage")),
                            db: AsyncSession = Depends(get_db)):
    if body.weighted and body.body_type == "board":
        raise ApiError("Board resolutions are one director, one vote", status_code=422)
    if body.weighted and not body.weighting_basis:
        raise ApiError("Say which constitutional document or agreement authorises weighted voting", status_code=422)
    for d in body.document_ids:
        await _get(db, BoardDocument, d)
    defaults = await gov.default_eligibility(db, body.body_type, body.weighted)
    if body.eligible_member_ids is not None:
        allowed = {x.id: w for x, w in defaults}
        chosen = []
        for i in body.eligible_member_ids:
            mid = _uuid(i)
            if mid not in allowed:
                raise ApiError("Only directors vote on board resolutions, and only registered shareholders on "
                               "shareholder resolutions", status_code=422)
            chosen.append((mid, allowed[mid]))
    else:
        chosen = [(x.id, w) for x, w in defaults]
    if not chosen:
        raise ApiError("There's nobody eligible to vote on this resolution yet", status_code=422)
    if body.quorum > len(chosen):
        raise ApiError("The quorum is larger than the number of eligible voters", status_code=422)
    r = BoardResolution(reference=await gov.next_reference(db), title=body.title, body=body.body,
                        body_type=body.body_type, threshold=body.threshold, quorum=body.quorum, weighted=body.weighted,
                        weighting_basis=body.weighting_basis, closes_at=body.closes_at,
                        meeting_id=(await _get(db, BoardMeeting, body.meeting_id)).id if body.meeting_id else None,
                        document_ids=body.document_ids, created_by=who(m))
    db.add(r)
    await db.flush()
    for mid, w in chosen:
        db.add(BoardResolutionEligibility(resolution_id=r.id, member_id=mid, weight=w))
    await db.flush()
    await audit.record(db, "resolution.created", member=m, target_type="board_resolution", target_id=r.id,
                       after=body.model_dump() | {"reference": r.reference}, request=request)
    return await _resolution(db, r, m)


@router.post("/resolutions/{resolution_id}/open")
async def open_resolution(resolution_id: str, request: Request, m: BoardMember = Depends(require("resolutions.manage")),
                          db: AsyncSession = Depends(get_db)):
    r = await _get(db, BoardResolution, resolution_id)
    if r.status != "draft":
        raise ApiError("Only a draft can be opened for voting", status_code=409)
    now = datetime.now(UTC)
    if r.closes_at and r.closes_at <= now:
        raise ApiError("Set a voting deadline in the future", status_code=422)
    r.status, r.opens_at = "open", now
    await audit.record(db, "resolution.opened", member=m, target_type="board_resolution", target_id=r.id, request=request)
    ids = set((await db.execute(select(BoardResolutionEligibility.member_id)
                                .where(BoardResolutionEligibility.resolution_id == r.id))).scalars().all())
    voters = [x for x in (await _members_by_id(db)).values() if x.id in ids]
    await notify.notify(db, voters, kind="vote_required", title=f"Your vote is needed: {r.reference}",
                        body=r.title + (f" Voting closes {r.closes_at:%d %b %Y %H:%M} UTC." if r.closes_at else ""),
                        link="/resolutions")
    return await _resolution(db, r, m)


class VoteIn(CamelModel):
    choice: Literal["for", "against", "abstain"]


@router.post("/resolutions/{resolution_id}/vote")
async def vote(resolution_id: str, body: VoteIn, request: Request, m: BoardMember = Depends(require("resolutions.vote")),
               db: AsyncSession = Depends(get_db)):
    """The voter is whoever holds the session: nobody can vote for someone else."""
    r = await _get(db, BoardResolution, resolution_id)
    v = await gov.cast_vote(db, r, m, body.choice, audit.ip_of(request))
    await audit.record(db, "resolution.vote_cast", member=m, target_type="board_resolution", target_id=r.id,
                       after={"choice": v.choice, "weight": v.weight}, request=request)
    return await _resolution(db, r, m)


@router.post("/resolutions/{resolution_id}/conclude")
async def conclude_resolution(resolution_id: str, request: Request,
                              m: BoardMember = Depends(require("resolutions.manage")), db: AsyncSession = Depends(get_db)):
    r = await _get(db, BoardResolution, resolution_id)
    t = await gov.conclude(db, r)
    await audit.record(db, "resolution.concluded", member=m, target_type="board_resolution", target_id=r.id,
                       after=t, request=request)
    ids = set((await db.execute(select(BoardResolutionEligibility.member_id)
                                .where(BoardResolutionEligibility.resolution_id == r.id))).scalars().all())
    people = [x for x in (await _members_by_id(db)).values()
              if x.id in ids or (r.body_type == "board" and perms.can(x, "governance.view"))]
    await notify.notify(db, people, kind="resolution_concluded",
                        title=f"Resolution {r.reference}: {t['outcome'].replace('_', ' ')}", body=r.title,
                        link="/resolutions")
    return await _resolution(db, r, m)


@router.post("/resolutions/{resolution_id}/cancel")
async def cancel_resolution(resolution_id: str, request: Request,
                            m: BoardMember = Depends(require("resolutions.manage")), db: AsyncSession = Depends(get_db)):
    r = await _get(db, BoardResolution, resolution_id)
    if r.status not in ("draft", "open"):
        raise ApiError("A concluded resolution is a permanent record", status_code=409)
    r.status = "cancelled"
    await audit.record(db, "resolution.cancelled", member=m, target_type="board_resolution", target_id=r.id,
                       request=request)
    return await _resolution(db, r, m)


# ═══ documents ══════════════════════════════════════════════════════════════

def _doc(d: BoardDocument) -> dict:
    return {"id": str(d.id), "familyId": str(d.family_id), "version": d.version, "category": d.category,
            "title": d.title, "description": d.description, "audience": d.audience, "filename": d.filename,
            "mimeType": d.mime_type, "sizeBytes": d.size_bytes, "sha256": d.sha256, "uploadedBy": d.uploaded_by,
            "uploadedAt": d.created_at.isoformat() if d.created_at else None, "archived": d.archived_at is not None,
            "meetingId": str(d.meeting_id) if d.meeting_id else None}


@router.get("/documents")
async def documents(q: str | None = Query(None, max_length=100), category: str | None = Query(None, max_length=30),
                    all_versions: bool = False, m: BoardMember = Depends(require("documents.view")),
                    db: AsyncSession = Depends(get_db)):
    from app.models.boardroom import DOC_CATEGORIES

    stmt = select(BoardDocument).order_by(BoardDocument.created_at.desc())
    if category:
        stmt = stmt.where(BoardDocument.category == category)
    if q:
        like = f"%{q.replace('%', '').replace('_', '')}%"
        stmt = stmt.where(BoardDocument.title.ilike(like) | BoardDocument.description.ilike(like)
                          | BoardDocument.filename.ilike(like))
    rows = [d for d in (await db.execute(stmt.limit(500))).scalars().all() if gov.can_see_document(m, d)]
    latest: dict = {}
    for d in rows:
        if d.family_id not in latest or d.version > latest[d.family_id].version:
            latest[d.family_id] = d
    out = rows if all_versions else list(latest.values())
    versions = {}
    for d in rows:
        versions.setdefault(str(d.family_id), []).append({"id": str(d.id), "version": d.version,
                                                          "uploadedAt": _iso(d.created_at), "uploadedBy": d.uploaded_by})
    return {"documents": [_doc(d) | {"versions": sorted(versions.get(str(d.family_id), []), key=lambda v: -v["version"])}
                          for d in sorted(out, key=lambda x: x.created_at, reverse=True)],
            "categories": list(DOC_CATEGORIES), "roles": list(perms.ROLES),
            "canManage": perms.can(m, "documents.manage")}


class DocIn(CamelModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    category: str
    audience: list[str] = Field(default_factory=list, max_length=10)
    filename: str = Field(min_length=1, max_length=200)
    mime_type: str = Field(max_length=120)
    base64: str = Field(min_length=8, max_length=28 * 1024 * 1024)
    family_id: str | None = None  # a new version of an existing document
    meeting_id: str | None = None


@router.post("/documents", status_code=201)
async def upload_document(body: DocIn, request: Request, m: BoardMember = Depends(require("documents.manage")),
                          db: AsyncSession = Depends(get_db)):
    from app.models.boardroom import DOC_CATEGORIES

    if body.category not in DOC_CATEGORIES:
        raise ApiError("Choose a document category", status_code=422)
    for a in body.audience:
        perms.validate_role(a)
    version, family = 1, uuid.uuid4()
    if body.family_id:
        fam = _uuid(body.family_id)
        latest = (await db.execute(select(func.max(BoardDocument.version)).where(BoardDocument.family_id == fam))).scalar()
        if not latest:
            raise ApiError("Not found", status_code=404)
        version, family = latest + 1, fam
    meeting = (await _get(db, BoardMeeting, body.meeting_id)).id if body.meeting_id else None
    ref, size, digest = await gov.store_document(b64=body.base64, mime=body.mime_type, filename=body.filename)
    name = "".join(c for c in body.filename if c.isalnum() or c in " ._-()")[:200] or "document"
    d = BoardDocument(family_id=family, version=version, category=body.category, title=body.title,
                      description=body.description, audience=sorted(set(body.audience)), storage_ref=ref,
                      filename=name, mime_type=body.mime_type, size_bytes=size, sha256=digest, uploaded_by=who(m),
                      uploaded_by_member=m.id, meeting_id=meeting)
    db.add(d)
    await db.flush()
    await audit.record(db, "document.uploaded", member=m, target_type="board_document", target_id=d.id,
                       after=_doc(d), request=request)
    if body.category in ("board_minutes", "board_resolution", "meeting_pack", "strategic_plan") or meeting:
        people = [x for x in await notify.recipients(db, "documents.view", d.audience) if x.id != m.id]
        await notify.notify(db, people, kind="document_uploaded", title=f"New board document: {d.title}",
                            link="/documents")
    return _doc(d)


@router.post("/documents/{document_id}/download")
async def download_document(document_id: str, request: Request, m: BoardMember = Depends(require("documents.view")),
                            db: AsyncSession = Depends(get_db)):
    d = await _get(db, BoardDocument, document_id)
    if not gov.can_see_document(m, d):
        raise ApiError("Not found", status_code=404)  # don't reveal that it exists
    url = await gov.document_url(d)
    await _log(db, m, "downloaded_document", request, {"document": str(d.id), "title": d.title})
    await audit.record(db, "document.downloaded", member=m, target_type="board_document", target_id=d.id,
                       request=request)
    return {"url": url, "expiresIn": gov.SIGNED_TTL, "filename": d.filename, "mimeType": d.mime_type}


@router.post("/documents/{document_id}/archive")
async def archive_document(document_id: str, request: Request, m: BoardMember = Depends(require("documents.manage")),
                           db: AsyncSession = Depends(get_db)):
    d = await _get(db, BoardDocument, document_id)
    d.archived_at = d.archived_at or datetime.now(UTC)
    await audit.record(db, "document.archived", member=m, target_type="board_document", target_id=d.id, request=request)
    return _doc(d)


# ═══ announcements ══════════════════════════════════════════════════════════

ANNOUNCEMENT_CATEGORIES = ("business_update", "partnership", "financial_update", "product_launch", "strategy",
                           "country_expansion", "important_notice")


def _ann(u: BoardUpdate) -> dict:
    return {"id": str(u.id), "title": u.title, "period": u.period, "body": u.body, "category": u.category,
            "audience": u.audience, "documentIds": u.document_ids, "publishedAt": _iso(u.published_at),
            "createdAt": _iso(u.created_at), "status": "published" if u.published_at else "draft"}


@router.get("/announcements")
async def announcements(m: BoardMember = Depends(require("announcements.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardUpdate).order_by(BoardUpdate.created_at.desc()).limit(200))).scalars().all()
    manage = perms.can(m, "announcements.manage")
    return {"announcements": [_ann(u) for u in rows if (manage or (u.published_at and perms.audience_ok(m, u.audience)))],
            "categories": list(ANNOUNCEMENT_CATEGORIES), "canManage": manage}


class AnnouncementIn(CamelModel):
    title: str = Field(min_length=3, max_length=200)
    period: str | None = Field(default=None, max_length=60)
    body: str = Field(min_length=10, max_length=50_000)
    category: str = "business_update"
    audience: list[str] = Field(default_factory=list, max_length=10)
    document_ids: list[str] = Field(default_factory=list, max_length=20)
    publish: bool = False


async def _ann_apply(db: AsyncSession, u: BoardUpdate, body: AnnouncementIn) -> bool:
    if body.category not in ANNOUNCEMENT_CATEGORIES:
        raise ApiError("Choose a category", status_code=422)
    for a in body.audience:
        perms.validate_role(a)
    for d in body.document_ids:
        await _get(db, BoardDocument, d)
    u.title, u.period, u.body, u.category = body.title, body.period, body.body, body.category
    u.audience, u.document_ids = sorted(set(body.audience)), body.document_ids
    newly = body.publish and not u.published_at
    if newly:
        u.published_at = datetime.now(UTC)
    if not body.publish:
        u.published_at = None
    return newly


@router.post("/announcements", status_code=201)
async def create_announcement(body: AnnouncementIn, request: Request,
                              m: BoardMember = Depends(require("announcements.manage")), db: AsyncSession = Depends(get_db)):
    u = BoardUpdate(title=body.title, body=body.body)
    db.add(u)
    newly = await _ann_apply(db, u, body)
    await db.flush()
    await audit.record(db, "announcement.created", member=m, target_type="board_update", target_id=u.id,
                       after=_ann(u), request=request)
    if newly:
        await notify.notify(db, await notify.recipients(db, "announcements.view", u.audience),
                            kind="announcement", title=u.title, link="/announcements")
    return _ann(u)


@router.patch("/announcements/{update_id}")
async def update_announcement(update_id: str, body: AnnouncementIn, request: Request,
                              m: BoardMember = Depends(require("announcements.manage")), db: AsyncSession = Depends(get_db)):
    u = await _get(db, BoardUpdate, update_id)
    before = _ann(u)
    newly = await _ann_apply(db, u, body)
    await audit.record(db, "announcement.updated", member=m, target_type="board_update", target_id=u.id,
                       before=before, after=_ann(u), request=request)
    if newly:
        await notify.notify(db, await notify.recipients(db, "announcements.view", u.audience),
                            kind="announcement", title=u.title, link="/announcements")
    return _ann(u)


# ═══ notifications ══════════════════════════════════════════════════════════

@router.get("/notifications")
async def notifications(m: BoardMember = Depends(require("dashboard.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardNotification).where(BoardNotification.member_id == m.id)
                             .order_by(BoardNotification.created_at.desc()).limit(100))).scalars().all()
    return {"unread": sum(1 for n in rows if n.read_at is None),
            "notifications": [{"id": str(n.id), "kind": n.kind, "title": n.title, "body": n.body, "link": n.link,
                               "createdAt": _iso(n.created_at), "read": n.read_at is not None} for n in rows]}


@router.post("/notifications/read")
async def notifications_read(m: BoardMember = Depends(require("dashboard.view")), db: AsyncSession = Depends(get_db)):
    for n in (await db.execute(select(BoardNotification).where(BoardNotification.member_id == m.id,
                                                               BoardNotification.read_at.is_(None)))).scalars():
        n.read_at = datetime.now(UTC)
    return {"ok": True}


# ═══ reports (frozen, versioned publications) ═══════════════════════════════

def _report(r: BoardReportPublication, full: bool = False) -> dict:
    d = {"id": str(r.id), "seriesKey": r.series_key, "version": r.version, "kind": r.kind, "title": r.title,
         "periodStart": r.period_start.isoformat(), "periodEnd": r.period_end.isoformat(),
         "reportingCurrency": r.reporting_currency, "status": r.status, "audience": r.audience, "summary": r.summary,
         "reconciliationStatus": r.reconciliation_status, "accountsStatus": (r.methodology or {}).get("accountsStatus"),
         "createdBy": r.created_by, "createdAt": _iso(r.created_at), "approvedBy": r.approved_by,
         "approvedAt": _iso(r.approved_at), "publishedBy": r.published_by, "publishedAt": _iso(r.published_at),
         "supersedesId": str(r.supersedes_id) if r.supersedes_id else None, "correctionNote": r.correction_note,
         "contentSha256": r.content_sha256}
    if full:
        d |= {"snapshot": r.snapshot, "methodology": r.methodology}
    return d


def _can_read_report(m: BoardMember, r: BoardReportPublication) -> bool:
    if perms.can(m, "reports.publish"):
        return True
    return r.status in ("published", "superseded") and perms.can(m, "reports.view") and perms.audience_ok(m, r.audience)


@router.get("/reports")
async def reports(m: BoardMember = Depends(require("reports.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardReportPublication).order_by(BoardReportPublication.period_end.desc(),
                                                                     BoardReportPublication.version.desc()))).scalars().all()
    return {"reports": [_report(r) for r in rows if _can_read_report(m, r)], "canPublish": perms.can(m, "reports.publish")}


@router.get("/reports/{report_id}")
async def report(report_id: str, request: Request, m: BoardMember = Depends(require("reports.view")),
                 db: AsyncSession = Depends(get_db)):
    r = await _get(db, BoardReportPublication, report_id)
    if not _can_read_report(m, r):
        raise ApiError("Not found", status_code=404)
    await _log(db, m, "viewed_report", request, {"report": str(r.id)})
    return _report(r, full=True)


@router.get("/reports/{report_id}/pdf")
async def report_pdf(report_id: str, request: Request, m: BoardMember = Depends(require("reports.view")),
                     db: AsyncSession = Depends(get_db)):
    r = await _get(db, BoardReportPublication, report_id)
    if not _can_read_report(m, r) or r.status not in ("published", "superseded"):
        raise ApiError("Not found", status_code=404)
    await _log(db, m, "downloaded_report_pdf", request, {"report": str(r.id)})
    name = f"bukkapay-{r.kind}-{r.period_end.isoformat()}-v{r.version}.pdf"
    return Response(gov.report_pdf(r), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


class ReportIn(CamelModel):
    kind: Literal["monthly", "quarterly", "annual", "custom", "board_pack"]
    title: str = Field(min_length=3, max_length=200)
    period_start: date
    period_end: date
    summary: str | None = Field(default=None, max_length=20_000)
    audience: list[str] = Field(default_factory=list, max_length=10)


@router.post("/reports", status_code=201)
async def create_report(body: ReportIn, request: Request, m: BoardMember = Depends(require("reports.publish")),
                        db: AsyncSession = Depends(get_db)):
    r = await gov.create_report(db, kind=body.kind, title=body.title, start=body.period_start, end=body.period_end,
                                reporting=await _reporting(db), summary=body.summary, audience=body.audience, by=who(m))
    await audit.record(db, "report.drafted", member=m, target_type="board_report", target_id=r.id,
                       after=_report(r), request=request)
    return _report(r)


class CorrectionIn(CamelModel):
    note: str = Field(min_length=5, max_length=2000)
    summary: str | None = Field(default=None, max_length=20_000)


@router.post("/reports/{report_id}/correct", status_code=201)
async def correct_report(report_id: str, body: CorrectionIn, request: Request,
                         m: BoardMember = Depends(require("reports.publish")), db: AsyncSession = Depends(get_db)):
    old = await _get(db, BoardReportPublication, report_id)
    if old.status != "published":
        raise ApiError("Only a published report can be corrected", status_code=409)
    r = await gov.create_report(db, kind=old.kind, title=old.title, start=old.period_start, end=old.period_end,
                                reporting=old.reporting_currency, summary=body.summary if body.summary is not None else old.summary,
                                audience=old.audience, by=who(m), corrects=old, note=body.note)
    await audit.record(db, "report.correction_drafted", member=m, target_type="board_report", target_id=r.id,
                       after={"supersedes": str(old.id), "note": body.note}, request=request)
    return _report(r)


@router.post("/reports/{report_id}/approve")
async def approve_report(report_id: str, request: Request, m: BoardMember = Depends(require("reports.publish")),
                         db: AsyncSession = Depends(get_db)):
    r = await _get(db, BoardReportPublication, report_id)
    if r.status != "draft":
        raise ApiError("Only a draft can be approved", status_code=409)
    r.status, r.approved_by, r.approved_at = "approved", who(m), datetime.now(UTC)
    await audit.record(db, "report.approved", member=m, target_type="board_report", target_id=r.id, request=request)
    return _report(r)


@router.post("/reports/{report_id}/publish")
async def publish_report(report_id: str, request: Request, m: BoardMember = Depends(require("reports.publish")),
                         db: AsyncSession = Depends(get_db)):
    r = await _get(db, BoardReportPublication, report_id)
    await gov.publish_report(db, r, who(m))
    await audit.record(db, "report.published", member=m, target_type="board_report", target_id=r.id,
                       after={"sha256": r.content_sha256, "version": r.version}, request=request)
    await notify.notify(db, await notify.recipients(db, "reports.view", r.audience), kind="report_published",
                        title=f"Report published: {r.title}" + (f" (version {r.version})" if r.version > 1 else ""),
                        link=f"/reports/{r.id}")
    return _report(r)


@router.delete("/reports/{report_id}")
async def delete_draft_report(report_id: str, request: Request, m: BoardMember = Depends(require("reports.publish")),
                              db: AsyncSession = Depends(get_db)):
    r = await _get(db, BoardReportPublication, report_id)
    if r.status not in ("draft", "approved"):
        raise ApiError("A published report can't be deleted; withdraw or correct it", status_code=409)
    await db.delete(r)
    await audit.record(db, "report.draft_deleted", member=m, target_type="board_report", target_id=report_id,
                       request=request)
    return {"deleted": True}


@router.post("/reports/{report_id}/withdraw")
async def withdraw_report(report_id: str, body: CorrectionIn, request: Request,
                          m: BoardMember = Depends(require("reports.publish")), db: AsyncSession = Depends(get_db)):
    r = await _get(db, BoardReportPublication, report_id)
    if r.status != "published":
        raise ApiError("Only a published report can be withdrawn", status_code=409)
    r.status = "withdrawn"
    await audit.record(db, "report.withdrawn", member=m, target_type="board_report", target_id=r.id,
                       after={"note": body.note}, request=request)
    return _report(r)


# ═══ company settings: management accounts, budgets, targets, periods, streams ═

class AccountsIn(CamelModel):
    month: date
    currency: str = "USD"
    staff_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    technology_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    cloud_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    marketing_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    compliance_legal_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    banking_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    psp_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    cybersecurity_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    office_admin_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    country_ops_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    other_costs: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    other_income: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    depreciation: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    amortisation: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    finance_costs: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    tax: Decimal | None = Field(default=None, max_digits=16, decimal_places=2)
    cash_balance: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    receivables: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    other_assets: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    other_liabilities: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    equity: Decimal | None = Field(default=None, max_digits=16, decimal_places=2)
    operating_cash_flow: Decimal | None = Field(default=None, max_digits=16, decimal_places=2)
    investing_cash_flow: Decimal | None = Field(default=None, max_digits=16, decimal_places=2)
    financing_cash_flow: Decimal | None = Field(default=None, max_digits=16, decimal_places=2)
    funding_raised: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    headcount: int | None = Field(default=None, ge=0, le=100_000)
    accounts_status: Literal["draft", "management", "reviewed", "audited"] = "management"
    notes: str | None = Field(default=None, max_length=4000)

    _c = field_validator("currency")(lambda cls, v: _ccy(v))


ACCOUNT_FIELDS = tuple(k for k in AccountsIn.model_fields if k != "month")


async def _period_locked(db: AsyncSession, month: date) -> BoardReportingPeriod | None:
    return (await db.execute(select(BoardReportingPeriod).where(
        BoardReportingPeriod.status.in_(("closed", "locked")), BoardReportingPeriod.start_date <= month,
        BoardReportingPeriod.end_date >= month))).scalars().first()


@router.get("/settings/accounts")
async def list_accounts(m: BoardMember = Depends(require("financials.manage")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardFinancial).order_by(BoardFinancial.month.desc()).limit(60))).scalars().all()
    return {"accounts": [{"month": f.month.isoformat(),
                          **{k: (str(getattr(f, k)) if isinstance(getattr(f, k), Decimal) else getattr(f, k))
                             for k in ACCOUNT_FIELDS}} for f in rows]}


@router.put("/settings/accounts")
async def save_accounts(body: AccountsIn, request: Request, m: BoardMember = Depends(require("financials.manage")),
                        db: AsyncSession = Depends(get_db)):
    month = date(body.month.year, body.month.month, 1)
    lock = await _period_locked(db, month)
    if lock:
        raise ApiError(f"{lock.label} is {lock.status}. Reopen it before changing its accounts.", status_code=409)
    f = (await db.execute(select(BoardFinancial).where(BoardFinancial.month == month))).scalar_one_or_none()
    before = audit.snapshot(f, ACCOUNT_FIELDS) if f else None
    if f is None:
        f = BoardFinancial(month=month)
        db.add(f)
    for k in ACCOUNT_FIELDS:
        setattr(f, k, getattr(body, k))
    await db.flush()
    await audit.record(db, "accounts.saved", member=m, target_type="board_financial", target_id=f.id, before=before,
                       after=audit.snapshot(f, ACCOUNT_FIELDS) | {"month": month}, request=request)
    return {"month": month.isoformat()}


class PeriodIn(CamelModel):
    kind: Literal["month", "quarter", "year"]
    start_date: date
    status: Literal["open", "closed", "locked"]


@router.get("/settings/periods")
async def periods(m: BoardMember = Depends(require("financials.manage")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardReportingPeriod).order_by(BoardReportingPeriod.start_date.desc()))).scalars().all()
    return {"periods": [{"id": str(x.id), "kind": x.kind, "label": x.label, "start": x.start_date.isoformat(),
                         "end": x.end_date.isoformat(), "status": x.status, "closedBy": x.closed_by,
                         "closedAt": _iso(x.closed_at)} for x in rows]}


@router.put("/settings/periods")
async def set_period(body: PeriodIn, request: Request, m: BoardMember = Depends(require("financials.manage")),
                     db: AsyncSession = Depends(get_db)):
    p = an.period_of(body.kind, body.start_date, today=date(9999, 12, 31))
    x = (await db.execute(select(BoardReportingPeriod).where(BoardReportingPeriod.kind == body.kind,
                                                             BoardReportingPeriod.start_date == p.start))).scalar_one_or_none()
    before = x.status if x else None
    if x is None:
        x = BoardReportingPeriod(kind=body.kind, label=p.label(), start_date=p.start, end_date=p.end)
        db.add(x)
    if before == "locked" and body.status != "locked":
        raise ApiError("A locked period stays locked", status_code=409)
    x.status = body.status
    if body.status != "open":
        x.closed_by, x.closed_at = who(m), datetime.now(UTC)
    await db.flush()
    await audit.record(db, "period.status_changed", member=m, target_type="reporting_period", target_id=x.id,
                       before={"status": before}, after={"status": x.status, "label": x.label}, request=request)
    return {"id": str(x.id), "status": x.status, "label": x.label}


class BudgetIn(CamelModel):
    month: date
    category: str
    currency: str = "USD"
    amount: Decimal = Field(ge=0, max_digits=20, decimal_places=2)

    _c = field_validator("currency")(lambda cls, v: _ccy(v))


@router.get("/settings/budgets")
async def budgets(m: BoardMember = Depends(require("financials.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardBudget).order_by(BoardBudget.month.desc()).limit(500))).scalars().all()
    return {"budgets": [{"id": str(b.id), "month": b.month.isoformat(), "category": b.category, "currency": b.currency,
                         "amount": s(b.amount, b.currency)} for b in rows],
            "categories": [k for k, _ in gov.OPEX_LINES]}


@router.put("/settings/budgets")
async def set_budget(body: BudgetIn, request: Request, m: BoardMember = Depends(require("financials.manage")),
                     db: AsyncSession = Depends(get_db)):
    if body.category not in dict(gov.OPEX_LINES):
        raise ApiError("Unknown expense category", status_code=422)
    month = date(body.month.year, body.month.month, 1)
    b = (await db.execute(select(BoardBudget).where(BoardBudget.month == month,
                                                    BoardBudget.category == body.category))).scalar_one_or_none()
    before = audit.snapshot(b, ("amount", "currency")) if b else None
    if b is None:
        b = BoardBudget(month=month, category=body.category)
        db.add(b)
    b.currency, b.amount, b.updated_by = body.currency, body.amount, who(m)
    await db.flush()
    await audit.record(db, "budget.saved", member=m, target_type="board_budget", target_id=b.id, before=before,
                       after={"month": month, "category": b.category, "amount": b.amount, "currency": b.currency},
                       request=request)
    return {"id": str(b.id)}


class TargetIn(CamelModel):
    metric: str = Field(min_length=2, max_length=60)
    period_start: date
    period_end: date
    target: Decimal = Field(max_digits=20, decimal_places=2)
    currency: str | None = None
    notes: str | None = Field(default=None, max_length=1000)


@router.get("/settings/targets")
async def targets(m: BoardMember = Depends(require("dashboard.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardKpiTarget).order_by(BoardKpiTarget.period_start.desc()))).scalars().all()
    return {"targets": [{"id": str(t.id), "metric": t.metric, "periodStart": t.period_start.isoformat(),
                         "periodEnd": t.period_end.isoformat(), "target": str(t.target), "currency": t.currency,
                         "notes": t.notes} for t in rows]}


@router.put("/settings/targets")
async def set_target(body: TargetIn, request: Request, m: BoardMember = Depends(require("financials.manage")),
                     db: AsyncSession = Depends(get_db)):
    if body.period_end < body.period_start:
        raise ApiError("The period ends before it starts", status_code=422)
    t = (await db.execute(select(BoardKpiTarget).where(BoardKpiTarget.metric == body.metric,
                                                       BoardKpiTarget.period_start == body.period_start))).scalar_one_or_none()
    before = audit.snapshot(t, ("target", "period_end", "currency")) if t else None
    if t is None:
        t = BoardKpiTarget(metric=body.metric, period_start=body.period_start)
        db.add(t)
    t.period_end, t.target, t.notes, t.updated_by = body.period_end, body.target, body.notes, who(m)
    t.currency = _ccy(body.currency) if body.currency else None
    await db.flush()
    await audit.record(db, "target.saved", member=m, target_type="kpi_target", target_id=t.id, before=before,
                       after=body.model_dump(), request=request)
    return {"id": str(t.id)}


class StreamIn(CamelModel):
    status: Literal["operational", "in_development", "planned", "disabled"]
    notes: str | None = Field(default=None, max_length=1000)


@router.put("/settings/revenue-streams/{code}")
async def set_stream(code: str, body: StreamIn, request: Request, m: BoardMember = Depends(require("financials.manage")),
                     db: AsyncSession = Depends(get_db)):
    x = await db.get(BoardRevenueStream, code)
    if x is None:
        raise ApiError("Not found", status_code=404)
    before = {"status": x.status}
    x.status, x.notes = body.status, body.notes
    await audit.record(db, "revenue_stream.status_changed", member=m, target_type="revenue_stream", target_id=code,
                       before=before, after=body.model_dump(), request=request)
    return {"code": code, "status": x.status}


# ═══ users (owner) ══════════════════════════════════════════════════════════

def _user(x: BoardMember, last_seen=None) -> dict:
    role = perms.role_of(x)
    return {"id": str(x.id), "name": x.name, "email": x.email, "organisation": x.organisation, "title": x.title,
            "phone": x.phone, "appointedOn": _iso(x.appointed_on), "role": role,
            "roleLabel": perms.OWNER_LABEL if role == perms.OWNER_ROLE else perms.ROLES.get(role, role),
            "status": "owner" if svc.is_owner(x) else svc.member_status(x),
            "mfa": "authenticator" if x.mfa_secret else ("admin_panel" if svc.is_owner(x) else "not_set_up"),
            "grants": x.permission_grants or [], "denies": x.permission_denies or [],
            "permissions": sorted(perms.permissions_of(x)), "lastLoginAt": _iso(x.last_login_at),
            "lastSeenAt": _iso(last_seen), "lockedUntil": _iso(x.locked_until),
            "suspendedReason": x.suspended_reason, "inviteExpiresAt": _iso(x.invite_expires_at)}


@router.get("/users")
async def users(m: BoardMember = Depends(require("users.manage")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardMember).order_by(BoardMember.created_at))).scalars().all()
    seen = dict((await db.execute(select(BoardSession.member_id, func.max(BoardSession.last_seen_at))
                                  .group_by(BoardSession.member_id))).all())
    failed = (await db.execute(select(BoardAccessLog.member_id, func.count())
                               .where(BoardAccessLog.action == "sign_in_failed",
                                      BoardAccessLog.created_at >= datetime.now(UTC) - timedelta(days=7))
                               .group_by(BoardAccessLog.member_id))).all()
    fails = {k: v for k, v in failed}
    return {"users": [_user(x, seen.get(x.id)) | {"failedSignIns7d": fails.get(x.id, 0)} for x in rows],
            **perms.catalogue()}


class BoardInviteIn(CamelModel):
    email: str = Field(min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    name: str = Field(min_length=2, max_length=120)
    role: str
    organisation: str | None = Field(default=None, max_length=160)
    title: str | None = Field(default=None, max_length=120)


@router.post("/users", status_code=201)
async def invite_user(body: BoardInviteIn, request: Request, m: BoardMember = Depends(require("users.manage")),
                      db: AsyncSession = Depends(get_db)):
    x, link, sent = await svc.invite(db, email=body.email, name=body.name, organisation=body.organisation,
                                     title=body.title, by=None, role=perms.validate_role(body.role))
    await audit.record(db, "user.invited", member=m, target_type="board_member", target_id=x.id,
                       after={"email": x.email, "role": x.role}, request=request)
    return {"user": _user(x), "link": link, "emailSent": sent}


class UserUpdateIn(CamelModel):
    role: str
    grants: list[str] = Field(default_factory=list, max_length=60)
    denies: list[str] = Field(default_factory=list, max_length=60)
    title: str | None = Field(default=None, max_length=120)
    organisation: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    appointed_on: date | None = None


@router.patch("/users/{member_id}")
async def update_user(member_id: str, body: UserUpdateIn, request: Request, m: BoardMember = Depends(require("users.manage")),
                      db: AsyncSession = Depends(get_db)):
    x = await _get(db, BoardMember, member_id)
    if svc.is_owner(x):
        raise ApiError("The owner's access can't be changed", status_code=403)
    role = perms.validate_role(body.role)
    grants, denies = perms.validate_grants(role, body.grants, body.denies)
    before = _user(x)
    x.role, x.permission_grants, x.permission_denies = role, grants, denies
    x.title, x.organisation, x.phone, x.appointed_on = body.title, body.organisation, body.phone, body.appointed_on
    await db.flush()
    await audit.record(db, "user.access_changed", member=m, target_type="board_member", target_id=x.id,
                       before={k: before[k] for k in ("role", "grants", "denies")},
                       after={"role": role, "grants": grants, "denies": denies}, request=request)
    return _user(x)


class SuspendIn(CamelModel):
    reason: str = Field(min_length=3, max_length=500)


@router.post("/users/{member_id}/suspend")
async def suspend_user(member_id: str, body: SuspendIn, request: Request, m: BoardMember = Depends(require("users.manage")),
                       db: AsyncSession = Depends(get_db)):
    x = await _get(db, BoardMember, member_id)
    if svc.is_owner(x):
        raise ApiError("The owner can't be suspended", status_code=403)
    x.suspended_at, x.suspended_reason = datetime.now(UTC), body.reason
    await svc.end_sessions(db, x.id)
    await audit.record(db, "user.suspended", member=m, target_type="board_member", target_id=x.id,
                       after={"reason": body.reason}, request=request)
    return _user(x)


@router.post("/users/{member_id}/reactivate")
async def reactivate_user(member_id: str, request: Request, m: BoardMember = Depends(require("users.manage")),
                          db: AsyncSession = Depends(get_db)):
    x = await _get(db, BoardMember, member_id)
    if not x.active:
        raise ApiError("This person's access was revoked: invite them again", status_code=409)
    x.suspended_at = x.suspended_reason = None
    x.failed_attempts, x.locked_until = 0, None
    await audit.record(db, "user.reactivated", member=m, target_type="board_member", target_id=x.id, request=request)
    return _user(x)


@router.post("/users/{member_id}/revoke")
async def revoke_user(member_id: str, request: Request, m: BoardMember = Depends(require("users.manage")),
                      db: AsyncSession = Depends(get_db)):
    x = await _get(db, BoardMember, member_id)
    if svc.is_owner(x):
        raise ApiError("The owner always has access", status_code=403)
    x.active, x.invite_token_hash = False, None
    await svc.end_sessions(db, x.id)
    await audit.record(db, "user.revoked", member=m, target_type="board_member", target_id=x.id, request=request)
    return _user(x)


@router.post("/users/{member_id}/sessions/revoke")
async def revoke_user_sessions(member_id: str, request: Request, m: BoardMember = Depends(require("users.manage")),
                               db: AsyncSession = Depends(get_db)):
    x = await _get(db, BoardMember, member_id)
    await svc.end_sessions(db, x.id)
    await audit.record(db, "user.sessions_revoked", member=m, target_type="board_member", target_id=x.id,
                       request=request)
    return {"revoked": True}


@router.post("/users/{member_id}/mfa/reset")
async def reset_user_mfa(member_id: str, request: Request, m: BoardMember = Depends(require("users.manage")),
                         db: AsyncSession = Depends(get_db)):
    """Lost phone: clears the authenticator; the person gets an emailed code once and must set up a new one."""
    x = await _get(db, BoardMember, member_id)
    if svc.is_owner(x):
        raise ApiError("The owner's MFA is managed in the admin panel", status_code=403)
    x.mfa_secret = x.mfa_pending_secret = x.mfa_enabled_at = None
    await svc.end_sessions(db, x.id)
    await audit.record(db, "user.mfa_reset", member=m, target_type="board_member", target_id=x.id, request=request)
    return _user(x)


@router.post("/users/{member_id}/resend")
async def resend_invite(member_id: str, request: Request, m: BoardMember = Depends(require("users.manage")),
                        db: AsyncSession = Depends(get_db)):
    x = await _get(db, BoardMember, member_id)
    x, link, sent = await svc.invite(db, email=x.email, name=x.name, organisation=x.organisation, title=x.title,
                                     by=None, role=x.role if x.role in perms.ROLES else "investor")
    await audit.record(db, "user.invite_resent", member=m, target_type="board_member", target_id=x.id, request=request)
    return {"user": _user(x), "link": link, "emailSent": sent}


@router.get("/users/{member_id}/history")
async def user_history(member_id: str, m: BoardMember = Depends(require("users.manage")), db: AsyncSession = Depends(get_db)):
    x = await _get(db, BoardMember, member_id)
    log = (await db.execute(select(BoardAccessLog).where(BoardAccessLog.member_id == x.id)
                            .order_by(BoardAccessLog.created_at.desc()).limit(200))).scalars().all()
    sess = (await db.execute(select(BoardSession).where(BoardSession.member_id == x.id)
                             .order_by(BoardSession.created_at.desc()).limit(50))).scalars().all()
    return {"access": [{"action": a.action, "ip": a.ip, "details": a.details, "at": a.created_at.isoformat()} for a in log],
            "sessions": [{"id": str(z.id), "createdAt": z.created_at.isoformat(), "lastSeenAt": _iso(z.last_seen_at),
                          "expiresAt": z.expires_at.isoformat(), "revoked": z.revoked_at is not None, "ip": z.ip,
                          "device": z.user_agent} for z in sess]}


# ═══ audit ══════════════════════════════════════════════════════════════════

@router.get("/audit")
async def audit_log(action: str | None = Query(None, max_length=80), before: datetime | None = None,
                    limit: int = Query(default=100, ge=1, le=500), m: BoardMember = Depends(require("audit.view")),
                    db: AsyncSession = Depends(get_db)):
    q = select(BoardroomAuditLog).order_by(BoardroomAuditLog.created_at.desc())
    if action:
        q = q.where(BoardroomAuditLog.action.like(f"{action.replace('%', '')}%"))
    if before:
        q = q.where(BoardroomAuditLog.created_at < before)
    rows = (await db.execute(q.limit(limit))).scalars().all()
    return {"entries": [{"id": str(a.id), "at": a.created_at.isoformat(), "actor": a.actor_label, "action": a.action,
                         "targetType": a.target_type, "targetId": a.target_id, "before": a.before, "after": a.after,
                         "ip": a.ip} for a in rows],
            "next": rows[-1].created_at.isoformat() if len(rows) == limit else None}


@router.get("/settings/revenue-streams")
async def streams(m: BoardMember = Depends(require("revenue.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardRevenueStream).order_by(BoardRevenueStream.label))).scalars().all()
    return {"streams": [{"code": x.code, "label": x.label, "status": x.status, "notes": x.notes} for x in rows]}
