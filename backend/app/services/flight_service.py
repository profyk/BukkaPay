"""Flight search, booking and cancellation across every flight provider.

Money: the customer's wallet is debited and an "owed to airlines" liability
is credited in one ledger entry, in the same transaction that books the seat
— so a booking either fully happens (seat + ticket + ledger) or not at all.
If the airline refuses, nothing is charged.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.integrations import flights as fl
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.models.enums import NotificationType, PurchaseCategory, PurchaseStatus, TransactionType
from app.models.misc import PurchaseTransaction
from app.models.wallet import Transaction, WalletCard
from app.reference import airports
from app.services import notification_service, purchase_transaction_service

MAX_PASSENGERS = 9
TITLES = ("mr", "ms", "mrs", "miss", "dr")
_IATA = re.compile(r"^[A-Z]{3}$")
_PHONE = re.compile(r"^\+[1-9]\d{6,14}$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _passenger_types(adults: int, children: int, infants: int) -> list[str]:
    if adults < 1:
        raise ApiError("At least one adult is needed")
    if infants > adults:
        raise ApiError("Each infant must travel with an adult")
    if adults + children + infants > MAX_PASSENGERS:
        raise ApiError(f"Up to {MAX_PASSENGERS} passengers per booking")
    return ["adult"] * adults + ["child"] * children + ["infant_without_seat"] * infants


def _code(v: str, what: str) -> str:
    c = (v or "").strip().upper()
    if not _IATA.match(c):
        raise ApiError(f"{what} must be a 3-letter airport code")
    return c


def is_international(origin: str, destination: str) -> bool:
    a, b = airports.get(origin), airports.get(destination)
    return a is None or b is None or a.country_code != b.country_code


async def search(db: AsyncSession, *, origin: str, destination: str, day: str, adults: int = 1,
                 children: int = 0, infants: int = 0, cabin: str = "economy") -> list[fl.FlightOffer]:
    origin, destination = _code(origin, "Origin"), _code(destination, "Destination")
    if origin == destination:
        raise ApiError("Origin and destination must be different")
    if cabin not in fl.CABINS:
        raise ApiError("Unknown cabin")
    try:
        d = date.fromisoformat(day)
    except ValueError as e:
        raise ApiError("Invalid date") from e
    if d < datetime.now(UTC).date():
        raise ApiError("Choose a date from today onwards")
    pax = _passenger_types(adults, children, infants)
    offers: list[fl.FlightOffer] = []
    errors = 0
    providers = fl.configured_providers()
    for p in providers:
        try:
            offers += await p.search(db, origin=origin, destination=destination, day=d, passengers=pax, cabin=cabin)
        except ApiError:
            errors += 1  # one airline source failing shouldn't hide the others
    if errors == len(providers):
        raise ApiError("Flight search is unavailable right now. Please try again shortly.", status_code=503)
    return sorted(offers, key=lambda o: (o.total_amount, o.departing_at))


def _age_on(born: date, on: date) -> int:
    return on.year - born.year - ((on.month, on.day) < (born.month, born.day))


def validate_travellers(travellers: list[dict], *, types: list[str], travel_day: date, international: bool) -> list[dict]:
    if len(travellers) != len(types):
        raise ApiError("Enter details for every passenger")
    out = []
    for i, t in enumerate(travellers, start=1):
        who = f"Passenger {i}"
        title = (t.get("title") or "").lower()
        given, family = (t.get("givenName") or "").strip(), (t.get("familyName") or "").strip()
        if title not in TITLES:
            raise ApiError(f"{who}: choose a title")
        if not given or not family:
            raise ApiError(f"{who}: enter first and last name exactly as on the ID or passport")
        try:
            born = date.fromisoformat(t.get("bornOn") or "")
        except ValueError as e:
            raise ApiError(f"{who}: enter a valid date of birth") from e
        age = _age_on(born, travel_day)
        if born >= datetime.now(UTC).date() or age > 120:
            raise ApiError(f"{who}: enter a valid date of birth")
        actual = "adult" if age >= 12 else ("child" if age >= 2 else "infant_without_seat")
        gender = (t.get("gender") or "").lower()
        if gender not in ("m", "f"):
            raise ApiError(f"{who}: choose a gender as on the passport")
        email = (t.get("email") or "").strip()
        phone = re.sub(r"[\s-]", "", t.get("phone") or "")
        if not _EMAIL.match(email):
            raise ApiError(f"{who}: enter a valid email")
        if not _PHONE.match(phone):
            raise ApiError(f"{who}: enter the phone number with country code, e.g. +27821234567")
        doc = t.get("document") or None
        if international:
            if not doc or not (doc.get("number") or "").strip():
                raise ApiError(f"{who}: a passport is needed for international flights")
            try:
                exp = date.fromisoformat(doc.get("expiresOn") or "")
            except ValueError as e:
                raise ApiError(f"{who}: enter the passport expiry date") from e
            if exp <= travel_day:
                raise ApiError(f"{who}: the passport expires before the flight")
            if not re.fullmatch(r"[A-Za-z]{2}", doc.get("issuingCountry") or ""):
                raise ApiError(f"{who}: choose the passport's issuing country")
            doc = {"number": doc["number"].strip().upper(), "issuingCountry": doc["issuingCountry"].upper(),
                   "expiresOn": exp.isoformat(), "nationality": (doc.get("nationality") or doc["issuingCountry"]).upper()}
        out.append({"type": actual, "title": title, "givenName": given, "familyName": family,
                    "bornOn": born.isoformat(), "gender": gender, "email": email, "phone": phone,
                    **({"document": doc} if doc else {})})
    if sorted(p["type"] for p in out) != sorted(types):
        raise ApiError("The passengers' ages don't match the adults/children/infants you searched for")
    return out


async def book(db: AsyncSession, user_id: uuid.UUID, *, offer_id: str, from_card_id: str,
               adults: int, children: int, infants: int, travellers: list[dict]) -> PurchaseTransaction:
    provider = fl.provider_for(offer_id)
    types = _passenger_types(adults, children, infants)
    offer = await provider.reprice(db, offer_id, passengers=types)  # inventory: locks the seats
    if offer.departing_at <= datetime.now(UTC):
        raise ApiError("This flight has already left")
    clean = validate_travellers(travellers, types=types, travel_day=offer.departing_at.date(),
                                international=is_international(offer.origin, offer.destination))

    try:
        card_uuid = uuid.UUID(from_card_id)
    except ValueError as e:
        raise ApiError("Card not found", status_code=404) from e
    card = (await db.execute(select(WalletCard).where(WalletCard.id == card_uuid, WalletCard.user_id == user_id)
                             .with_for_update())).scalar_one_or_none()
    if card is None:
        raise ApiError("Card not found", status_code=404)
    if card.blocked or card.flagged:
        raise ApiError("This wallet is restricted", status_code=403)
    if card.frozen:
        raise ApiError("This wallet is frozen", status_code=403)
    if card.currency != offer.currency:
        raise ApiError(f"This fare is in {offer.currency} — pay from a {offer.currency} wallet")
    total = offer.total_amount
    if card.balance < total:
        raise ApiError("Insufficient balance")

    booked = await provider.book(db, offer, clean)  # the airline confirms first; nothing is charged if it refuses

    meta = {
        "ticketType": "flight",
        "provider": provider.code,
        "providerOrderId": booked.provider_order_id,
        "bookingReference": booked.booking_reference,
        "ticketStatus": "confirmed",
        "airline": offer.airline_name,
        "airlineCode": offer.airline_code,
        "from": (airports.get(offer.origin).city if airports.get(offer.origin) else offer.origin),
        "to": (airports.get(offer.destination).city if airports.get(offer.destination) else offer.destination),
        "fromCode": offer.origin,
        "toCode": offer.destination,
        "departureAt": offer.departing_at.isoformat(),
        "arrivalAt": offer.arriving_at.isoformat(),
        "departure": offer.departing_at.strftime("%H:%M"),
        "arrival": offer.arriving_at.strftime("%H:%M"),
        "travelDate": offer.departing_at.strftime("%Y-%m-%d"),
        "duration": f"{offer.duration_minutes // 60}h {offer.duration_minutes % 60}m",
        "stops": offer.stops,
        "flightNumbers": [s.flight_number for s in offer.segments if s.flight_number],
        "segments": [{"flightNumber": s.flight_number, "carrier": s.carrier_name, "from": s.origin, "to": s.destination,
                      "departingAt": s.departing_at.isoformat(), "arrivingAt": s.arriving_at.isoformat()}
                     for s in offer.segments],
        "seatClass": offer.cabin.replace("_", " ").title(),
        "refundable": offer.refundable,
        "passengerCount": len(clean),
        # Ticket shows names only; documents stay off the purchase record.
        "passengers": [{"name": f"{p['givenName']} {p['familyName']}", "type": p["type"]} for p in clean],
        "departureId": offer.raw.get("departure_id"),
    }
    tx = await purchase_transaction_service.create_transaction(
        db, user_id, category=PurchaseCategory.TRAVEL.value, merchant_name=offer.airline_name,
        amount=f"{total:.2f}", currency=offer.currency, status=PurchaseStatus.SUCCESS.value, metadata=meta,
    )
    await posting.post(
        db, kind="flight_booking", description=f"Flight {booked.booking_reference} with {offer.airline_name}",
        legs=[
            posting.debit(await ledger_accounts.wallet_account(db, card), total),
            posting.credit(await _airline_payable(db, provider.code, offer.currency), total),
        ],
        details={"purchase_transaction_id": str(tx.id), "provider": provider.code,
                 "provider_order_id": booked.provider_order_id},
    )
    db.add(Transaction(user_id=user_id, card_id=card.id,
                       title=f"{offer.airline_name} · {offer.origin} → {offer.destination}",
                       category="travel", amount=total, type=TransactionType.DEBIT, icon="airplane"))
    await db.flush()
    await notification_service.create_notification(
        db, user_id, NotificationType.SUCCESS, "Flight booked",
        f"{offer.airline_name} {offer.origin} → {offer.destination} on {meta['travelDate']}. "
        f"Booking reference {booked.booking_reference}.",
        related_id=str(tx.id), related_type="purchase_transaction",
    )
    return tx


async def _airline_payable(db: AsyncSession, provider: str, currency: str):
    if provider == "inventory":  # same account the earlier ticketing used
        return await ledger_accounts.system_account(
            db, f"payable:travel_operators:{currency}", f"Owed to travel operators ({currency})", "liability", currency)
    return await ledger_accounts.system_account(
        db, f"payable:airlines:{provider}:{currency}", f"Owed to airlines via {provider} ({currency})",
        "liability", currency)


async def cancel(db: AsyncSession, user_id: uuid.UUID, purchase_transaction_id: str) -> PurchaseTransaction:
    tx = await purchase_transaction_service.get_transaction(db, purchase_transaction_id)
    if tx is None or tx.category != PurchaseCategory.TRAVEL.value:
        raise ApiError("Booking not found", status_code=404)
    if tx.user_id != user_id:
        raise ApiError("Access denied", status_code=403)
    if tx.status == PurchaseStatus.REFUNDED.value:
        raise ApiError("This booking has already been cancelled")
    meta = dict(tx.meta or {})
    provider_code = meta.get("provider")
    if not provider_code:  # bookings made before flight providers
        from app.services import travel_service

        return await travel_service.cancel_booking(db, user_id, purchase_transaction_id)
    if meta.get("refundable") is False:
        raise ApiError("This fare can't be cancelled for a refund. Contact the airline to change it.")
    if meta.get("departureAt") and datetime.fromisoformat(meta["departureAt"]) <= datetime.now(UTC):
        raise ApiError("This flight has already left — it can no longer be cancelled")

    provider = fl.provider_for(provider_code)
    airline_refund = await provider.cancel(db, meta["providerOrderId"], meta)
    full = Decimal(str(tx.amount))
    refund = full if airline_refund is None else min(full, airline_refund)

    card = (await db.execute(select(WalletCard).where(WalletCard.user_id == user_id,
                                                      WalletCard.currency == tx.currency)
                             .order_by(WalletCard.is_default.desc()).with_for_update())).scalars().first()
    if card is None:
        from app.services import wallet_service

        card = await wallet_service.get_or_create_currency_card(db, user_id, tx.currency)
    if refund > 0:
        await posting.post(
            db, kind="flight_refund", description=f"Refund of flight {meta.get('bookingReference')}",
            legs=[posting.debit(await _airline_payable(db, provider_code, tx.currency), refund),
                  posting.credit(await ledger_accounts.wallet_account(db, card), refund)],
            details={"purchase_transaction_id": str(tx.id), "provider": provider_code},
        )
        db.add(Transaction(user_id=user_id, card_id=card.id, title=f"Refund: {tx.merchant_name}",
                           category="travel", amount=refund, type=TransactionType.CREDIT, icon="refresh"))
    meta.update({"ticketStatus": "cancelled", "refundAmount": f"{refund:.2f}"})
    tx.meta = meta
    tx.status = PurchaseStatus.REFUNDED.value
    await db.flush()
    await notification_service.create_notification(
        db, user_id, NotificationType.INFO, "Flight cancelled",
        f"{tx.merchant_name} booking {meta.get('bookingReference')} cancelled — {tx.currency} {refund:.2f} refunded.",
        related_id=str(tx.id), related_type="purchase_transaction",
    )
    return tx
