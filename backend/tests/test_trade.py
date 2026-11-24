"""Milestone 2: AfCFTA trade invoices, instant supplier payments, escrow
(fund → confirm / dispute → resolve), hash-chained receipts, and currency
swaps through the FX pools."""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.db.base import get_session_factory
from app.models.ledger import LedgerAccount
from app.models.wallet import CurrencyCorridor
from tests.conftest import TEST_PIN, fund_card, signup_business
from tests.test_ledger import assert_ledger_consistent

pytestmark = pytest.mark.asyncio


async def _balance(code: str) -> Decimal:
    async with get_session_factory()() as db:
        a = (await db.execute(select(LedgerAccount).where(LedgerAccount.code == code))).scalar_one_or_none()
        return a.balance if a else Decimal("0.00")


async def _supplier(client: AsyncClient) -> tuple[dict, str]:
    owner = await signup_business(client, "Gabs Wholesale")
    r = await client.post("/api/merchants", json={"businessName": "Gabs Wholesale", "businessType": "retail"},
                          headers=owner["headers"])
    mid = r.json()["id"]
    async with get_session_factory()() as db:
        await db.execute(text("UPDATE merchants SET kyb_status='approved' WHERE id=:id"), {"id": mid})
        await db.commit()
    return owner, mid


async def _invoice(client, owner, mid, *, currency="ZAR", mode="either", qty="10", price="45.50") -> dict:
    r = await client.post(f"/api/merchants/{mid}/trade-invoices", json={
        "buyerName": "N. Dlamini", "buyerCountry": "ZA", "currency": currency, "paymentMode": mode,
        "items": [{"description": "Maize meal 10kg", "quantity": qty, "unitPrice": price, "unit": "bag",
                   "hsCode": "1102.20", "originCountry": "BW"}],
        "taxTotal": "0",
    }, headers=owner["headers"])
    assert r.status_code == 201, r.text
    return r.json()


def _key() -> dict:
    return {"Idempotency-Key": uuid.uuid4().hex}


async def test_invoice_create_and_public_view(client: AsyncClient, user: dict):
    owner, mid = await _supplier(client)
    inv = await _invoice(client, owner, mid)
    assert inv["total"] == "455.00" and inv["items"][0]["lineTotal"] == "455.00"
    assert inv["payUrl"] == f"https://pay.bukkapay.com/t/{inv['reference']}"
    r = await client.get(f"/api/public/trade-invoices/{inv['reference']}")
    assert r.status_code == 200 and "buyerName" not in r.json() and r.json()["seller"]["verified"] is True
    # A personal account can't issue invoices (business route).
    r = await client.post(f"/api/merchants/{mid}/trade-invoices", json={"buyerName": "x", "currency": "ZAR",
                          "items": [{"description": "x", "quantity": "1", "unitPrice": "1"}]}, headers=user["headers"])
    assert r.status_code == 403


async def test_instant_pay_books_merchant_fee_and_receipt(client: AsyncClient, funded_user: dict):
    owner, mid = await _supplier(client)
    inv = await _invoice(client, owner, mid)
    fees_before = await _balance("revenue:merchant_fees:ZAR")
    r = await client.post(f"/api/trade/invoices/{inv['reference']}/pay", headers={**funded_user["headers"], **_key()},
                          json={"fromCardId": funded_user["card_id"], "pin": TEST_PIN, "mode": "instant"})
    assert r.status_code == 201, r.text
    assert r.json()["invoice"]["status"] == "paid"
    assert await _balance(f"merchant:{mid}:ZAR") == Decimal("450.45")  # 455 − 1.0%
    assert await _balance("revenue:merchant_fees:ZAR") - fees_before == Decimal("4.55")
    number = r.json()["receipt"]
    v = (await client.get(f"/api/public/trade-receipts/{number}/verify")).json()
    assert v["valid"] and v["hashIntact"] and v["chainLinked"]
    pdf = await client.get(f"/api/trade/receipts/{number}/pdf", headers=funded_user["headers"])
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    # Paying twice is refused.
    r = await client.post(f"/api/trade/invoices/{inv['reference']}/pay", headers={**funded_user["headers"], **_key()},
                          json={"fromCardId": funded_user["card_id"], "pin": TEST_PIN, "mode": "instant"})
    assert r.status_code == 409
    await assert_ledger_consistent()


async def test_escrow_fund_confirm_release(client: AsyncClient, funded_user: dict):
    owner, mid = await _supplier(client)
    inv = await _invoice(client, owner, mid, mode="escrow", qty="4", price="100")  # 400.00
    escrow_before = await _balance("escrow:trade:ZAR")
    key = _key()
    body = {"fromCardId": funded_user["card_id"], "pin": TEST_PIN, "mode": "escrow"}
    r = await client.post(f"/api/trade/invoices/{inv['reference']}/pay", headers={**funded_user["headers"], **key}, json=body)
    assert r.status_code == 201, r.text
    esc = r.json()["escrow"]
    assert esc["status"] == "funded" and esc["fee"] == "4.00" and esc["sellerReceives"] == "396.00"
    # Retried with the same key: same escrow, no second charge.
    again = await client.post(f"/api/trade/invoices/{inv['reference']}/pay", headers={**funded_user["headers"], **key}, json=body)
    assert again.status_code == 201 and again.json()["escrow"]["reference"] == esc["reference"]
    assert await _balance("escrow:trade:ZAR") - escrow_before == Decimal("400.00")
    assert await _balance(f"merchant:{mid}:ZAR") == Decimal("0.00")  # nothing for the seller yet

    r = await client.post(f"/api/trade/escrows/{esc['reference']}/confirm", headers=funded_user["headers"],
                          json={"pin": TEST_PIN})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "released"
    assert await _balance(f"merchant:{mid}:ZAR") == Decimal("396.00")
    assert await _balance("escrow:trade:ZAR") == escrow_before
    detail = (await client.get(f"/api/trade/escrows/{esc['reference']}", headers=funded_user["headers"])).json()
    assert [e["event"] for e in detail["events"]] == ["funded", "buyer_confirmed"]
    assert [x["kind"] for x in detail["receipts"]] == ["escrow_funded", "escrow_released"]
    await assert_ledger_consistent()


async def test_dispute_and_admin_refund(client: AsyncClient, funded_user: dict, admin: dict):
    owner, mid = await _supplier(client)
    inv = await _invoice(client, owner, mid, mode="escrow", qty="1", price="250")
    r = await client.post(f"/api/trade/invoices/{inv['reference']}/pay", headers={**funded_user["headers"], **_key()},
                          json={"fromCardId": funded_user["card_id"], "pin": TEST_PIN, "mode": "escrow"})
    ref = r.json()["escrow"]["reference"]
    r = await client.post(f"/api/trade/escrows/{ref}/dispute", headers=funded_user["headers"],
                          json={"reason": "Goods never arrived at the border post"})
    assert r.status_code == 200 and r.json()["status"] == "disputed"
    # A disputed escrow can't be confirmed by the buyer any more.
    r = await client.post(f"/api/trade/escrows/{ref}/confirm", headers=funded_user["headers"], json={"pin": TEST_PIN})
    assert r.status_code == 409
    desk = (await client.get("/api/admin/trade/escrows", params={"status": "disputed"}, headers=admin["headers"])).json()
    assert any(e["reference"] == ref for e in desk["escrows"])
    before = (await client.get("/api/cards", headers=funded_user["headers"])).json()
    bal_before = Decimal(next(c for c in before if c["id"] == funded_user["card_id"])["balance"])
    r = await client.post(f"/api/admin/trade/escrows/{ref}/resolve", headers=admin["headers"],
                          json={"outcome": "refund", "note": "Courier confirmed loss in transit"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded" and r.json()["events"][-1]["event"] == "resolved_refund"
    after = (await client.get("/api/cards", headers=funded_user["headers"])).json()
    assert Decimal(next(c for c in after if c["id"] == funded_user["card_id"])["balance"]) == bal_before + Decimal("250.00")
    await assert_ledger_consistent()


async def _rate(src: str, dst: str, rate: str, spread_pct: str = "1.00"):
    async with get_session_factory()() as db:
        await db.execute(text("DELETE FROM currency_corridors WHERE from_currency = :f AND to_currency = :t"),
                         {"f": src, "t": dst})
        db.add(CurrencyCorridor(from_currency=src, to_currency=dst, exchange_rate=Decimal(rate),
                                fee_percentage=Decimal(spread_pct), fee_fixed=Decimal("0"), min_amount=Decimal("1"),
                                max_amount=Decimal("100000"), is_active=True))
        await db.commit()


async def test_swap_through_fx_pools(client: AsyncClient, funded_user: dict):
    await _rate("ZAR", "BWP", "0.735000")
    q = (await client.get("/api/swap/quote", params={"from": "ZAR", "to": "BWP", "amount": "100.00"},
                          headers=funded_user["headers"])).json()
    assert q["receive"] == "72.76" and q["spread"] == "0.74"  # 73.50 gross, 1% spread
    fx_rev = await _balance("revenue:fx:BWP")
    r = await client.post("/api/swap", headers={**funded_user["headers"], **_key()}, json={
        "fromCardId": funded_user["card_id"], "toCurrency": "BWP", "amount": "100.00", "expectedReceive": "72.76",
        "pin": TEST_PIN})
    assert r.status_code == 201, r.text
    assert await _balance("revenue:fx:BWP") - fx_rev == Decimal("0.74")
    # Price protection: an outdated expectation is refused.
    r = await client.post("/api/swap", headers={**funded_user["headers"], **_key()}, json={
        "fromCardId": funded_user["card_id"], "toCurrency": "BWP", "amount": "100.00", "expectedReceive": "80.00",
        "pin": TEST_PIN})
    assert r.status_code == 409
    # No Idempotency-Key, no money movement.
    r = await client.post("/api/swap", headers=funded_user["headers"], json={
        "fromCardId": funded_user["card_id"], "toCurrency": "BWP", "amount": "1.00", "pin": TEST_PIN})
    assert r.status_code == 400
    await assert_ledger_consistent()


async def test_pay_bwp_invoice_from_zar_wallet(client: AsyncClient, user: dict):
    await _rate("ZAR", "BWP", "0.735000", "1.00")
    cards = (await client.get("/api/cards", headers=user["headers"])).json()
    await fund_card(cards[0]["id"], "1000.00")
    owner, mid = await _supplier(client)
    inv = await _invoice(client, owner, mid, currency="BWP", mode="escrow", qty="1", price="200")
    r = await client.post(f"/api/trade/invoices/{inv['reference']}/pay", headers={**user["headers"], **_key()},
                          json={"fromCardId": cards[0]["id"], "pin": TEST_PIN, "mode": "escrow"})
    assert r.status_code == 201, r.text
    paid = r.json()["escrow"]["paidFrom"]
    assert paid["currency"] == "ZAR" and Decimal(paid["amount"]) == Decimal("274.88")  # 200/0.99 → 202.03 BWP gross → /0.735, rounded up
    await assert_ledger_consistent()


async def test_trade_report_csv(client: AsyncClient, admin: dict):
    owner, mid = await _supplier(client)
    inv = await _invoice(client, owner, mid, qty="3", price="12.50")
    r = await client.get("/api/admin/trade/report.csv", headers=admin["headers"])
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("invoice,status,created_at")
    assert any(inv["reference"] in ln and "37.50" in ln for ln in lines[1:])
    assert (await client.get("/api/admin/trade/report.csv", params={"from": "nope"}, headers=admin["headers"])).status_code == 400


async def test_fx_desk_edits_are_guarded_and_audited(client: AsyncClient, admin: dict):
    await _rate("ZAR", "BWP", "0.735000")
    desk = (await client.get("/api/admin/fx/desk", headers=admin["headers"])).json()
    pair = next(p for p in desk["pairs"] if p["from"] == "ZAR" and p["to"] == "BWP")
    rate = Decimal(pair["rate"])
    # A >10% jump is refused unless confirmed.
    r = await client.patch(f"/api/admin/fx/pairs/{pair['id']}", headers=admin["headers"], json={"rate": str(rate * 2)})
    assert r.status_code == 400
    r = await client.patch(f"/api/admin/fx/pairs/{pair['id']}", headers=admin["headers"], json={"spreadPct": "9"})
    assert r.status_code == 400
    r = await client.patch(f"/api/admin/fx/pairs/{pair['id']}", headers=admin["headers"],
                           json={"rate": str((rate * Decimal("1.01")).quantize(Decimal("0.000001"))), "spreadPct": "1.25", "reason": "test"})
    assert r.status_code == 200 and r.json()["spreadPct"] == "1.25"
    audit = (await client.get("/api/admin/audit", params={"action": "fx.pair.update"}, headers=admin["headers"])).json()
    assert audit
