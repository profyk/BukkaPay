from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.deps import get_db
from app.schemas.loyalty import (
    AutoPayResponse,
    BeneficiaryResponse,
    ChallengeResponse,
    CreateAutoPayRequest,
    CreateBeneficiaryRequest,
    CreateChallengeRequest,
    LoyaltyRewardResponse,
    VirtualCardResponse,
)
from app.services import loyalty_service as svc

router = APIRouter(prefix="/api", tags=["loyalty"])


@router.get("/loyalty")
async def get_loyalty(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> LoyaltyRewardResponse:
    reward = await svc.get_loyalty_reward(db, user_id)
    if reward is None:
        return LoyaltyRewardResponse.model_validate({"userId": user_id, "totalPoints": 0, "tier": "bronze"})
    return LoyaltyRewardResponse.model_validate(reward)


@router.get("/autopays")
async def list_autopays(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> list[AutoPayResponse]:
    autopays = await svc.get_autopays(db, user_id)
    return [AutoPayResponse.model_validate(a) for a in autopays]


@router.post("/autopays", status_code=201)
async def create_autopay(
    body: CreateAutoPayRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> AutoPayResponse:
    autopay = await svc.create_autopay(
        db, user_id, bill_name=body.bill_name, amount=body.amount, frequency=body.frequency,
        next_payment_date=body.next_payment_date, is_active=body.is_active,
    )
    return AutoPayResponse.model_validate(autopay)


@router.get("/beneficiaries")
async def list_beneficiaries(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[BeneficiaryResponse]:
    beneficiaries = await svc.get_beneficiaries(db, user_id)
    return [BeneficiaryResponse.model_validate(b) for b in beneficiaries]


@router.post("/beneficiaries", status_code=201)
async def create_beneficiary(
    body: CreateBeneficiaryRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> BeneficiaryResponse:
    beneficiary = await svc.create_beneficiary(
        db, user_id, name=body.name, wallet_id=body.wallet_id, is_favorite=body.is_favorite
    )
    return BeneficiaryResponse.model_validate(beneficiary)


@router.get("/challenges")
async def list_challenges(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[ChallengeResponse]:
    challenges = await svc.get_challenges(db, user_id)
    return [ChallengeResponse.model_validate(c) for c in challenges]


@router.post("/challenges", status_code=201)
async def create_challenge(
    body: CreateChallengeRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> ChallengeResponse:
    challenge = await svc.create_challenge(
        db, user_id, title=body.title, description=body.description, target=body.target,
        current=body.current, reward=body.reward, completed=body.completed,
    )
    return ChallengeResponse.model_validate(challenge)


@router.get("/virtual-cards")
async def list_virtual_cards(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[VirtualCardResponse]:
    cards = await svc.get_virtual_cards(db, user_id)
    return [VirtualCardResponse.model_validate(c) for c in cards]


# No public POST /virtual-cards here on purpose: it used to take card_number
# and expiry_date directly from the client and store them as-is — anyone
# could fabricate an arbitrary card record with no issuer involved. It also
# had zero callers anywhere in the app; the real "Issue Virtual Card" flow
# (AddCardDialog.tsx) has always gone through POST /api/cards
# (wallet_service.create_wallet_card), which actually calls Stitch and now
# charges the admin-configured issuance fee. This route is orphaned twice
# over, so it's removed rather than fixed.
