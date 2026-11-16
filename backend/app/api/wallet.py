from decimal import Decimal

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.ledger import idempotency, posting
from app.models.platform import PaymentCorridor, Transfer
from app.models.user import User
from app.network import countries as country_service
from app.network import fees, fx, routing
from app.network import transfers as xb_transfers
from app.schemas.wallet import (
    CardPricingResponse,
    CreateCardRequest,
    CrossBorderTransferRequest,
    RecipientLookupResponse,
    TransactionResponse,
    TransferQuoteRequest,
    TransferQuoteResponse,
    TransferRequest,
    TransferResponse,
    TransferStatusResponse,
    WalletCardResponse,
)
from app.services import pin_service, wallet_service

router = APIRouter(prefix="/api", tags=["wallet"])


async def _wallet_responses(db: AsyncSession, wallets) -> list[WalletCardResponse]:
    from app.cards import service as card_service

    issued = await card_service.live_cards_by_wallet(db, [w.id for w in wallets])
    return [WalletCardResponse.from_wallet(w, issued.get(w.id)) for w in wallets]


@router.get("/cards/pricing")
async def get_card_pricing(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> CardPricingResponse:
    user = await db.get(User, user_id)
    currency = "ZAR"
    issuance = await fees.compute(db, "card_issuance", Decimal(0), currency=currency, country=user.residence_country)
    monthly = await fees.compute(db, "card_maintenance", Decimal(0), currency=currency,
                                 country=user.residence_country)
    return CardPricingResponse.model_validate({
        "issuanceFee": issuance.fee, "monthlyFee": monthly.fee, "currency": currency,
    })


@router.get("/cards")
async def list_cards(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[WalletCardResponse]:
    cards = await wallet_service.get_wallet_cards(db, user_id)
    return await _wallet_responses(db, cards)


@router.get("/cards/{card_id}")
async def get_card(
    card_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> WalletCardResponse:
    card = await wallet_service.get_wallet_card(db, card_id, user_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    return (await _wallet_responses(db, [card]))[0]


@router.post("/cards", status_code=201)
async def create_card(
    body: CreateCardRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> WalletCardResponse:
    card = await wallet_service.create_wallet_card(db, user_id, body.title, currency=body.currency)
    return (await _wallet_responses(db, [card]))[0]


@router.patch("/cards/{card_id}/set-default")
async def set_default_card(
    card_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> WalletCardResponse:
    card = await wallet_service.set_default_card(db, card_id, user_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    return (await _wallet_responses(db, [card]))[0]


@router.get("/transactions")
async def list_transactions(
    limit: int | None = Query(default=None),
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[TransactionResponse]:
    transactions = await wallet_service.get_transactions(db, user_id, limit)
    return [TransactionResponse.model_validate(t) for t in transactions]


@router.get("/wallet/lookup/{identifier}")
async def lookup_recipient(
    identifier: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> RecipientLookupResponse:
    recipient = await wallet_service.lookup_recipient(db, identifier)
    if recipient is None:
        raise ApiError("No BukkaPay user found for this wallet ID", status_code=404)
    if recipient.id == user_id:
        raise ApiError("This is your own wallet ID")
    return RecipientLookupResponse.model_validate(recipient)


@router.post("/transfer", dependencies=[Depends(rate_limit("payment", 30, 60))])
async def transfer(
    body: TransferRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> TransferResponse:
    """Domestic, same-currency send — completes immediately."""
    await pin_service.verify_pin(db, user_id, body.pin)
    payload = body.model_dump(exclude={"pin"})
    async with idempotency.guard(db, scope=f"transfer:{user_id}", key=idempotency_key, payload=payload) as g:
        if g.replay is not None:
            return TransferResponse.model_validate(g.replay)
        result = await wallet_service.send_money(
            db, user_id, from_card_id=body.from_card_id, to_user_id=body.to_user_id, amount=body.amount,
            purpose_category=body.purpose_category, purpose_subcategory=body.purpose_subcategory,
        )
        g.store(result)
    return TransferResponse.model_validate(result)


@router.post("/transfer/quote")
async def transfer_quote(
    body: TransferQuoteRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TransferQuoteResponse:
    """Domestic: fee preview. Cross-border: an executable quote (stored, with
    an expiry) that the customer confirms via POST /transfers/cross-border."""
    user = await db.get(User, user_id)
    card = await wallet_service.get_wallet_card(db, body.from_card_id, user_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    amount = posting.parse_amount(body.amount)
    destination = (body.destination_country_code or user.residence_country or "").upper()
    if destination == (user.residence_country or "").upper():
        result = await wallet_service.quote_local(db, user, card.currency, body.amount)
        return TransferQuoteResponse.model_validate({
            "kind": "domestic", "sourceAmount": amount, "sourceCurrency": card.currency,
            "exchangeRate": Decimal(1), "fee": result["fee"], "totalDebit": amount,
            "destinationAmount": result["destination_amount"], "destinationCurrency": card.currency,
            "destinationCountry": destination, "feeBreakdown": result["fee_breakdown"],
        })
    dest_country = await country_service.get(db, destination)
    if dest_country is None:
        raise ApiError(f"Unknown destination country: {destination}")
    corridor = await routing.find_corridor(
        db, from_country=user.residence_country, to_country=dest_country.code,
        from_currency=card.currency, to_currency=dest_country.default_currency,
    )
    quote = await fx.create_quote(db, user_id=user_id, corridor=corridor, source_amount=amount)
    return TransferQuoteResponse.model_validate({
        "kind": "cross_border", "quoteId": str(quote.id), "expiresAt": quote.expires_at,
        "rateTimestamp": quote.rate_timestamp, "sourceAmount": quote.source_amount,
        "sourceCurrency": quote.from_currency, "exchangeRate": quote.rate, "fee": quote.fee,
        "totalDebit": quote.source_amount, "destinationAmount": quote.destination_amount,
        "destinationCurrency": quote.to_currency, "destinationCountry": dest_country.code,
        "feeBreakdown": quote.fee_breakdown,
    })


@router.post("/transfers/cross-border", dependencies=[Depends(rate_limit("payment", 30, 60))])
async def cross_border_transfer(
    body: CrossBorderTransferRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> TransferStatusResponse:
    await pin_service.verify_pin(db, user_id, body.pin)
    payload = body.model_dump(exclude={"pin"})
    async with idempotency.guard(db, scope=f"xb:{user_id}", key=idempotency_key, payload=payload) as g:
        if g.replay is not None:
            return TransferStatusResponse.model_validate(g.replay)
        sender = await db.get(User, user_id)
        if sender.frozen:
            raise ApiError("Your account is restricted", status_code=403)
        card = await wallet_service.get_wallet_card(db, body.from_card_id, user_id)
        if card is None:
            raise ApiError("Card not found", status_code=404)
        wallet_service._check_card_usable(card)
        recipient = await wallet_service.lookup_recipient(db, body.to_user_id)
        if recipient is None or recipient.frozen:
            raise ApiError("Recipient not found", status_code=404)
        if recipient.id == user_id:
            raise ApiError("Cannot transfer to yourself")
        quote = await fx.consume_quote(db, body.quote_id, user_id)
        transfer = await xb_transfers.initiate(
            db, sender=sender, sender_card=card, recipient=recipient, quote=quote,
            purpose_category=body.purpose_category, purpose_subcategory=body.purpose_subcategory,
        )
        result = await _transfer_status(db, transfer)
        g.store(result.model_dump(by_alias=True, mode="json"))
    return result


@router.get("/transfers/{reference}")
async def get_transfer(
    reference: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TransferStatusResponse:
    transfer = (await db.execute(select(Transfer).where(Transfer.reference == reference))).scalar_one_or_none()
    if transfer is None or user_id not in (transfer.sender_id, transfer.recipient_id):
        raise ApiError("Transfer not found", status_code=404)
    return await _transfer_status(db, transfer)


async def _transfer_status(db: AsyncSession, transfer: Transfer) -> TransferStatusResponse:
    corridor = await db.get(PaymentCorridor, transfer.corridor_id)
    return TransferStatusResponse.model_validate({
        "reference": transfer.reference, "status": transfer.status, "fromCurrency": transfer.from_currency,
        "toCurrency": transfer.to_currency, "sourceAmount": transfer.source_amount, "fee": transfer.fee,
        "rate": transfer.rate, "destinationAmount": transfer.destination_amount,
        "corridor": f"{corridor.from_country}->{corridor.to_country}", "rail": transfer.rail,
        "failureReason": transfer.failure_reason, "createdAt": transfer.created_at,
        "settledAt": transfer.settled_at, "creditedAt": transfer.credited_at,
    })
