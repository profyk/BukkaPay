"""Payout rails: how money leaves BukkaPay to a bank account or mobile wallet.

`PayoutRail` is deliberately small so Onafriq, TCIB and Thunes all fit:

    quote(...)          the rail's own cost/rate for a corridor (optional)
    create_payout(...)  send one instruction, with OUR idempotency key
    get_status(...)     poll, for when a webhook is late or lost
    verify_webhook / parse_webhook   inbound status events
    statement(day)      what the rail says it paid, for reconciliation

Amounts are integer minor units (app.core.money.Minor). A rail raises
`RailRejected` when it definitively refused (nothing was sent, safe to
reverse) and `RailUnavailable` when the outcome is unknown or it's down
(retry with the same idempotency key; never reverse on a guess).
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from app.core.config import get_settings
from app.core.money import Minor


class RailRejected(Exception):
    """The rail definitively refused; nothing was sent."""


class RailUnavailable(Exception):
    """Down, not configured, or the outcome is unknown: retry, don't reverse."""


@dataclass(frozen=True)
class Beneficiary:
    country: str
    currency: str
    method: str  # bank | mobile_wallet
    first_name: str
    last_name: str
    bank_code: str | None = None
    branch_code: str | None = None
    account_number: str | None = None
    msisdn: str | None = None
    operator: str | None = None
    extra: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Sender:
    user_id: str
    full_name: str
    country: str
    msisdn: str | None = None


@dataclass(frozen=True)
class RailQuote:
    rail_fee: Minor          # what the rail charges us (send or receive currency, per rail)
    rate: str | None = None  # the rail's rate, as a decimal string, if it converts


@dataclass(frozen=True)
class PayoutInstruction:
    idempotency_key: str
    reference: str
    send: Minor
    receive: Minor
    beneficiary: Beneficiary
    sender: Sender
    purpose: str | None = None


@dataclass(frozen=True)
class PayoutResult:
    provider_reference: str
    status: str  # submitted | processing | paid


@dataclass(frozen=True)
class StatusEvent:
    event_id: str
    provider_reference: str
    status: str  # processing | paid | failed | returned
    reason: str | None = None
    occurred_at: datetime | None = None


@dataclass(frozen=True)
class StatementLine:
    provider_reference: str
    amount: Minor
    status: str  # paid | returned
    value_date: date


class PayoutRail:
    code = "base"

    async def quote(self, *, send: Minor, receive_currency: str, country: str, method: str) -> RailQuote:
        raise NotImplementedError

    async def create_payout(self, instruction: PayoutInstruction) -> PayoutResult:
        raise NotImplementedError

    async def get_status(self, provider_reference: str) -> StatusEvent | None:
        raise NotImplementedError

    def verify_webhook(self, body: bytes, headers) -> bool:
        raise NotImplementedError

    def parse_webhook(self, payload: dict) -> StatusEvent:
        raise NotImplementedError

    async def statement(self, day: date) -> list[StatementLine]:
        raise NotImplementedError


# ─── mock rail (tests, local development, the mock provider server) ─────────

TOLERANCE_SECONDS = 300


def sign(secret: str, body: bytes, *, timestamp: int | None = None) -> str:
    t = timestamp or int(datetime.now(UTC).timestamp())
    return f"t={t},v1={hmac.new(secret.encode(), f'{t}.'.encode() + body, hashlib.sha256).hexdigest()}"


def verify_signed(secret: str | None, body: bytes, header: str | None) -> bool:
    """`t=<unix>,v1=<hex hmac_sha256(secret, "<t>.<body>")>`, rejecting stale events."""
    if not secret or not header:
        return False
    try:
        parts = dict(p.split("=", 1) for p in header.split(","))
        t, given = int(parts["t"]), parts["v1"]
    except (KeyError, ValueError):
        return False
    if abs(datetime.now(UTC).timestamp() - t) > TOLERANCE_SECONDS:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, given)


class MockPayoutRail(PayoutRail):
    """Deterministic stand-in. Tests script it via `scenario`:
    "accept" (default), "reject", "timeout", "paid_now". Remembers every
    instruction by idempotency key, exactly like a real rail must."""

    code = "mock"
    SECRET = "mock-payout-webhook-secret"

    def __init__(self) -> None:
        self.scenario = "accept"
        self.calls: list[PayoutInstruction] = []
        self.by_key: dict[str, PayoutResult] = {}
        self.statement_lines: list[StatementLine] = []
        self.fee = 0

    def _guard(self) -> None:
        if get_settings().is_production:
            raise RailUnavailable("The mock payout rail cannot run in production")

    async def quote(self, *, send, receive_currency, country, method) -> RailQuote:
        self._guard()
        return RailQuote(rail_fee=Minor(self.fee, send.currency))

    async def create_payout(self, instruction: PayoutInstruction) -> PayoutResult:
        self._guard()
        self.calls.append(instruction)
        if instruction.idempotency_key in self.by_key:  # retried: same answer, never a second payout
            return self.by_key[instruction.idempotency_key]
        if self.scenario == "reject":
            raise RailRejected("Beneficiary account is invalid")
        if self.scenario == "timeout":
            raise RailUnavailable("Timed out waiting for the rail")
        result = PayoutResult("MOCK-" + secrets.token_hex(6).upper(), "paid" if self.scenario == "paid_now" else "submitted")
        self.by_key[instruction.idempotency_key] = result
        return result

    async def get_status(self, provider_reference: str) -> StatusEvent | None:
        self._guard()
        return None

    def verify_webhook(self, body: bytes, headers) -> bool:
        return verify_signed(self.SECRET, body, headers.get("X-Payout-Signature"))

    def parse_webhook(self, payload: dict) -> StatusEvent:
        return StatusEvent(event_id=str(payload["id"]), provider_reference=str(payload["reference"]),
                           status=str(payload["status"]), reason=payload.get("reason"))

    async def statement(self, day: date) -> list[StatementLine]:
        self._guard()
        return [line for line in self.statement_lines if line.value_date == day]


MOCK = MockPayoutRail()


def by_code(code: str) -> PayoutRail:
    if code == "mock":
        return MOCK
    if code == "onafriq":
        from app.payouts.onafriq import OnafriqRail

        return OnafriqRail()
    raise RailUnavailable(f"No payout rail '{code}'")


def configured() -> PayoutRail:
    code = get_settings().payout_rail
    if code == "onafriq" and not get_settings().onafriq_enabled:
        raise RailUnavailable("Onafriq is switched off (ONAFRIQ_ENABLED=false)")
    return by_code(code)
