"""Flights: buses are retired; flights come from every provider (here, the
inventory provider admins load), with airline-grade passenger checks,
seat locking, ledger-backed payment and refunds."""

from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient

from tests.conftest import TEST_PIN

pytestmark = pytest.mark.asyncio


async def _seed_flight(client: AsyncClient, admin: dict, *, origin="JNB", destination="CPT",
                       dest_country="ZA", price="450.00", seats=4) -> dict:
    r = await client.post("/api/admin/travel/operators", json={"name": "Test Air", "mode": "flight"},
                          headers=admin["headers"])
    assert r.status_code == 201, r.text
    operator = r.json()
    r = await client.post(f"/api/admin/travel/operators/{operator['id']}/routes", json={
        "originCode": origin.lower(), "originCity": "Johannesburg", "originCountryCode": "ZA",
        "destinationCode": destination, "destinationCity": "Somewhere", "destinationCountryCode": dest_country,
        "flightNumber": "TA101",
    }, headers=admin["headers"])
    assert r.status_code == 201, r.text
    route = r.json()
    dep_at = datetime.now(UTC) + timedelta(days=5)
    r = await client.post(f"/api/admin/travel/routes/{route['id']}/departures", json={
        "departureAt": dep_at.isoformat(), "arrivalAt": (dep_at + timedelta(hours=2, minutes=10)).isoformat(),
        "price": price, "currency": "ZAR", "totalSeats": seats,
    }, headers=admin["headers"])
    assert r.status_code == 201, r.text
    return {"route": route, "departure": r.json(), "day": dep_at.date().isoformat()}


def _traveller(given="Ama", born="1990-04-02", **extra) -> dict:
    return {"title": "ms", "givenName": given, "familyName": "Mensah", "bornOn": born, "gender": "f",
            "email": "ama@example.com", "phone": "+27821234567", **extra}


async def _search(client, user, seed, **params):
    r = await client.get("/api/travel/flights/search", params={
        "origin": "JNB", "destination": seed["route"]["destinationCode"], "date": seed["day"], **params,
    }, headers=user["headers"])
    assert r.status_code == 200, r.text
    return [o for o in r.json() if o["provider"] == "inventory" and seed["departure"]["id"] in o["id"]]


async def test_buses_are_retired(client: AsyncClient, admin: dict, user: dict):
    r = await client.post("/api/admin/travel/operators", json={"name": "Coach Co", "mode": "bus"},
                          headers=admin["headers"])
    assert r.status_code == 400
    r = await client.get("/api/travel/search", params={"mode": "bus"}, headers=user["headers"])
    assert r.status_code == 410


async def test_airport_search(client: AsyncClient, user: dict):
    r = await client.get("/api/travel/airports", params={"q": "nairobi"}, headers=user["headers"])
    assert r.status_code == 200
    assert r.json()[0]["iata"] == "NBO"


async def test_route_codes_must_be_airports(client: AsyncClient, admin: dict):
    r = await client.post("/api/admin/travel/operators", json={"name": "Code Air", "mode": "flight"},
                          headers=admin["headers"])
    op = r.json()
    r = await client.post(f"/api/admin/travel/operators/{op['id']}/routes", json={
        "originCode": "Johannesburg", "originCity": "Johannesburg", "originCountryCode": "ZA",
        "destinationCode": "CPT", "destinationCity": "Cape Town", "destinationCountryCode": "ZA",
    }, headers=admin["headers"])
    assert r.status_code == 400 and "IATA" in r.json()["error"]


async def test_search_book_and_cancel_a_flight(client: AsyncClient, admin: dict, funded_user: dict):
    seed = await _seed_flight(client, admin)
    offers = await _search(client, funded_user, seed, adults=2)
    assert len(offers) == 1
    offer = offers[0]
    assert offer["totalAmount"] == "900.00" and offer["seatsLeft"] == 4 and offer["stops"] == 0

    r = await client.post("/api/travel/flights/book", json={
        "pin": TEST_PIN, "offerId": offer["id"], "fromCardId": funded_user["card_id"], "adults": 2,
        "travellers": [_traveller(), _traveller(given="Kofi", born="1988-11-20", title="mr", gender="m")],
    }, headers=funded_user["headers"])
    assert r.status_code == 201, r.text
    booking = r.json()
    meta = booking["metadata"]
    assert booking["amount"] == "900.00" and meta["provider"] == "inventory"
    assert len(meta["bookingReference"]) == 6 and meta["fromCode"] == "JNB" and meta["toCode"] == "CPT"
    assert meta["passengers"][0] == {"name": "Ama Mensah", "type": "adult"}

    cards = (await client.get("/api/cards", headers=funded_user["headers"])).json()
    assert next(c for c in cards if c["id"] == funded_user["card_id"])["balance"] == "100.00"
    assert (await _search(client, funded_user, seed))[0]["seatsLeft"] == 2

    r = await client.post(f"/api/travel/flights/bookings/{booking['id']}/cancel", headers=funded_user["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded" and r.json()["metadata"]["ticketStatus"] == "cancelled"
    cards = (await client.get("/api/cards", headers=funded_user["headers"])).json()
    assert next(c for c in cards if c["id"] == funded_user["card_id"])["balance"] == "1000.00"
    assert (await _search(client, funded_user, seed))[0]["seatsLeft"] == 4


async def test_no_overbooking(client: AsyncClient, admin: dict, funded_user: dict):
    seed = await _seed_flight(client, admin, seats=2, price="100.00")
    assert await _search(client, funded_user, seed, adults=3) == []  # not offered
    offer = (await _search(client, funded_user, seed, adults=2))[0]
    r = await client.post("/api/travel/flights/book", json={
        "pin": TEST_PIN, "offerId": offer["id"], "fromCardId": funded_user["card_id"], "adults": 3,
        "travellers": [_traveller(), _traveller(), _traveller()],
    }, headers=funded_user["headers"])
    assert r.status_code == 409


async def test_passenger_details_are_checked(client: AsyncClient, admin: dict, funded_user: dict):
    seed = await _seed_flight(client, admin)
    offer = (await _search(client, funded_user, seed))[0]
    body = {"pin": TEST_PIN, "offerId": offer["id"], "fromCardId": funded_user["card_id"], "adults": 1}
    for bad in (_traveller(phone="0821234567"), _traveller(born="2020-01-01"), _traveller(title="")):
        r = await client.post("/api/travel/flights/book", json={**body, "travellers": [bad]},
                              headers=funded_user["headers"])
        assert r.status_code == 400, bad


async def test_international_flights_need_a_valid_passport(client: AsyncClient, admin: dict, funded_user: dict):
    seed = await _seed_flight(client, admin, destination="NBO", dest_country="KE")
    offer = (await _search(client, funded_user, seed))[0]
    body = {"pin": TEST_PIN, "offerId": offer["id"], "fromCardId": funded_user["card_id"], "adults": 1}
    r = await client.post("/api/travel/flights/book", json={**body, "travellers": [_traveller()]},
                          headers=funded_user["headers"])
    assert r.status_code == 400 and "passport" in r.json()["error"].lower()
    soon = (date.fromisoformat(seed["day"]) - timedelta(days=1)).isoformat()
    r = await client.post("/api/travel/flights/book", json={**body, "travellers": [_traveller(
        document={"number": "a1234567", "issuingCountry": "za", "expiresOn": soon})]},
        headers=funded_user["headers"])
    assert r.status_code == 400 and "expires" in r.json()["error"].lower()
    r = await client.post("/api/travel/flights/book", json={**body, "travellers": [_traveller(
        document={"number": "a1234567", "issuingCountry": "za", "expiresOn": "2034-01-01"})]},
        headers=funded_user["headers"])
    assert r.status_code == 201, r.text


async def test_wrong_pin_or_currency_is_refused(client: AsyncClient, admin: dict, funded_user: dict):
    seed = await _seed_flight(client, admin)
    offer = (await _search(client, funded_user, seed))[0]
    body = {"offerId": offer["id"], "fromCardId": funded_user["card_id"], "adults": 1, "travellers": [_traveller()]}
    r = await client.post("/api/travel/flights/book", json={**body, "pin": "0000"}, headers=funded_user["headers"])
    assert r.status_code in (401, 403)
    usd = (await client.post("/api/cards", json={"pin": TEST_PIN, "title": "USD", "currency": "USD"},
                             headers=funded_user["headers"])).json()["id"]
    r = await client.post("/api/travel/flights/book", json={**body, "pin": TEST_PIN, "fromCardId": usd},
                          headers=funded_user["headers"])
    assert r.status_code == 400 and "zar" in r.json()["error"].lower()


async def test_admin_travel_crud_requires_admin_auth(client: AsyncClient):
    r = await client.get("/api/admin/travel/operators")
    assert r.status_code == 401
