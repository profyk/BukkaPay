"""Customer-set spending limits: enforced on payments, lowering is instant,
raising waits 24 hours."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.models.user import User
from app.network import limits
from tests.conftest import TEST_PIN

pytestmark = pytest.mark.asyncio


def test_raise_waits_lower_is_instant():
    u = User(spending_limits={})
    now = datetime.now(UTC)
    limits.set_personal_limits(u, "ZAR", Decimal("500"), Decimal("2000"), now=now)
    assert limits.personal_limits(u, "ZAR", now=now)["perPayment"] == "500.00"
    limits.set_personal_limits(u, "ZAR", Decimal("5000"), Decimal("20000"), now=now)  # raise
    lim = limits.personal_limits(u, "ZAR", now=now)
    assert lim["perPayment"] == "500.00" and lim["pending"]["perPayment"] == "5000.00"
    assert limits.personal_limits(u, "ZAR", now=now + timedelta(hours=25))["perPayment"] == "5000.00"
    limits.set_personal_limits(u, "ZAR", Decimal("100"), Decimal("2000"), now=now)  # lower
    assert limits.personal_limits(u, "ZAR", now=now)["perPayment"] == "100.00"


async def test_limits_api_and_enforcement(client: AsyncClient, funded_user: dict, other_user: dict):
    h = funded_user["headers"]
    r = await client.put("/api/account/limits", json={"currency": "ZAR", "perPayment": "50", "daily": "80", "pin": TEST_PIN},
                         headers=h)
    assert r.status_code == 200, r.text
    got = (await client.get("/api/account/limits", headers=h)).json()
    zar = next(w for w in got["wallets"] if w["currency"] == "ZAR")
    assert zar["perPayment"] == "50.00" and zar["daily"] == "80.00"
    big = await client.post("/api/transfer", json={"fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["id"],
                                                   "amount": "60.00", "pin": TEST_PIN},
                            headers={**h, "Idempotency-Key": "lim-1"})
    assert big.status_code == 403 and "per-payment limit you set" in big.text
