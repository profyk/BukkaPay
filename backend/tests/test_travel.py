from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _seed_bus_departure(client: AsyncClient, admin: dict) -> dict:
    r = await client.post("/api/admin/travel/operators", json={
        "name": "Test Coach Lines", "mode": "bus",
    }, headers=admin["headers"])
    assert r.status_code == 201, r.text
    operator = r.json()

    r = await client.post(f"/api/admin/travel/operators/{operator['id']}/routes", json={
        "originCode": "Johannesburg", "originCity": "Johannesburg", "originCountryCode": "ZA",
        "destinationCode": "Cape Town", "destinationCity": "Cape Town", "destinationCountryCode": "ZA",
    }, headers=admin["headers"])
    assert r.status_code == 201, r.text
    route = r.json()

    departure_at = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    arrival_at = (datetime.now(UTC) + timedelta(days=3, hours=9)).isoformat()
    r = await client.post(f"/api/admin/travel/routes/{route['id']}/departures", json={
        "departureAt": departure_at, "arrivalAt": arrival_at,
        "price": "500.00", "currency": "ZAR", "totalSeats": 4,
    }, headers=admin["headers"])
    assert r.status_code == 201, r.text
    return {"operator": operator, "route": route, "departure": r.json()}


async def test_search_departures(client: AsyncClient, admin: dict, user: dict):
    seed = await _seed_bus_departure(client, admin)

    r = await client.get("/api/travel/search", params={"mode": "bus"}, headers=user["headers"])
    assert r.status_code == 200, r.text
    results = r.json()
    match = next((x for x in results if x["departureId"] == seed["departure"]["id"]), None)
    assert match is not None
    assert match["operatorName"] == "Test Coach Lines"
    assert match["seatsAvailable"] == 4
    assert match["price"] == "500.00"


async def test_book_travel_creates_purchase_transaction_and_debits_wallet(
    client: AsyncClient, admin: dict, funded_user: dict
):
    seed = await _seed_bus_departure(client, admin)

    r = await client.post("/api/travel/book", json={
        "departureId": seed["departure"]["id"],
        "fromCardId": funded_user["card_id"],
        "seatClass": "standard",
        "passengers": [{"name": "Jane Doe", "idNumber": "8001015800083"}, {"name": "John Doe"}],
    }, headers=funded_user["headers"])
    assert r.status_code == 201, r.text
    booking = r.json()
    assert booking["category"] == "travel"
    assert booking["amount"] == "1000.00"  # 2 passengers x R500
    assert booking["merchantName"] == "Test Coach Lines"
    meta = booking["metadata"]
    assert meta["ticketType"] == "bus"
    assert meta["operator"] == "Test Coach Lines"
    assert meta["from"] == "Johannesburg"
    assert meta["to"] == "Cape Town"
    assert meta["passengerCount"] == 2
    assert meta["passengers"][0]["idNumber"] == "8001015800083"
    assert meta["passengers"][1].get("idNumber") is None

    r = await client.get("/api/cards", headers=funded_user["headers"])
    card = next(c for c in r.json() if c["id"] == funded_user["card_id"])
    assert card["balance"] == "0.00"  # 1000 funded - 1000 fare

    r = await client.get(f"/api/travel/departures/{seed['departure']['id']}", headers=funded_user["headers"])
    assert r.json()["seatsAvailable"] == 2


async def test_book_travel_rejects_wrong_currency_card(client: AsyncClient, admin: dict, funded_user: dict):
    seed = await _seed_bus_departure(client, admin)
    r = await client.post("/api/cards", json={"title": "USD Wallet", "currency": "USD"}, headers=funded_user["headers"])
    usd_card_id = r.json()["id"]

    r = await client.post("/api/travel/book", json={
        "departureId": seed["departure"]["id"], "fromCardId": usd_card_id,
        "passengers": [{"name": "Solo Traveler"}],
    }, headers=funded_user["headers"])
    assert r.status_code == 400
    assert "zar" in r.json()["error"].lower()


async def test_book_travel_rejects_overbooking(client: AsyncClient, admin: dict, funded_user: dict):
    seed = await _seed_bus_departure(client, admin)  # 4 seats total

    r = await client.post("/api/travel/book", json={
        "departureId": seed["departure"]["id"], "fromCardId": funded_user["card_id"],
        "passengers": [{"name": f"Passenger {i}"} for i in range(5)],
    }, headers=funded_user["headers"])
    assert r.status_code == 400
    assert "seat" in r.json()["error"].lower()


async def test_cancel_booking_refunds_wallet_and_frees_seats(client: AsyncClient, admin: dict, funded_user: dict):
    seed = await _seed_bus_departure(client, admin)

    r = await client.post("/api/travel/book", json={
        "departureId": seed["departure"]["id"], "fromCardId": funded_user["card_id"],
        "passengers": [{"name": "Solo Traveler"}],
    }, headers=funded_user["headers"])
    booking_id = r.json()["id"]

    r = await client.post(f"/api/travel/bookings/{booking_id}/cancel", headers=funded_user["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded"

    r = await client.get("/api/cards", headers=funded_user["headers"])
    card = next(c for c in r.json() if c["id"] == funded_user["card_id"])
    assert card["balance"] == "1000.00"  # fully refunded

    r = await client.get(f"/api/travel/departures/{seed['departure']['id']}", headers=funded_user["headers"])
    assert r.json()["seatsAvailable"] == 4


async def test_admin_travel_crud_requires_admin_auth(client: AsyncClient):
    r = await client.get("/api/admin/travel/operators")
    assert r.status_code == 401
