import uuid
from datetime import UTC, datetime, timedelta
from datetime import date as date_cls
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.models.enums import NotificationType, PurchaseCategory, PurchaseStatus, TransactionType
from app.models.ledger import JournalEntry
from app.models.misc import PurchaseTransaction
from app.models.travel import TravelDeparture, TravelOperator, TravelRoute
from app.models.wallet import Transaction
from app.services import notification_service, purchase_transaction_service, wallet_service


def _format_duration(delta: timedelta) -> str:
    total_minutes = int(delta.total_seconds() // 60)
    hours, minutes = divmod(total_minutes, 60)
    if hours and minutes:
        return f"{hours}h {minutes}m"
    if hours:
        return f"{hours}h"
    return f"{minutes}m"


async def _get_departure_bundle(db: AsyncSession, departure_id: str):
    """Returns (departure, route, operator) or None — the manual-join
    pattern this codebase uses throughout instead of ORM relationships
    (see wallet.py/rental.py)."""
    try:
        dep_uuid = uuid.UUID(departure_id)
    except ValueError:
        return None
    result = await db.execute(
        select(TravelDeparture, TravelRoute, TravelOperator)
        .join(TravelRoute, TravelDeparture.route_id == TravelRoute.id)
        .join(TravelOperator, TravelRoute.operator_id == TravelOperator.id)
        .where(TravelDeparture.id == dep_uuid)
    )
    return result.first()


async def search_departures(
    db: AsyncSession, *, mode: str, origin_country_code: str | None = None,
    destination_country_code: str | None = None, date: str | None = None,
) -> list[dict]:
    stmt = (
        select(TravelDeparture, TravelRoute, TravelOperator)
        .join(TravelRoute, TravelDeparture.route_id == TravelRoute.id)
        .join(TravelOperator, TravelRoute.operator_id == TravelOperator.id)
        .where(
            TravelRoute.mode == mode,
            TravelDeparture.is_active.is_(True),
            TravelRoute.is_active.is_(True),
            TravelOperator.is_active.is_(True),
        )
    )
    if origin_country_code:
        stmt = stmt.where(TravelRoute.origin_country_code == origin_country_code)
    if destination_country_code:
        stmt = stmt.where(TravelRoute.destination_country_code == destination_country_code)

    if date:
        try:
            day = date_cls.fromisoformat(date)
        except ValueError as e:
            raise ApiError("Invalid date") from e
        start = datetime(day.year, day.month, day.day, tzinfo=UTC)
        stmt = stmt.where(TravelDeparture.departure_at >= start, TravelDeparture.departure_at < start + timedelta(days=1))
    else:
        stmt = stmt.where(TravelDeparture.departure_at >= datetime.now(UTC))

    stmt = stmt.order_by(TravelDeparture.departure_at.asc())
    rows = (await db.execute(stmt)).all()
    return [
        {
            "departure": dep, "route": route, "operator": operator,
            "seatsAvailable": dep.total_seats - dep.seats_booked,
        }
        for dep, route, operator in rows
    ]


async def get_departure(db: AsyncSession, departure_id: str) -> dict | None:
    bundle = await _get_departure_bundle(db, departure_id)
    if bundle is None:
        return None
    dep, route, operator = bundle
    return {"departure": dep, "route": route, "operator": operator, "seatsAvailable": dep.total_seats - dep.seats_booked}


async def book(
    db: AsyncSession, user_id: uuid.UUID, *, departure_id: str, from_card_id: str,
    seat_class: str, passengers: list[dict],
) -> PurchaseTransaction:
    bundle = await _get_departure_bundle(db, departure_id)
    if bundle is None:
        raise ApiError("Departure not found", status_code=404)
    dep, route, operator = bundle

    if not dep.is_active or not route.is_active or not operator.is_active:
        raise ApiError("This departure is no longer available")
    if dep.departure_at <= datetime.now(UTC):
        raise ApiError("This departure has already left")

    passenger_count = len(passengers)
    if passenger_count < 1:
        raise ApiError("At least one passenger is required")
    seats_available = dep.total_seats - dep.seats_booked
    if passenger_count > seats_available:
        raise ApiError(f"Only {seats_available} seat(s) left on this departure")

    is_business = seat_class == "business" and dep.business_price is not None
    unit_price: Decimal = dep.business_price if is_business else dep.price
    total_amount = unit_price * passenger_count

    card = await wallet_service.get_wallet_card(db, from_card_id, user_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    if card.blocked or card.flagged:
        raise ApiError("This card is restricted", status_code=403)
    if card.frozen:
        raise ApiError("This card is frozen", status_code=403)
    if card.currency != dep.currency:
        raise ApiError(f"This departure is priced in {dep.currency} — use a {dep.currency} wallet to book")
    if card.balance < total_amount:
        raise ApiError("Insufficient balance")

    dep.seats_booked += passenger_count
    await db.flush()

    is_bus = route.mode == "bus"
    metadata = {
        "ticketType": route.mode,
        ("operator" if is_bus else "airline"): operator.name,
        "from": route.origin_city,
        "to": route.destination_city,
        **({} if is_bus else {"fromCode": route.origin_code, "toCode": route.destination_code}),
        "departure": dep.departure_at.strftime("%H:%M"),
        "arrival": dep.arrival_at.strftime("%H:%M"),
        "travelDate": dep.departure_at.strftime("%Y-%m-%d"),
        "duration": _format_duration(dep.arrival_at - dep.departure_at),
        "seatClass": "Business" if is_business else ("Standard" if is_bus else "Economy"),
        "passengerCount": passenger_count,
        "passengers": passengers,
        "pricePerPerson": f"{unit_price:.2f}",
        "departureId": str(dep.id),
    }

    transaction = await purchase_transaction_service.create_transaction(
        db, user_id, category=PurchaseCategory.TRAVEL.value, merchant_name=operator.name,
        amount=f"{total_amount:.2f}", currency=dep.currency, status=PurchaseStatus.SUCCESS.value, metadata=metadata,
    )

    # Ticket money is owed to the operator until settled with them.
    await posting.post(
        db, kind="travel_booking", description=f"Ticket {transaction.id} with {operator.name}",
        legs=[
            posting.debit(await ledger_accounts.wallet_account(db, card), total_amount),
            posting.credit(await _operator_payable(db, dep.currency), total_amount),
        ],
        details={"purchase_transaction_id": str(transaction.id), "operator_id": str(operator.id)},
    )
    db.add(Transaction(
        user_id=user_id,
        card_id=card.id,
        title=f"{operator.name} · {route.origin_city} → {route.destination_city}",
        category="travel",
        amount=total_amount,
        type=TransactionType.DEBIT,
        icon="airplane" if not is_bus else "bus",
    ))
    await db.flush()

    await notification_service.create_notification(
        db, user_id, NotificationType.SUCCESS, "Ticket Booked",
        f"{operator.name}: {route.origin_city} → {route.destination_city} on {metadata['travelDate']}",
        related_id=str(transaction.id), related_type="purchase_transaction",
    )

    return transaction


async def _operator_payable(db: AsyncSession, currency: str):
    return await ledger_accounts.system_account(
        db, f"payable:travel_operators:{currency}", f"Owed to travel operators ({currency})",
        "liability", currency,
    )


async def cancel_booking(db: AsyncSession, user_id: uuid.UUID, purchase_transaction_id: str) -> PurchaseTransaction:
    transaction = await purchase_transaction_service.get_transaction(db, purchase_transaction_id)
    if transaction is None or transaction.category != PurchaseCategory.TRAVEL.value:
        raise ApiError("Ticket not found", status_code=404)
    if transaction.user_id != user_id:
        raise ApiError("Access denied", status_code=403)
    if transaction.status == PurchaseStatus.REFUNDED.value:
        raise ApiError("This ticket has already been cancelled")

    meta = transaction.meta or {}
    if meta.get("ticketStatus") == "used":
        raise ApiError("A used ticket can't be cancelled")

    departure_id = meta.get("departureId")
    if departure_id:
        bundle = await _get_departure_bundle(db, departure_id)
        if bundle is not None:
            dep, _route, _operator = bundle
            if dep.departure_at <= datetime.now(UTC):
                raise ApiError("This departure has already left — it can no longer be cancelled")
            dep.seats_booked = max(0, dep.seats_booked - int(meta.get("passengerCount", 1)))

    try:
        refund_amount = Decimal(str(transaction.amount))
    except InvalidOperation as e:
        raise ApiError("Invalid ticket amount") from e

    cards = await wallet_service.get_wallet_cards(db, user_id)
    card = next((c for c in cards if c.currency == transaction.currency), None)
    if card is None:
        card = await wallet_service.get_or_create_currency_card(db, user_id, transaction.currency)
    booked = (
        await db.execute(
            select(JournalEntry.id).where(
                JournalEntry.kind == "travel_booking",
                JournalEntry.details["purchase_transaction_id"].astext == str(transaction.id),
            )
        )
    ).first()
    # Bookings made before the ledger have no payable entry to unwind; their
    # refund is funded from the migration suspense account instead.
    source = (
        await _operator_payable(db, transaction.currency) if booked
        else await ledger_accounts.migration_suspense(db, transaction.currency)
    )
    await posting.post(
        db, kind="travel_refund", description=f"Refund of ticket {transaction.id}",
        legs=[
            posting.debit(source, posting.money(refund_amount)),
            posting.credit(await ledger_accounts.wallet_account(db, card), posting.money(refund_amount)),
        ],
        details={"purchase_transaction_id": str(transaction.id), "pre_ledger": not booked},
    )

    transaction.status = PurchaseStatus.REFUNDED.value
    await db.flush()

    db.add(Transaction(
        user_id=user_id,
        card_id=card.id,
        title=f"Refund: {transaction.merchant_name}",
        category="travel",
        amount=refund_amount,
        type=TransactionType.CREDIT,
        icon="refresh",
    ))
    await db.flush()

    await notification_service.create_notification(
        db, user_id, NotificationType.INFO, "Ticket Cancelled",
        f"{transaction.merchant_name} — {transaction.currency} {refund_amount:.2f} refunded to your wallet",
        related_id=str(transaction.id), related_type="purchase_transaction",
    )

    return transaction
