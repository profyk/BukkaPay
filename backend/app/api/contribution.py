from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.contribution import (
    ContributionGroupDetailResponse,
    ContributionGroupResponse,
    ContributionResponse,
    CreateContributionGroupRequest,
    ContributionPayoutRequest,
    CreateContributionRequest,
    GuestContributionRequest,
)
from app.services import contribution_service as svc

router = APIRouter(prefix="/api/contributions", tags=["contributions"])


def _with_status(group) -> ContributionGroupResponse:
    payload = ContributionGroupResponse.model_validate(group)
    payload.status = "active" if group.is_active else "inactive"
    return payload


@router.get("")
async def list_contribution_groups(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[ContributionGroupResponse]:
    groups = await svc.get_groups_by_creator(db, user_id)
    return [_with_status(g) for g in groups]


@router.post("", status_code=201)
async def create_contribution_group(
    body: CreateContributionGroupRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> ContributionGroupResponse:
    group = await svc.create_group(
        db, user_id, title=body.title, description=body.description, category=body.category,
        target_amount=body.target_amount, currency=body.currency, is_active=body.is_active,
        end_date=body.end_date,
    )
    return _with_status(group)


@router.get("/{group_id}")
async def get_contribution_group(
    group_id: str, db: AsyncSession = Depends(get_db)
) -> ContributionGroupDetailResponse:
    group = await svc.get_group(db, group_id)
    if group is None:
        raise ApiError("Contribution group not found", status_code=404)
    contributions = await svc.get_contributions_by_group(db, group.id)
    return ContributionGroupDetailResponse.model_validate({
        "group": _with_status(group),
        "contributions": [ContributionResponse.model_validate(c) for c in contributions],
    })


@router.get("/code/{code}")
async def get_contribution_group_by_code(
    code: str, db: AsyncSession = Depends(get_db)
) -> ContributionGroupDetailResponse:
    group = await svc.get_group_by_share_code(db, code)
    if group is None:
        raise ApiError("Contribution group not found", status_code=404)
    contributions = await svc.get_contributions_by_group(db, group.id)
    return ContributionGroupDetailResponse.model_validate({
        "group": _with_status(group),
        "contributions": [ContributionResponse.model_validate(c) for c in contributions],
    })


@router.post("/{group_id}/contribute", status_code=201)
async def contribute(
    group_id: str, body: CreateContributionRequest, user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> ContributionResponse:
    """Contribute from your BukkaPay wallet (guests use /contribute/eft)."""
    from app.services import pin_service

    await pin_service.verify_pin(db, user_id, body.pin)
    group = await svc.get_group(db, group_id)
    if group is None:
        raise ApiError("Contribution group not found", status_code=404)
    contribution = await svc.contribute_from_wallet(
        db, group, user_id, contributor_name=body.contributor_name, contributor_phone=body.contributor_phone,
        amount=body.amount, message=body.message, is_anonymous=body.is_anonymous,
    )
    return ContributionResponse.model_validate(contribution)


@router.post("/{group_id}/contribute/eft")
async def contribute_eft(group_id: str, body: GuestContributionRequest, db: AsyncSession = Depends(get_db)):
    """Guest contribution by instant EFT; recorded only when Stitch confirms."""
    from app.services import stitch_service

    group = await svc.get_group(db, group_id)
    if group is None:
        raise ApiError("Contribution group not found", status_code=404)
    svc.ensure_open(group)
    return await stitch_service.initiate_contribution_eft(
        db, group, payer_name=body.payer_name, payer_email=body.payer_email, amount=body.amount)


@router.post("/{group_id}/payout")
async def payout(group_id: str, body: ContributionPayoutRequest, user_id=Depends(get_current_user_id),
                 db: AsyncSession = Depends(get_db)):
    from app.services import pin_service

    await pin_service.verify_pin(db, user_id, body.pin)
    group = await svc.get_group(db, group_id)
    if group is None:
        raise ApiError("Contribution group not found", status_code=404)
    return await svc.payout(db, group, user_id, body.amount)


@router.post("/{group_id}/close")
async def close(group_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise ApiError("Contribution group not found", status_code=404)
    if group.creator_id != user_id:
        raise ApiError("Only the creator can close this campaign", status_code=403)
    group.is_active = False
    await db.flush()
    return _with_status(group)
