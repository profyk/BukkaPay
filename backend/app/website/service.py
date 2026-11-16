"""Read/save website content and the waitlist. A save tells the website to
refresh through the outbox (retried until the site acknowledges)."""

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.models.website import SiteContent, WaitlistSignup
from app.network import outbox
from app.website import content


async def get_site(db: AsyncSession) -> dict:
    site = content.defaults()
    versions: dict[str, int] = {}
    for row in (await db.execute(select(SiteContent))).scalars():
        if row.key in site:
            # Re-validate on read so a schema change never serves stale shapes.
            try:
                site[row.key] = content.validate(row.key, row.data)
            except ValueError:
                continue
            versions[row.key] = row.version
    site["versions"] = versions
    return site


async def save(db: AsyncSession, key: str, data: dict, *, actor: str | None, expected_version: int | None) -> dict:
    from pydantic import ValidationError

    try:
        clean = content.validate(key, data)
    except KeyError as e:
        raise ApiError("Unknown website section", status_code=404) from e
    except ValidationError as e:
        problems = "; ".join(f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in e.errors()[:5])
        raise ApiError(f"Invalid content — {problems}", status_code=422) from e
    row = (await db.execute(select(SiteContent).where(SiteContent.key == key).with_for_update())).scalar_one_or_none()
    current = row.version if row else 0
    if expected_version is not None and expected_version != current:
        raise ApiError("Someone else changed this section — reload and try again", status_code=409)
    if row is None:
        row = SiteContent(key=key, data=clean, version=1, updated_by=actor)
        db.add(row)
    else:
        row.data, row.version, row.updated_by = clean, row.version + 1, actor
    await db.flush()
    await outbox.enqueue(db, "website.revalidate", {"section": key, "version": row.version})
    return {"key": key, "version": row.version, "data": clean}


async def revalidate(payload: dict) -> None:
    """Outbox handler: ask the website to rebuild its cached pages."""
    settings = get_settings()
    if not settings.website_revalidate_url or not settings.website_revalidate_secret:
        return  # not configured: the site's own cache expiry (5 min) picks it up
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(settings.website_revalidate_url,
                              headers={"x-revalidate-secret": settings.website_revalidate_secret}, json=payload)
    r.raise_for_status()


async def join_waitlist(db: AsyncSession, *, email: str, name: str | None, country_code: str | None, kind: str,
                        source: str | None) -> bool:
    email = email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1] or len(email) > 200:
        raise ApiError("Enter a valid email address")
    inserted = (await db.execute(
        insert(WaitlistSignup)
        .values(email=email, name=(name or "").strip()[:120] or None,
                country_code=(country_code or "").strip().upper()[:2] or None,
                kind=kind if kind in ("personal", "business") else "personal", source=(source or "")[:60] or None)
        .on_conflict_do_nothing(constraint="uq_waitlist_email")
        .returning(WaitlistSignup.id)
    )).scalar_one_or_none()
    return inserted is not None
