import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_quote_cross_currency(client: AsyncClient, user: dict):
    r = await client.post("/api/transfer/quote", json={
        "fromCurrency": "ZAR", "toCurrency": "BWP", "amount": "100.00",
    }, headers=user["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sourceAmount"] == "100.00"
    assert body["exchangeRate"] == "0.741758"
    assert body["fee"] == "1.00"
    assert body["destinationAmount"] == "73.43"
    assert body["destinationCurrency"] == "BWP"


async def test_quote_below_corridor_minimum(client: AsyncClient, user: dict):
    r = await client.post("/api/transfer/quote", json={
        "fromCurrency": "ZAR", "toCurrency": "BWP", "amount": "5.00",
    }, headers=user["headers"])
    assert r.status_code == 400
    assert "minimum" in r.json()["error"].lower()


async def test_international_transfer_cross_currency_happy_path(
    client: AsyncClient, funded_user: dict, other_user: dict
):
    r = await client.post("/api/transfer/international", json={
        "fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["walletId"],
        "toCurrency": "BWP", "amount": "100.00",
    }, headers=funded_user["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sourceAmount"] == "100.00"
    assert body["sourceCurrency"] == "ZAR"
    assert body["fee"] == "1.00"
    assert body["exchangeRate"] == "0.741758"
    assert body["destinationAmount"] == "73.43"
    assert body["destinationCurrency"] == "BWP"
    assert body["newBalance"] == "900.00"

    r = await client.get("/api/cards", headers=other_user["headers"])
    cards = r.json()
    assert len(cards) == 2  # default ZAR card + auto-issued BWP wallet
    bwp_card = next(c for c in cards if c["currency"] == "BWP")
    assert bwp_card["balance"] == "73.43"


async def test_international_transfer_same_currency_has_no_fee(
    client: AsyncClient, funded_user: dict, other_user: dict
):
    r = await client.post("/api/transfer/international", json={
        "fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["walletId"],
        "toCurrency": "ZAR", "amount": "50.00",
    }, headers=funded_user["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fee"] == "0.00"
    assert body["exchangeRate"] == "1.000000"
    assert body["destinationAmount"] == "50.00"
    assert body["newBalance"] == "950.00"

    r = await client.get("/api/cards", headers=other_user["headers"])
    cards = r.json()
    assert len(cards) == 1  # credited straight to the existing default ZAR card
    assert cards[0]["balance"] == "50.00"


async def test_international_transfer_insufficient_balance(client: AsyncClient, user: dict, other_user: dict):
    r = await client.get("/api/cards", headers=user["headers"])
    card_id = r.json()[0]["id"]

    r = await client.post("/api/transfer/international", json={
        "fromCardId": card_id, "toUserId": other_user["user"]["walletId"],
        "toCurrency": "BWP", "amount": "100.00",
    }, headers=user["headers"])
    assert r.status_code == 400
    assert "insufficient" in r.json()["error"].lower()


async def test_admin_corridors_list_and_update(client: AsyncClient, admin: dict):
    r = await client.get("/api/admin/corridors", headers=admin["headers"])
    assert r.status_code == 200, r.text
    corridors = r.json()["corridors"]
    assert len(corridors) == 6
    zar_to_bwp = next(c for c in corridors if c["fromCurrency"] == "ZAR" and c["toCurrency"] == "BWP")

    r = await client.patch(f"/api/admin/corridors/{zar_to_bwp['id']}", json={
        "exchangeRate": "0.800000",
    }, headers=admin["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["exchangeRate"] == "0.800000"


async def test_admin_corridors_requires_super_admin_for_writes(client: AsyncClient, admin: dict):
    r = await client.get("/api/admin/corridors", headers=admin["headers"])
    corridor_id = r.json()["corridors"][0]["id"]

    r = await client.patch(f"/api/admin/corridors/{corridor_id}", json={"isActive": False})
    assert r.status_code == 401
