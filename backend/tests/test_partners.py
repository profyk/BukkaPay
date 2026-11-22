"""Partner adapters: sandboxes work outside production, live adapters refuse
clearly until configured, and Smile ID requests are signed correctly."""

import base64
import hashlib
import hmac
from decimal import Decimal

import pytest

from app.integrations import partners


async def test_sandbox_rails_and_unconfigured_partners():
    order = await partners.treasury("sandbox").rebalance(sell_currency="ZAR", sell_amount=Decimal("1000.00"),
                                                         buy_currency="BWP", reference="RB-1")
    assert order.status == "submitted" and order.reference.startswith("RB-SBX-")
    for provider in ("yellowcard", "papss", "adla"):
        with pytest.raises(partners.PartnerUnavailable):
            await partners.treasury(provider).rebalance(sell_currency="ZAR", sell_amount=Decimal("1"),
                                                        buy_currency="BWP", reference="x")
    with pytest.raises(partners.PartnerUnavailable):
        partners.kyc()
    mm = await partners.mobile_money().collect(msisdn="+26771234567", amount=Decimal("50.00"), currency="BWP",
                                               reference="MM-1")
    assert mm.status == "pending"


def test_smile_id_signature():
    s = partners.SmileIdKyc("1234", "secret-key", sandbox=True)
    ts = "2026-11-22T10:00:00+00:00"
    expected = base64.b64encode(hmac.new(b"secret-key", (ts + "1234" + "sid_request").encode(),
                                         hashlib.sha256).digest()).decode()
    assert s.signature(ts) == expected and s.base.startswith("https://testapi.")
