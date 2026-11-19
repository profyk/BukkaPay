"""Admin: legal documents. Drafting needs legal.manage; publishing (which
changes what customers agree to) needs legal.publish. Every change is
audited by `require`, and published versions are kept forever."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, require
from app.db.deps import get_db
from app.legal import catalog
from app.legal import service as legal_service
from app.models.legal import AUDIENCES, REVIEW_STATUSES
from app.schemas.base import CamelModel

router = APIRouter(tags=["admin-legal"])


def _actor(ctx: AdminContext) -> str:
    return ctx.admin.email if ctx.admin else "master-key"


class DraftBody(CamelModel):
    data: dict
    version: int | None = None


class CreateBody(CamelModel):
    slug: str
    title: str


class DetailsBody(CamelModel):
    data: dict
    version: int | None = None


@router.get("/legal")
async def list_documents(_=Depends(require("legal.view")), db: AsyncSession = Depends(get_db)):
    details, details_version = await legal_service.get_details(db)
    return {
        "documents": await legal_service.admin_list(db),
        "details": details.model_dump(mode="json", by_alias=True),
        "detailsVersion": details_version,
        "placeholders": [{"token": "{{" + k + "}}", "label": v} for k, v in catalog.PLACEHOLDER_LABELS.items()],
        "audiences": list(AUDIENCES),
        "reviewStatuses": list(REVIEW_STATUSES),
    }


@router.put("/legal-details")
async def save_details(body: DetailsBody, ctx: AdminContext = Depends(require("legal.manage")),
                       db: AsyncSession = Depends(get_db)):
    return await legal_service.save_details(db, body.data, actor=_actor(ctx), expected_version=body.version)


@router.post("/legal", status_code=201)
async def create_document(body: CreateBody, ctx: AdminContext = Depends(require("legal.manage")),
                          db: AsyncSession = Depends(get_db)):
    return await legal_service.create(db, slug=body.slug, title=body.title, actor=_actor(ctx))


@router.get("/legal/{slug}")
async def get_document(slug: str, _=Depends(require("legal.view")), db: AsyncSession = Depends(get_db)):
    return await legal_service.admin_get(db, slug)


@router.get("/legal/{slug}/versions/{version}")
async def get_version(slug: str, version: int, _=Depends(require("legal.view")), db: AsyncSession = Depends(get_db)):
    return await legal_service.admin_version(db, slug, version)


@router.put("/legal/{slug}")
async def save_draft(slug: str, body: DraftBody, ctx: AdminContext = Depends(require("legal.manage")),
                     db: AsyncSession = Depends(get_db)):
    return await legal_service.save_draft(db, slug, body.data, actor=_actor(ctx), expected_version=body.version)


@router.post("/legal/{slug}/publish")
async def publish(slug: str, body: dict, ctx: AdminContext = Depends(require("legal.publish")),
                  db: AsyncSession = Depends(get_db)):
    return await legal_service.publish(db, slug, body, actor=_actor(ctx))
