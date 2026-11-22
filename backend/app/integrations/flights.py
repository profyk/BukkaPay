"""Flight sources behind one interface.

Every source (our own inventory, airline aggregators, airline NDC APIs)
implements `FlightProvider`: search -> offers, price an offer again just
before paying, book it, cancel it. `flight_service` merges results from all
configured providers and moves the money; providers never touch wallets.

Providers
- `inventory`: flights BukkaPay's admins load (Admin → Travel). Always on.
- `duffel`: Duffel (https://duffel.com), one API for 300+ airlines incl. NDC.
  On when DUFFEL_ACCESS_TOKEN is set. Bookings are paid from BukkaPay's
  Duffel balance; the customer's wallet is debited by flight_service.

Add an airline API by subclassing FlightProvider and registering it in
`configured_providers()`.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError

CABINS = ("economy", "premium_economy", "business", "first")
PASSENGER_TYPES = ("adult", "child", "infant_without_seat")


@dataclass
class Segment:
    carrier_code: str
    carrier_name: str
    flight_number: str
    origin: str
    destination: str
    departing_at: datetime
    arriving_at: datetime


@dataclass
class FlightOffer:
    id: str  # "<provider>:<provider offer id>"
    provider: str
    airline_name: str
    airline_code: str | None
    origin: str
    destination: str
    departing_at: datetime
    arriving_at: datetime
    duration_minutes: int
    stops: int
    cabin: str
    total_amount: Decimal
    currency: str
    passengers: int
    segments: list[Segment] = field(default_factory=list)
    seats_left: int | None = None
    refundable: bool | None = None
    expires_at: datetime | None = None
    # Provider-specific data needed to book (e.g. airline passenger ids).
    raw: dict = field(default_factory=dict)


@dataclass
class Booked:
    provider_order_id: str
    booking_reference: str
    raw: dict = field(default_factory=dict)


class FlightProvider:
    code = "base"

    async def search(self, db: AsyncSession, *, origin: str, destination: str, day: date,
                     passengers: list[str], cabin: str) -> list[FlightOffer]:
        raise NotImplementedError

    async def reprice(self, db: AsyncSession, offer_id: str, *, passengers: list[str]) -> FlightOffer:
        raise NotImplementedError

    async def book(self, db: AsyncSession, offer: FlightOffer, travellers: list[dict]) -> Booked:
        raise NotImplementedError

    async def cancel(self, db: AsyncSession, order_id: str, raw: dict) -> Decimal | None:
        """Cancel with the airline; returns the amount the airline refunds
        (None = the full fare)."""
        raise NotImplementedError


# ─── Our own inventory ─────────────────────────────────────────────────────


class InventoryProvider(FlightProvider):
    """Flights loaded by BukkaPay admins (travel operators/routes/departures)."""

    code = "inventory"

    async def _rows(self, db: AsyncSession, *, departure_id: uuid.UUID | None = None, origin=None,
                    destination=None, day: date | None = None, lock: bool = False):
        from app.models.travel import TravelDeparture, TravelOperator, TravelRoute

        stmt = (
            select(TravelDeparture, TravelRoute, TravelOperator)
            .join(TravelRoute, TravelDeparture.route_id == TravelRoute.id)
            .join(TravelOperator, TravelRoute.operator_id == TravelOperator.id)
            .where(TravelRoute.mode == "flight", TravelDeparture.is_active.is_(True),
                   TravelRoute.is_active.is_(True), TravelOperator.is_active.is_(True))
        )
        if departure_id is not None:
            stmt = stmt.where(TravelDeparture.id == departure_id)
        if origin:
            stmt = stmt.where(TravelRoute.origin_code == origin)
        if destination:
            stmt = stmt.where(TravelRoute.destination_code == destination)
        if day is not None:
            start = datetime(day.year, day.month, day.day, tzinfo=UTC)
            stmt = stmt.where(TravelDeparture.departure_at >= start,
                              TravelDeparture.departure_at < start + timedelta(days=1))
        stmt = stmt.where(TravelDeparture.departure_at > datetime.now(UTC))
        if lock:
            stmt = stmt.with_for_update(of=TravelDeparture)
        return (await db.execute(stmt.order_by(TravelDeparture.departure_at))).all()

    def _offer(self, dep, route, operator, cabin: str, passengers: int) -> FlightOffer | None:
        if cabin == "business":
            unit = dep.business_price
        elif cabin == "economy":
            unit = dep.price
        else:
            return None
        if unit is None:
            return None
        left = dep.total_seats - dep.seats_booked
        if left < passengers:
            return None
        carrier = (route.flight_number or "")[:2].upper() or None
        seg = Segment(carrier_code=carrier or "", carrier_name=operator.name, flight_number=route.flight_number or "",
                      origin=route.origin_code, destination=route.destination_code,
                      departing_at=dep.departure_at, arriving_at=dep.arrival_at)
        return FlightOffer(
            id=f"inventory:{dep.id}:{cabin}", provider=self.code, airline_name=operator.name, airline_code=carrier,
            origin=route.origin_code, destination=route.destination_code,
            departing_at=dep.departure_at, arriving_at=dep.arrival_at,
            duration_minutes=int((dep.arrival_at - dep.departure_at).total_seconds() // 60), stops=0,
            cabin=cabin, total_amount=(Decimal(unit) * passengers).quantize(Decimal("0.01")),
            currency=dep.currency, passengers=passengers, segments=[seg], seats_left=left, refundable=True,
            raw={"departure_id": str(dep.id), "unit_price": str(unit)},
        )

    async def search(self, db, *, origin, destination, day, passengers, cabin):
        rows = await self._rows(db, origin=origin, destination=destination, day=day)
        offers = [self._offer(d, r, o, cabin, len(passengers)) for d, r, o in rows]
        return [x for x in offers if x is not None]

    async def reprice(self, db, offer_id, *, passengers):
        try:
            _, dep_id, cabin = offer_id.split(":")
            dep_uuid = uuid.UUID(dep_id)
        except ValueError as e:
            raise ApiError("Flight not found", status_code=404) from e
        rows = await self._rows(db, departure_id=dep_uuid, lock=True)  # locks the seats
        if not rows:
            raise ApiError("This flight is no longer available", status_code=410)
        offer = self._offer(*rows[0], cabin, len(passengers))
        if offer is None:
            raise ApiError("Not enough seats left on this flight in that cabin", status_code=409)
        return offer

    async def book(self, db, offer, travellers):
        from app.models.travel import TravelDeparture

        dep = await db.get(TravelDeparture, uuid.UUID(offer.raw["departure_id"]))  # locked by reprice
        dep.seats_booked += len(travellers)
        await db.flush()
        return Booked(provider_order_id=str(dep.id), booking_reference=_reference())

    async def cancel(self, db, order_id, raw):
        from app.models.travel import TravelDeparture

        dep = (await db.execute(select(TravelDeparture).where(TravelDeparture.id == uuid.UUID(order_id))
                                .with_for_update())).scalar_one_or_none()
        if dep is not None:
            if dep.departure_at <= datetime.now(UTC):
                raise ApiError("This flight has already left — it can no longer be cancelled")
            dep.seats_booked = max(0, dep.seats_booked - int(raw.get("passengerCount", 1)))
        return None


def _reference() -> str:
    import secrets

    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
    return "".join(secrets.choice(alphabet) for _ in range(6))


# ─── Duffel (airline aggregator, NDC) ──────────────────────────────────────


def _minutes(iso: str | None) -> int:
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?", iso or "")
    if not m:
        return 0
    d, h, mi = (int(x or 0) for x in m.groups())
    return d * 1440 + h * 60 + mi


def _dt(s: str) -> datetime:
    v = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return v if v.tzinfo else v.replace(tzinfo=UTC)


class DuffelProvider(FlightProvider):
    code = "duffel"
    base_url = "https://api.duffel.com"

    def __init__(self, token: str):
        self._token = token

    async def _call(self, method: str, path: str, body: dict | None = None, params: dict | None = None) -> dict:
        headers = {"Authorization": f"Bearer {self._token}", "Duffel-Version": "v2",
                   "Accept": "application/json", "Content-Type": "application/json"}
        async with httpx.AsyncClient(base_url=self.base_url, timeout=40.0) as client:
            r = await client.request(method, path, json=body, params=params, headers=headers)
        if r.status_code >= 400:
            try:
                err = r.json()["errors"][0]
                msg = err.get("message") or err.get("title")
            except Exception:
                msg = None
            raise ApiError(f"The airline couldn't complete this: {msg or 'please try another flight'}",
                           status_code=502 if r.status_code >= 500 else 409)
        return r.json().get("data") or {}

    def _offer(self, o: dict, cabin: str) -> FlightOffer:
        sl = o["slices"][0]
        segs = [Segment(
            carrier_code=(s.get("marketing_carrier") or {}).get("iata_code") or "",
            carrier_name=(s.get("marketing_carrier") or {}).get("name") or "",
            flight_number=f"{(s.get('marketing_carrier') or {}).get('iata_code') or ''}"
                          f"{s.get('marketing_carrier_flight_number') or ''}",
            origin=s["origin"]["iata_code"], destination=s["destination"]["iata_code"],
            departing_at=_dt(s["departing_at"]), arriving_at=_dt(s["arriving_at"]),
        ) for s in sl["segments"]]
        refund = ((o.get("conditions") or {}).get("refund_before_departure") or {}).get("allowed")
        return FlightOffer(
            id=f"duffel:{o['id']}", provider=self.code,
            airline_name=(o.get("owner") or {}).get("name") or (segs[0].carrier_name if segs else "Airline"),
            airline_code=(o.get("owner") or {}).get("iata_code"),
            origin=sl["origin"]["iata_code"], destination=sl["destination"]["iata_code"],
            departing_at=segs[0].departing_at, arriving_at=segs[-1].arriving_at,
            duration_minutes=_minutes(sl.get("duration")) or int(
                (segs[-1].arriving_at - segs[0].departing_at).total_seconds() // 60),
            stops=max(0, len(segs) - 1), cabin=cabin,
            total_amount=Decimal(o["total_amount"]), currency=o["total_currency"],
            passengers=len(o.get("passengers") or []), segments=segs, refundable=refund,
            expires_at=_dt(o["expires_at"]) if o.get("expires_at") else None,
            raw={"offer_id": o["id"], "passenger_ids": [p["id"] for p in o.get("passengers") or []],
                 "amount": o["total_amount"]},
        )

    async def search(self, db, *, origin, destination, day, passengers, cabin):
        data = await self._call("POST", "/air/offer_requests", params={"return_offers": "true",
                                                                        "supplier_timeout": "20000"},
                                body={"data": {
                                    "slices": [{"origin": origin, "destination": destination,
                                                "departure_date": day.isoformat()}],
                                    "passengers": [{"type": t} for t in passengers],
                                    "cabin_class": cabin,
                                }})
        offers = []
        for o in (data.get("offers") or [])[:50]:
            try:
                offers.append(self._offer(o, cabin))
            except (KeyError, IndexError, ValueError):
                continue  # skip malformed offers rather than fail the search
        return offers

    async def reprice(self, db, offer_id, *, passengers):
        raw_id = offer_id.split(":", 1)[1]
        data = await self._call("GET", f"/air/offers/{raw_id}", params={"return_available_services": "false"})
        offer = self._offer(data, data.get("cabin_class") or "economy")
        if offer.expires_at and offer.expires_at <= datetime.now(UTC):
            raise ApiError("This fare has expired — search again for the latest price", status_code=410)
        return offer

    async def book(self, db, offer, travellers):
        pax_ids = offer.raw.get("passenger_ids") or []
        if len(pax_ids) != len(travellers):
            raise ApiError("Passenger count doesn't match the fare — search again", status_code=409)
        passengers = []
        for pid, t in zip(pax_ids, travellers, strict=True):
            p = {"id": pid, "title": t["title"], "given_name": t["givenName"], "family_name": t["familyName"],
                 "born_on": t["bornOn"], "gender": t["gender"], "email": t["email"], "phone_number": t["phone"]}
            doc = t.get("document")
            if doc:
                p["identity_documents"] = [{"type": "passport", "unique_identifier": doc["number"],
                                            "issuing_country_code": doc["issuingCountry"],
                                            "expires_on": doc["expiresOn"]}]
            passengers.append(p)
        data = await self._call("POST", "/air/orders", body={"data": {
            "type": "instant", "selected_offers": [offer.raw["offer_id"]], "passengers": passengers,
            "payments": [{"type": "balance", "currency": offer.currency, "amount": offer.raw["amount"]}],
        }})
        return Booked(provider_order_id=data["id"], booking_reference=data.get("booking_reference") or "",
                      raw={"order_id": data["id"]})

    async def cancel(self, db, order_id, raw):
        c = await self._call("POST", "/air/order_cancellations", body={"data": {"order_id": order_id}})
        done = await self._call("POST", f"/air/order_cancellations/{c['id']}/actions/confirm")
        amount = done.get("refund_amount") or c.get("refund_amount")
        return Decimal(amount) if amount is not None else Decimal("0.00")


def configured_providers() -> list[FlightProvider]:
    providers: list[FlightProvider] = [InventoryProvider()]
    token = get_settings().duffel_access_token
    if token:
        providers.append(DuffelProvider(token))
    return providers


def provider_for(offer_or_code: str) -> FlightProvider:
    code = offer_or_code.split(":", 1)[0]
    for p in configured_providers():
        if p.code == code:
            return p
    raise ApiError("This flight source isn't available right now", status_code=410)
