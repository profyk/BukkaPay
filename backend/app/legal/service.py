"""Legal documents: drafts edited in the admin app, published as immutable
versions, served to the website with company details filled in.

Pipeline: admin edits a draft (optimistic lock) → admin with legal.publish
publishes it with an effective date and review status → a new row in
legal_document_versions → the outbox asks the website to refresh.
"""

import re
from datetime import date, datetime, timezone

from pydantic import Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.legal import catalog
from app.models.legal import AUDIENCES, REVIEW_STATUSES, LegalDocument, LegalDocumentVersion
from app.models.website import SiteContent
from app.network import outbox
from app.schemas.base import CamelModel

DETAILS_KEY = "legal_details"
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MAX_BODY = 200_000


class DraftIn(CamelModel):
    title: str = Field(min_length=3, max_length=120)
    summary: str = Field(default="", max_length=300)
    audience: str = "everyone"
    body: str = Field(min_length=20, max_length=MAX_BODY)
    sort_order: int = Field(default=100, ge=0, le=10_000)
    listed: bool = True

    @field_validator("audience")
    @classmethod
    def _audience(cls, v: str) -> str:
        if v not in AUDIENCES:
            raise ValueError(f"must be one of {', '.join(AUDIENCES)}")
        return v

    @field_validator("title", "summary")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class PublishIn(CamelModel):
    effective_date: date
    review_status: str
    reviewed_by: str | None = Field(default=None, max_length=160)
    change_note: str | None = Field(default=None, max_length=1000)
    draft_version: int | None = None

    @field_validator("review_status")
    @classmethod
    def _review(cls, v: str) -> str:
        if v not in REVIEW_STATUSES:
            raise ValueError(f"must be one of {', '.join(REVIEW_STATUSES)}")
        return v


def _problems(e: ValidationError) -> str:
    return "; ".join(f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in e.errors()[:5])


# ---------------------------------------------------------------- details

async def get_details(db: AsyncSession) -> tuple[catalog.LegalDetails, int]:
    row = await db.get(SiteContent, DETAILS_KEY)
    if row is None:
        return catalog.LegalDetails(), 0
    try:
        return catalog.LegalDetails.model_validate(row.data), row.version
    except ValidationError:
        return catalog.LegalDetails(), row.version


async def save_details(db: AsyncSession, data: dict, *, actor: str | None, expected_version: int | None) -> dict:
    try:
        details = catalog.LegalDetails.model_validate(data)
    except ValidationError as e:
        raise ApiError(f"Invalid details — {_problems(e)}", status_code=422) from e
    clean = details.model_dump(mode="json", by_alias=True)
    row = (await db.execute(select(SiteContent).where(SiteContent.key == DETAILS_KEY).with_for_update())
           ).scalar_one_or_none()
    current = row.version if row else 0
    if expected_version is not None and expected_version != current:
        raise ApiError("Someone else changed the company details — reload and try again", status_code=409)
    if row is None:
        row = SiteContent(key=DETAILS_KEY, data=clean, version=1, updated_by=actor)
        db.add(row)
    else:
        row.data, row.version, row.updated_by = clean, row.version + 1, actor
    await db.flush()
    await outbox.enqueue(db, "website.revalidate", {"section": "legal", "version": row.version})
    return {"details": clean, "version": row.version}


# ---------------------------------------------------------------- admin

def _template_draft(std: catalog.Standard) -> dict:
    return {"slug": std.slug, "title": std.title, "summary": std.summary, "audience": std.audience,
            "body": catalog.template(std.slug), "sortOrder": std.order, "listed": True,
            "draftVersion": 0, "publishedVersion": None, "updatedBy": None, "updatedAt": None,
            "standard": True, "fromTemplate": True}


def _draft(row: LegalDocument) -> dict:
    return {"slug": row.slug, "title": row.title, "summary": row.summary, "audience": row.audience,
            "body": row.body, "sortOrder": row.sort_order, "listed": row.listed,
            "draftVersion": row.draft_version, "publishedVersion": row.published_version,
            "updatedBy": row.updated_by, "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            "standard": row.slug in catalog.BY_SLUG, "fromTemplate": False}


def _version(v: LegalDocumentVersion, *, body: bool = False) -> dict:
    out = {"version": v.version, "title": v.title, "summary": v.summary,
           "effectiveDate": v.effective_date.isoformat(), "reviewStatus": v.review_status,
           "reviewedBy": v.reviewed_by, "changeNote": v.change_note, "publishedBy": v.published_by,
           "publishedAt": v.published_at.isoformat()}
    if body:
        out["body"] = v.body
    return out


async def _rows(db: AsyncSession) -> dict[str, LegalDocument]:
    return {r.slug: r for r in (await db.execute(select(LegalDocument))).scalars()}


async def _latest_versions(db: AsyncSession) -> dict[str, LegalDocumentVersion]:
    latest: dict[str, LegalDocumentVersion] = {}
    for v in (await db.execute(select(LegalDocumentVersion).order_by(LegalDocumentVersion.version))).scalars():
        latest[v.slug] = v
    return latest


async def admin_list(db: AsyncSession) -> list[dict]:
    rows, latest = await _rows(db), await _latest_versions(db)
    docs = [_draft(rows[s.slug]) if s.slug in rows else _template_draft(s) for s in catalog.STANDARD]
    docs += [_draft(r) for slug, r in rows.items() if slug not in catalog.BY_SLUG]
    for d in docs:
        v = latest.get(d["slug"])
        d["published"] = _version(v) if v else None
        d["hasUnpublishedChanges"] = v is None or (v.body, v.title, v.summary) != (d["body"], d["title"], d["summary"])
        d.pop("body")
    return sorted(docs, key=lambda d: (d["sortOrder"], d["title"]))


async def admin_get(db: AsyncSession, slug: str) -> dict:
    row = await db.get(LegalDocument, slug)
    std = catalog.BY_SLUG.get(slug)
    if row is None and std is None:
        raise ApiError("Legal document not found", status_code=404)
    draft = _draft(row) if row else _template_draft(std)
    versions = (await db.execute(select(LegalDocumentVersion).where(LegalDocumentVersion.slug == slug)
                                 .order_by(LegalDocumentVersion.version.desc()))).scalars().all()
    details, _ = await get_details(db)
    latest = versions[0] if versions else None
    draft["hasUnpublishedChanges"] = latest is None or (latest.body, latest.title, latest.summary) != (
        draft["body"], draft["title"], draft["summary"])
    return {"draft": draft, "preview": catalog.fill(draft["body"], details),
            "unknownPlaceholders": catalog.unknown_tokens(draft["body"]),
            "versions": [_version(v) for v in versions]}


async def admin_version(db: AsyncSession, slug: str, version: int) -> dict:
    v = (await db.execute(select(LegalDocumentVersion).where(
        LegalDocumentVersion.slug == slug, LegalDocumentVersion.version == version))).scalar_one_or_none()
    if v is None:
        raise ApiError("Version not found", status_code=404)
    return _version(v, body=True)


async def _lock_or_seed(db: AsyncSession, slug: str, actor: str | None) -> LegalDocument:
    row = (await db.execute(select(LegalDocument).where(LegalDocument.slug == slug).with_for_update())
           ).scalar_one_or_none()
    if row is not None:
        return row
    std = catalog.BY_SLUG.get(slug)
    if std is None:
        raise ApiError("Legal document not found", status_code=404)
    row = LegalDocument(slug=slug, title=std.title, summary=std.summary, audience=std.audience,
                        body=catalog.template(slug), sort_order=std.order, listed=True, draft_version=0,
                        updated_by=actor)
    db.add(row)
    await db.flush()
    return row


async def save_draft(db: AsyncSession, slug: str, data: dict, *, actor: str | None,
                     expected_version: int | None) -> dict:
    try:
        clean = DraftIn.model_validate(data)
    except ValidationError as e:
        raise ApiError(f"Invalid document — {_problems(e)}", status_code=422) from e
    if bad := catalog.unknown_tokens(clean.body):
        raise ApiError(f"Unknown placeholders: {', '.join('{{' + t + '}}' for t in bad)}", status_code=422)
    row = await _lock_or_seed(db, slug, actor)
    if expected_version is not None and expected_version != row.draft_version:
        raise ApiError("Someone else changed this document — reload and try again", status_code=409)
    row.title, row.summary, row.audience, row.body = clean.title, clean.summary, clean.audience, clean.body
    row.sort_order, row.listed = clean.sort_order, clean.listed
    row.draft_version += 1
    row.updated_by = actor
    await db.flush()
    if row.published_version is not None:
        # listing/order changes show on the site straight away
        await outbox.enqueue(db, "website.revalidate", {"section": "legal", "slug": slug})
    return await admin_get(db, slug)


async def load_template(db: AsyncSession, slug: str, *, actor: str | None) -> dict:
    """Replace the draft body with BukkaPay's latest template (e.g. after the
    template was expanded). Published versions are untouched; publish the
    draft to make it live."""
    if slug not in catalog.BY_SLUG:
        raise ApiError("Only standard documents have a template", status_code=404)
    row = await _lock_or_seed(db, slug, actor)
    row.body = catalog.template(slug)
    row.draft_version += 1
    row.updated_by = actor
    await db.flush()
    return await admin_get(db, slug)


async def create(db: AsyncSession, *, slug: str, title: str, actor: str | None) -> dict:
    slug = slug.strip().lower()
    if not SLUG.match(slug) or len(slug) > 60:
        raise ApiError("Use lowercase letters, numbers and hyphens for the web address (e.g. fees-schedule)")
    if slug in catalog.BY_SLUG or await db.get(LegalDocument, slug):
        raise ApiError("A document with that web address already exists", status_code=409)
    title = title.strip()
    if not 3 <= len(title) <= 120:
        raise ApiError("Title must be 3–120 characters")
    db.add(LegalDocument(slug=slug, title=title, summary="", audience="everyone",
                         body=f"## {title}\n\nWrite the document here.\n", sort_order=500, listed=True,
                         draft_version=1, updated_by=actor))
    await db.flush()
    return await admin_get(db, slug)


async def publish(db: AsyncSession, slug: str, data: dict, *, actor: str | None) -> dict:
    try:
        body = PublishIn.model_validate(data)
    except ValidationError as e:
        raise ApiError(f"Invalid publish request — {_problems(e)}", status_code=422) from e
    if body.review_status == "approved" and not (body.reviewed_by or "").strip():
        raise ApiError("Say who reviewed it (e.g. the law firm) before marking it approved")
    row = await _lock_or_seed(db, slug, actor)
    if body.draft_version is not None and body.draft_version != row.draft_version:
        raise ApiError("The draft changed since you opened it — reload and try again", status_code=409)
    number = (row.published_version or 0) + 1
    db.add(LegalDocumentVersion(
        slug=slug, version=number, title=row.title, summary=row.summary, body=row.body,
        effective_date=body.effective_date, review_status=body.review_status,
        reviewed_by=(body.reviewed_by or "").strip() or None, change_note=(body.change_note or "").strip() or None,
        published_by=actor, published_at=datetime.now(timezone.utc),
    ))
    row.published_version = number
    await db.flush()
    await outbox.enqueue(db, "website.revalidate", {"section": "legal", "slug": slug, "version": number})
    return await admin_get(db, slug)


# ---------------------------------------------------------------- public

def _public(slug: str, *, title: str, summary: str, audience: str, body: str | None, version: int,
            effective_date: str | None, review_status: str, reviewed_by: str | None) -> dict:
    out = {"slug": slug, "title": title, "summary": summary, "audience": audience, "version": version,
           "effectiveDate": effective_date, "reviewStatus": review_status, "reviewedBy": reviewed_by}
    if body is not None:
        out["body"] = body
    return out


async def public_list(db: AsyncSession) -> list[dict]:
    rows, latest = await _rows(db), await _latest_versions(db)
    out: list[tuple[int, dict]] = []
    slugs = [s.slug for s in catalog.STANDARD] + [s for s in rows if s not in catalog.BY_SLUG]
    for slug in slugs:
        row, v, std = rows.get(slug), latest.get(slug), catalog.BY_SLUG.get(slug)
        if row is not None and not row.listed:
            continue
        order = row.sort_order if row else std.order
        audience = row.audience if row else std.audience
        if v is not None:
            out.append((order, _public(slug, title=v.title, summary=v.summary, audience=audience, body=None,
                                       version=v.version, effective_date=v.effective_date.isoformat(),
                                       review_status=v.review_status, reviewed_by=v.reviewed_by)))
        elif std is not None:
            out.append((order, _public(slug, title=std.title, summary=std.summary, audience=audience, body=None,
                                       version=0, effective_date=None, review_status="template",
                                       reviewed_by=None)))
    return [d for _, d in sorted(out, key=lambda x: (x[0], x[1]["title"]))]


async def public_get(db: AsyncSession, slug: str, version: int | None = None) -> dict:
    details, _ = await get_details(db)
    stmt = select(LegalDocumentVersion).where(LegalDocumentVersion.slug == slug)
    versions = (await db.execute(stmt.order_by(LegalDocumentVersion.version.desc()))).scalars().all()
    history = [{"version": v.version, "effectiveDate": v.effective_date.isoformat(),
                "reviewStatus": v.review_status, "changeNote": v.change_note} for v in versions]
    row = await db.get(LegalDocument, slug)
    audience = row.audience if row else (catalog.BY_SLUG[slug].audience if slug in catalog.BY_SLUG else "everyone")
    if versions:
        chosen = versions[0] if version is None else next((v for v in versions if v.version == version), None)
        if chosen is None:
            raise ApiError("Version not found", status_code=404)
        doc = _public(slug, title=chosen.title, summary=chosen.summary, audience=audience,
                      body=catalog.fill(chosen.body, details), version=chosen.version,
                      effective_date=chosen.effective_date.isoformat(), review_status=chosen.review_status,
                      reviewed_by=chosen.reviewed_by)
        doc["isLatest"] = chosen.version == versions[0].version
    elif slug in catalog.BY_SLUG and version in (None, 0):
        std = catalog.BY_SLUG[slug]
        doc = _public(slug, title=std.title, summary=std.summary, audience=audience,
                      body=catalog.fill(catalog.template(slug), details), version=0, effective_date=None,
                      review_status="template", reviewed_by=None)
        doc["isLatest"] = True
    else:
        raise ApiError("Legal document not found", status_code=404)
    doc["history"] = history
    doc["company"] = {"legalName": details.legal_name or None, "tradingName": details.trading_name}
    return doc
