"""Weekly cross-border bulk settlement: net the book pools into a run,
treasury records the bank transfer, a second admin approves the booking,
the pools square up and the run closes."""

from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.db.base import get_session_factory
from app.ledger import accounts, chart, posting
from app.network import settlement
from tests.test_ledger import assert_ledger_consistent
from tests.test_network import named_admin
from tests.test_trade import _balance, _rate

pytestmark = pytest.mark.asyncio


async def _book_transfer(zar_in: str, bwp_out: str) -> None:
    """What book transfers leave behind: the ZA pool took ZAR in, the BW pool paid BWP out."""
    async with get_session_factory()() as db:
        await posting.post(db, kind="test_book", description="book transfer effect", legs=[
            posting.debit(await chart.sys_account(db, "SYS_SAFEGUARD", "ZAR"), Decimal(zar_in)),
            posting.credit(await accounts.provider_clearing(db, "book", "ZAR"), Decimal(zar_in)),
            posting.debit(await accounts.provider_clearing(db, "book", "BWP"), Decimal(bwp_out)),
            posting.credit(await accounts.provider_clearing(db, "test", "BWP"), Decimal(bwp_out)),
        ])
        # The BW custodian holds cash to receive the settlement into.
        await posting.post(db, kind="test_funding", description="BW safeguarded cash", legs=[
            posting.debit(await chart.sys_account(db, "SYS_SAFEGUARD", "BWP"), Decimal(bwp_out)),
            posting.credit(await accounts.provider_clearing(db, "test", "BWP"), Decimal(bwp_out)),
        ])
        await db.commit()


async def test_weekly_settlement_run(client: AsyncClient, admin: dict):
    await _rate("ZAR", "USD", "0.055")
    await _rate("BWP", "USD", "0.074")
    await _rate("ZAR", "BWP", "0.735")
    treasury_admin = await named_admin(client, admin, "treasury_manager")
    finance = await named_admin(client, admin, "finance_admin")
    # Clear any open run left by other tests.
    for run in (await client.get("/api/admin/settlements", headers=admin["headers"])).json()["runs"]:
        if run["status"] in ("proposed", "in_progress"):
            await client.post(f"/api/admin/settlements/{run['id']}/cancel", headers=admin["headers"])

    zar_before, bwp_before = await _balance("clearing:book:ZAR"), await _balance("clearing:book:BWP")
    await _book_transfer("10000.00", "7350.00")

    # The weekly job builds the run.
    async with get_session_factory()() as db:
        batch = await settlement.generate(db, actor="system:weekly")
        await db.commit()
    assert batch is not None and batch.status == "proposed"
    runs = (await client.get("/api/admin/settlements", headers=treasury_admin["headers"])).json()
    run = next(r for r in runs["runs"] if r["id"] == str(batch.id))
    line = next(ln for ln in run["lines"] if ln["fromCurrency"] == "ZAR" and ln["toCurrency"] == "BWP")
    assert Decimal(line["fromAmount"]) > 0 and line["status"] == "pending"

    csv = await client.get(f"/api/admin/settlements/{batch.id}/instructions.csv", headers=treasury_admin["headers"])
    assert csv.status_code == 200 and "ZAR" in csv.text

    # Can't build another while this one is untouched? It's replaced. Once in progress, it's locked.
    sent = Decimal(line["fromAmount"])
    received = (sent * Decimal("0.735")).quantize(Decimal("0.01"))
    r = await client.post(f"/api/admin/settlement-lines/{line['id']}/sent", headers=treasury_admin["headers"],
                          json={"bankReference": "RTGS-777", "sentAmount": str(sent), "receivedAmount": str(received)})
    assert r.status_code == 200, r.text
    approval_id = r.json()["approvalId"]
    assert (await client.post("/api/admin/settlements/run", headers=treasury_admin["headers"])).status_code == 409
    # Same admin can't approve; another can.
    own = await client.post(f"/api/admin/approvals/{approval_id}/decide", json={"approve": True},
                            headers=treasury_admin["headers"])
    assert own.status_code == 403
    done = await client.post(f"/api/admin/approvals/{approval_id}/decide", json={"approve": True},
                             headers=finance["headers"])
    assert done.json()["status"] == "executed", done.text

    runs = (await client.get("/api/admin/settlements", headers=treasury_admin["headers"])).json()
    run = next(r for r in runs["runs"] if r["id"] == str(batch.id))
    settled = next(ln for ln in run["lines"] if ln["id"] == line["id"])
    assert settled["status"] == "settled" and settled["journalReference"]
    # Pools moved toward zero by exactly what was booked.
    assert await _balance("clearing:book:ZAR") == zar_before - Decimal("10000.00") + sent
    assert await _balance("clearing:book:BWP") == bwp_before + Decimal("7350.00") - received
    if all(ln["status"] in ("settled", "cancelled") for ln in run["lines"]):
        assert run["status"] == "settled"
    else:
        for ln in run["lines"]:
            if ln["status"] == "pending":
                await client.post(f"/api/admin/settlement-lines/{ln['id']}/cancel", headers=treasury_admin["headers"])
    await assert_ledger_consistent()
