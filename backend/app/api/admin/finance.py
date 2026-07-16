from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, admin_auth, super_admin_or_master_key
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.admin import (
    AdminPaymentLinksListResponse,
    AdminTransactionsListResponse,
    AdminWalletsListResponse,
    CorridorRow,
    CorridorsListResponse,
    FlagTransactionResponse,
    InternationalTransferRow,
    InternationalTransfersListResponse,
    UpdateCorridorRequest,
    UpdatePaymentLinkStatusRequest,
    WalletActionRequest,
    WalletActionResponse,
    WalletBalanceRequest,
)
from app.services import admin_finance_service as svc

router = APIRouter(tags=["admin-finance"])


def _pages(total: int, limit: int) -> int:
    return -(-total // limit)


@router.get("/transactions")
async def list_transactions(
    page: int = Query(default=1, ge=1), limit: int = Query(default=50, ge=1, le=200),
    user_id: str | None = Query(default=None),
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> AdminTransactionsListResponse:
    rows, total = await svc.list_transactions(db, page=page, limit=limit, user_id=user_id)
    transactions = [
        {**{c.name: getattr(tx, c.name) for c in tx.__table__.columns}, "user": user}
        for tx, user in rows
    ]
    return AdminTransactionsListResponse.model_validate({
        "transactions": transactions,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": _pages(total, limit)},
    })


@router.post("/transactions/flag/{transaction_id}")
async def flag_transaction(
    transaction_id: str, _ctx: AdminContext = Depends(admin_auth)
) -> FlagTransactionResponse:
    result = await svc.flag_transaction(transaction_id)
    return FlagTransactionResponse.model_validate(result)


@router.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: str, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> dict:
    await svc.delete_transaction(db, transaction_id)
    return {"success": True}


@router.get("/wallets")
async def list_wallets(
    page: int = Query(default=1, ge=1), limit: int = Query(default=50, ge=1, le=200),
    user_id: str | None = Query(default=None),
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> AdminWalletsListResponse:
    rows, total = await svc.list_wallets(db, page=page, limit=limit, user_id=user_id)
    wallets = []
    for card, user in rows:
        status = "blocked" if card.blocked else "frozen" if card.frozen else "active"
        wallets.append({
            **{c.name: getattr(card, c.name) for c in card.__table__.columns},
            "balance": float(card.balance), "status": status,
            "userEmail": user.email, "userName": user.name, "userId": user.id,
        })
    return AdminWalletsListResponse.model_validate({
        "wallets": wallets,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": _pages(total, limit)},
    })


async def _wallet_card_response(db: AsyncSession, card, success_extra: dict | None = None) -> dict:
    # `updated_at` has an onupdate=func.now() server default, so after a
    # flush it's marked expired — a plain getattr() would try a lazy sync
    # load outside SQLAlchemy's async greenlet bridge and blow up with
    # MissingGreenlet. Refresh explicitly first.
    await db.refresh(card)
    payload = {"success": True, "card": {c.name: getattr(card, c.name) for c in card.__table__.columns}}
    if success_extra:
        payload.update(success_extra)
    return payload


@router.patch("/wallets/{card_id}/freeze")
async def freeze_wallet(
    card_id: str, body: WalletActionRequest, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> WalletActionResponse:
    card = await svc.get_wallet_card(db, card_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    frozen = body.frozen is not False
    await svc.set_card_frozen(card, frozen)
    await db.flush()
    return WalletActionResponse.model_validate(await _wallet_card_response(db, card, {"frozen": frozen}))


@router.patch("/wallets/{card_id}/block")
async def block_wallet(
    card_id: str, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> WalletActionResponse:
    card = await svc.get_wallet_card(db, card_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    await svc.set_card_blocked(card, True)
    await db.flush()
    return WalletActionResponse.model_validate(await _wallet_card_response(db, card))


@router.patch("/wallets/{card_id}/unblock")
async def unblock_wallet(
    card_id: str, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> WalletActionResponse:
    card = await svc.get_wallet_card(db, card_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    await svc.set_card_blocked(card, False)
    await db.flush()
    return WalletActionResponse.model_validate(await _wallet_card_response(db, card))


@router.patch("/wallets/{card_id}/flag")
async def flag_wallet(
    card_id: str, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> WalletActionResponse:
    card = await svc.get_wallet_card(db, card_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    await svc.set_card_flagged(card, True)
    await db.flush()
    return WalletActionResponse.model_validate(await _wallet_card_response(db, card))


@router.patch("/wallets/{card_id}/unflag")
async def unflag_wallet(
    card_id: str, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> WalletActionResponse:
    card = await svc.get_wallet_card(db, card_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    await svc.set_card_flagged(card, False)
    await db.flush()
    return WalletActionResponse.model_validate(await _wallet_card_response(db, card))


@router.patch("/wallets/{card_id}/balance")
async def set_wallet_balance(
    card_id: str, body: WalletBalanceRequest, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> WalletActionResponse:
    card = await svc.get_wallet_card(db, card_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    await svc.set_card_balance(card, body.balance)
    await db.flush()
    return WalletActionResponse.model_validate(await _wallet_card_response(db, card))


@router.get("/payment-links")
async def list_payment_links(
    page: int = Query(default=1, ge=1), limit: int = Query(default=50, ge=1, le=200),
    status: str | None = Query(default=None),
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> AdminPaymentLinksListResponse:
    rows, total = await svc.list_payment_links(db, page=page, limit=limit, status=status)
    links = [
        {**{c.name: getattr(link, c.name) for c in link.__table__.columns}, "user": user}
        for link, user in rows
    ]
    return AdminPaymentLinksListResponse.model_validate({
        "paymentLinks": links,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": _pages(total, limit)},
    })


@router.patch("/payment-links/{link_id}/status")
async def update_payment_link_status(
    link_id: str, body: UpdatePaymentLinkStatusRequest, _ctx: AdminContext = Depends(admin_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    link = await svc.get_payment_link(db, link_id)
    if link is None:
        raise ApiError("Payment link not found", status_code=404)
    await svc.update_payment_link_status(link, body.status)
    await db.flush()
    await db.refresh(link)
    return {"success": True, "paymentLink": {c.name: getattr(link, c.name) for c in link.__table__.columns}}


@router.get("/corridors")
async def list_corridors(
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> CorridorsListResponse:
    corridors = await svc.list_corridors(db)
    return CorridorsListResponse.model_validate({"corridors": corridors})


@router.patch("/corridors/{corridor_id}")
async def update_corridor(
    corridor_id: str, body: UpdateCorridorRequest,
    _ctx: AdminContext = Depends(super_admin_or_master_key), db: AsyncSession = Depends(get_db),
) -> CorridorRow:
    corridor = await svc.get_corridor(db, corridor_id)
    if corridor is None:
        raise ApiError("Corridor not found", status_code=404)
    await svc.update_corridor(corridor, body.model_dump(exclude_unset=True))
    await db.flush()
    await db.refresh(corridor)
    return CorridorRow.model_validate(corridor)


@router.get("/international-transfers")
async def list_international_transfers(
    page: int = Query(default=1, ge=1), limit: int = Query(default=50, ge=1, le=200),
    user_id: str | None = Query(default=None),
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> InternationalTransfersListResponse:
    transfers, users_by_id, total = await svc.list_international_transfers(db, page=page, limit=limit, user_id=user_id)

    def _user_summary(user_id):
        u = users_by_id.get(user_id)
        if u is None:
            return {"id": user_id, "name": "Unknown", "username": "", "email": ""}
        return {"id": u.id, "name": u.name, "username": u.username, "email": u.email}

    rows = [
        {
            **{c.name: getattr(t, c.name) for c in t.__table__.columns},
            "sender": _user_summary(t.sender_id),
            "recipient": _user_summary(t.recipient_id),
        }
        for t in transfers
    ]
    return InternationalTransfersListResponse.model_validate({
        "transfers": rows,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": _pages(total, limit)},
    })
