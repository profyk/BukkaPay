"""Unauthenticated, read-only endpoints for the website and apps: where
BukkaPay is live/pilot/planned, which currencies exist, and signed-QR
resolution. Availability always comes from admin-controlled data."""

from fastapi import APIRouter, Depends, Header, Request
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.merchants import qr as merchant_qr
from app.models.platform import Country, Enquiry, PaymentCorridor
from app.models.reference import Currency
from app.network import webhooks
from app.schemas.base import CamelModel

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/public/countries")
async def public_countries(db: AsyncSession = Depends(get_db)):
    countries = (await db.execute(select(Country).order_by(Country.region, Country.name))).scalars().all()
    return [{"code": c.code, "name": c.name, "region": c.region, "status": c.status,
             "currency": c.default_currency, "dialCode": c.dial_code} for c in countries]


@router.get("/public/currencies")
async def public_currencies(db: AsyncSession = Depends(get_db)):
    return [{"code": c.code, "name": c.name, "symbol": c.symbol, "decimals": c.decimals,
             "walletsAvailable": c.wallet_enabled}
            for c in (await db.execute(select(Currency).where(Currency.status == "active")
                                       .order_by(Currency.code))).scalars()]


@router.get("/public/corridors")
async def public_corridors(db: AsyncSession = Depends(get_db)):
    """Only corridors customers can actually use."""
    rows = (await db.execute(select(PaymentCorridor).where(
        PaymentCorridor.status.in_(("pilot", "active"))))).scalars().all()
    return [{"from": c.from_country, "to": c.to_country, "fromCurrency": c.from_currency,
             "toCurrency": c.to_currency, "status": c.status} for c in rows]


class EnquiryIn(CamelModel):
    kind: str = "contact"
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=200)
    organisation: str | None = Field(default=None, max_length=200)
    country_code: str | None = Field(default=None, max_length=2)
    message: str = Field(min_length=10, max_length=5000)
    website: str | None = None  # honeypot — real people leave it empty


@router.post("/public/enquiries", status_code=201, dependencies=[Depends(rate_limit("enquiry", 5, 3600))])
async def create_enquiry(body: EnquiryIn, db: AsyncSession = Depends(get_db)):
    if body.website:
        return {"success": True}  # silently drop bots
    if "@" not in body.email:
        raise ApiError("A valid email is required")
    allowed = ("contact", "business", "bank_partner", "psp_partner", "custodian", "press")
    kind = body.kind if body.kind in allowed else "other"
    db.add(Enquiry(kind=kind, name=body.name.strip(), email=body.email.strip().lower(),
                   organisation=body.organisation, country_code=(body.country_code or "").upper() or None,
                   message=body.message.strip(), status="new"))
    await db.flush()
    return {"success": True}


@router.get("/public/site")
async def public_site(db: AsyncSession = Depends(get_db)):
    """Website content edited in the admin app (settings, home, pricing, FAQ)."""
    from app.website import service as website_service

    return await website_service.get_site(db)


@router.get("/public/legal")
async def public_legal(db: AsyncSession = Depends(get_db)):
    """Published legal documents (or their drafts awaiting review), for the website."""
    from app.legal import service as legal_service

    return await legal_service.public_list(db)


@router.get("/public/legal/{slug}")
async def public_legal_document(slug: str, version: int | None = None, db: AsyncSession = Depends(get_db)):
    """One legal document with company details filled in; ?version=n for an archived version."""
    from app.legal import service as legal_service

    return await legal_service.public_get(db, slug, version)


class WaitlistIn(CamelModel):
    email: str = Field(min_length=5, max_length=200)
    name: str | None = Field(default=None, max_length=120)
    country_code: str | None = Field(default=None, max_length=2)
    kind: str = "personal"
    source: str | None = Field(default=None, max_length=60)
    website: str | None = None  # honeypot


@router.post("/public/waitlist", status_code=201, dependencies=[Depends(rate_limit("waitlist", 10, 3600))])
async def join_waitlist(body: WaitlistIn, db: AsyncSession = Depends(get_db)):
    from app.website import service as website_service

    if body.website:
        return {"success": True}
    # Same answer for new and existing emails (no list enumeration).
    await website_service.join_waitlist(db, email=body.email, name=body.name, country_code=body.country_code,
                                        kind=body.kind, source=body.source)
    return {"success": True}


@router.get("/qr/resolve", dependencies=[Depends(rate_limit("qr-resolve", 60, 60))])
async def resolve_qr(payload: str, db: AsyncSession = Depends(get_db)):
    qr, merchant = await merchant_qr.resolve(db, payload)
    return {
        "qrId": str(qr.id), "kind": qr.kind, "amount": str(qr.amount) if qr.amount is not None else None,
        "currency": qr.currency, "reference": qr.reference, "label": qr.label,
        "merchant": {"id": str(merchant.id), "businessName": merchant.business_name,
                     "logo": merchant.business_logo, "country": merchant.country_code, "verified": True},
    }


@router.post("/webhooks/{provider}")
async def provider_webhook(
    provider: str, request: Request, db: AsyncSession = Depends(get_db),
    signature: str | None = Header(default=None, alias="X-BukkaPay-Signature"),
):
    body = await request.body()
    return await webhooks.receive(db, provider, body, signature)
