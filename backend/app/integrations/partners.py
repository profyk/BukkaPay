"""Partner adapters at the edges of the closed loop.

Inside BukkaPay, money moves on the ledger at zero cost. These interfaces are
the only places it leaves or enters, and the only places identity is checked
by a third party. Each has a sandbox (no real money / identity data) and a
live implementation that refuses until its credentials are configured and
the commercial onboarding is done — never a silent fake.

    Cash-in / cash-out   Stitch / PayShap (SA)  → app.integrations.stitch (live)
                         Mobile money (BW…)      → MobileMoneyRail
    Cross-border rails   PAPSS / sandbox         → app.network.rails
    Treasury rebalancing Yellow Card / ADLA      → TreasuryRail
    KYC                  Smile ID                → KycProvider
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

import httpx

from app.core.config import get_settings


class PartnerUnavailable(Exception):
    """Not configured / not onboarded: nothing was sent."""


class PartnerRejected(Exception):
    """The partner definitively refused the request."""


# ─── mobile money (Botswana and beyond) ─────────────────────────────────────


@dataclass
class MobileMoneyResult:
    reference: str
    status: str  # pending | completed | failed


class MobileMoneyRail:
    code = "base"

    async def collect(self, *, msisdn: str, amount: Decimal, currency: str, reference: str) -> MobileMoneyResult:
        """Cash-in: ask the wallet holder's mobile-money account to pay us."""
        raise NotImplementedError

    async def disburse(self, *, msisdn: str, amount: Decimal, currency: str, reference: str) -> MobileMoneyResult:
        """Cash-out: pay the customer's mobile-money account."""
        raise NotImplementedError


class SandboxMobileMoney(MobileMoneyRail):
    code = "sandbox"

    async def collect(self, *, msisdn, amount, currency, reference):
        if get_settings().is_production:
            raise PartnerUnavailable("The sandbox mobile-money rail can't run in production")
        return MobileMoneyResult(reference=f"MM-SBX-{secrets.token_hex(5).upper()}", status="pending")

    disburse = collect


class OperatorMobileMoney(MobileMoneyRail):
    """Live operator connection (e.g. Orange Money / MyZaka in Botswana).
    Needs the operator's merchant API credentials and a licensed partner."""

    code = "operator"

    async def collect(self, **kw):
        raise PartnerUnavailable("Mobile money isn't connected yet: an operator agreement and API credentials are needed")

    disburse = collect


def mobile_money() -> MobileMoneyRail:
    return SandboxMobileMoney() if not get_settings().is_production else OperatorMobileMoney()


# ─── treasury rebalancing (Yellow Card / ADLA / PAPSS) ──────────────────────


@dataclass
class RebalanceOrder:
    provider: str
    reference: str
    status: str          # submitted | settled | failed
    sell_currency: str
    sell_amount: Decimal
    buy_currency: str
    expected_buy_amount: Decimal | None = None


class TreasuryRail:
    code = "base"

    async def rebalance(self, *, sell_currency: str, sell_amount: Decimal, buy_currency: str,
                        reference: str) -> RebalanceOrder:
        raise NotImplementedError


class SandboxTreasury(TreasuryRail):
    code = "sandbox"

    async def rebalance(self, *, sell_currency, sell_amount, buy_currency, reference):
        if get_settings().is_production:
            raise PartnerUnavailable("The sandbox treasury rail can't run in production")
        return RebalanceOrder("sandbox", f"RB-SBX-{secrets.token_hex(5).upper()}", "submitted",
                              sell_currency, sell_amount, buy_currency)


class YellowCardTreasury(TreasuryRail):
    """Yellow Card payments API (stablecoin-settled cross-border liquidity).
    Requests are HMAC-signed with the API secret. Live use requires a
    Yellow Card business account and per-corridor enablement."""

    code = "yellowcard"

    def __init__(self, key: str, secret: str, base_url: str):
        self.key, self.secret, self.base_url = key, secret, base_url.rstrip("/")

    def _auth(self, method: str, path: str, body: bytes) -> dict:
        ts = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        msg = ts.encode() + path.encode() + method.upper().encode()
        if body:
            msg += base64.b64encode(hashlib.sha256(body).digest())
        sig = base64.b64encode(hmac.new(self.secret.encode(), msg, hashlib.sha256).digest()).decode()
        return {"X-YC-Timestamp": ts, "Authorization": f"YcHmacV1 {self.key}:{sig}"}

    async def rebalance(self, *, sell_currency, sell_amount, buy_currency, reference):
        import json

        path = "/business/payments"
        body = json.dumps({"sequenceId": reference, "currency": sell_currency, "amount": str(sell_amount),
                           "destinationCurrency": buy_currency, "reason": "treasury_rebalance"}).encode()
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(self.base_url + path, content=body,
                             headers={"Content-Type": "application/json", **self._auth("POST", path, body)})
        if r.status_code >= 400:
            raise PartnerRejected(f"Yellow Card refused the rebalance ({r.status_code})")
        data = r.json()
        return RebalanceOrder("yellowcard", str(data.get("id") or reference), "submitted", sell_currency,
                              sell_amount, buy_currency)


class UnavailableTreasury(TreasuryRail):
    def __init__(self, code: str, why: str):
        self.code, self.why = code, why

    async def rebalance(self, **kw):
        raise PartnerUnavailable(self.why)


def treasury(provider: str) -> TreasuryRail:
    s = get_settings()
    if provider == "sandbox":
        return SandboxTreasury()
    if provider == "yellowcard":
        if not (s.yellowcard_api_key and s.yellowcard_api_secret):
            return UnavailableTreasury("yellowcard", "Yellow Card isn't configured (YELLOWCARD_API_KEY / SECRET)")
        return YellowCardTreasury(s.yellowcard_api_key, s.yellowcard_api_secret, s.yellowcard_base_url)
    if provider == "papss":
        return UnavailableTreasury("papss", "PAPSS needs a sponsoring participant bank and central-bank onboarding")
    if provider == "adla":
        return UnavailableTreasury("adla", "ADLA settlement runs through the sponsoring bank's treasury desk")
    raise PartnerUnavailable(f"Unknown treasury rail {provider}")


# ─── KYC (Smile ID) ─────────────────────────────────────────────────────────


@dataclass
class KycJob:
    provider: str
    job_id: str
    status: str  # submitted | verified | rejected | review
    result: dict


class KycProvider:
    code = "base"

    async def verify_id(self, *, user_id: str, country: str, id_type: str, id_number: str,
                        first_name: str, last_name: str, dob: str | None) -> KycJob:
        raise NotImplementedError


class SmileIdKyc(KycProvider):
    """Smile ID Enhanced KYC (ID number lookup against the issuing authority).
    Signature: base64(HMAC-SHA256(api_key, timestamp + partner_id + "sid_request"))."""

    code = "smileid"

    def __init__(self, partner_id: str, api_key: str, sandbox: bool):
        self.partner_id, self.api_key = partner_id, api_key
        self.base = "https://testapi.smileidentity.com/v1" if sandbox else "https://api.smileidentity.com/v1"

    def signature(self, timestamp: str) -> str:
        msg = (timestamp + self.partner_id + "sid_request").encode()
        return base64.b64encode(hmac.new(self.api_key.encode(), msg, hashlib.sha256).digest()).decode()

    async def verify_id(self, *, user_id, country, id_type, id_number, first_name, last_name, dob):
        ts = datetime.now(UTC).isoformat()
        job_id = f"bkp-{secrets.token_hex(8)}"
        payload = {"partner_id": self.partner_id, "timestamp": ts, "signature": self.signature(ts),
                   "country": country, "id_type": id_type, "id_number": id_number, "first_name": first_name,
                   "last_name": last_name, "dob": dob, "partner_params": {"user_id": user_id, "job_id": job_id,
                                                                          "job_type": 5}}
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(self.base + "/id_verification", json=payload)
        if r.status_code >= 400:
            raise PartnerRejected(f"Smile ID refused the request ({r.status_code})")
        data = r.json()
        code = str(data.get("ResultCode", ""))
        status = "verified" if code in ("1012", "1020") else "rejected" if code in ("1013", "1022") else "review"
        return KycJob("smileid", job_id, status, {"resultCode": code, "resultText": data.get("ResultText")})


def kyc() -> KycProvider:
    s = get_settings()
    if not (s.smile_id_partner_id and s.smile_id_api_key):
        raise PartnerUnavailable("Smile ID isn't configured (SMILE_ID_PARTNER_ID / SMILE_ID_API_KEY)")
    return SmileIdKyc(s.smile_id_partner_id, s.smile_id_api_key, sandbox=s.smile_id_sandbox)
