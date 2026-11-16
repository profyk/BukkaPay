"""Country availability. A country is operating (customers may transact)
only when its status is `pilot` or `live`; moving it there requires the
readiness gates. Creating a country record never makes it available."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.platform import Country, CountryCustodian

OPERATING = ("pilot", "live")


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


def readiness_problems(country: Country, *, has_active_custodian: bool) -> list[str]:
    problems = []
    if not country.compliance_approved:
        problems.append("compliance sign-off not recorded")
    if not country.custodian_ready or not has_active_custodian:
        problems.append("no active primary custodian")
    if not country.provider_ready:
        problems.append("no payment provider ready")
    return problems


async def has_active_custodian(db: AsyncSession, country_code: str) -> bool:
    row = (
        await db.execute(
            select(CountryCustodian.id).where(
                CountryCustodian.country_code == country_code,
                CountryCustodian.role == "primary",
                CountryCustodian.status == "active",
            )
        )
    ).first()
    return row is not None


async def set_status(db: AsyncSession, country: Country, status: str) -> Country:
    """Apply a status change. `live` requires every readiness gate; `pilot`
    also does, except for countries already operating (grandfathered)."""
    if status not in ("planned", "pilot", "live", "suspended"):
        raise ApiError("Invalid country status")
    if status in OPERATING:
        problems = readiness_problems(
            country, has_active_custodian=await has_active_custodian(db, country.code)
        )
        grandfathered = status == "pilot" and country.status in OPERATING
        if problems and not grandfathered:
            raise ApiError(f"{country.name} can't be set to {status}: " + "; ".join(problems), status_code=409)
    if status == "live" and country.launched_at is None:
        country.launched_at = datetime.now(UTC)
    country.status = status
    await db.flush()
    return country


async def list_public(db: AsyncSession) -> list[Country]:
    return list((await db.execute(select(Country).order_by(Country.region, Country.name))).scalars())
