"""Onafriq adapter (cross-border payouts to bank accounts and mobile wallets).

STATUS: typed stub. No Onafriq documentation is in the repository
(`docs/vendors/onafriq/` is empty), and we never guess a provider's
endpoints, field names, auth scheme or webhook format. Every outbound call
refuses with `RailUnavailable` (so nothing is reversed on a guess) and every
inbound webhook is rejected until the TODOs are filled in from the docs.

Everything around it is final and tested against app.payouts.rails.MockPayoutRail:
quotes, compliance, the payout state machine, ledger postings, automatic
reversals, reconciliation and the in-network shortcut.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.core.config import get_settings
from app.core.money import Minor
from app.payouts.rails import (
    PayoutInstruction,
    PayoutRail,
    PayoutResult,
    RailQuote,
    RailUnavailable,
    StatementLine,
    StatusEvent,
)

_TODO = "Onafriq integration needs the vendor docs (docs/vendors/onafriq)"


@dataclass(frozen=True)
class OnafriqConfig:
    base_url: str
    client_id: str
    client_secret: str
    webhook_secret: str
    env: str

    @classmethod
    def load(cls) -> OnafriqConfig:
        s = get_settings()
        if not s.onafriq_enabled:
            raise RailUnavailable("Onafriq is switched off (ONAFRIQ_ENABLED=false)")
        missing = [n for n, v in (("ONAFRIQ_BASE_URL", s.onafriq_base_url), ("ONAFRIQ_CLIENT_ID", s.onafriq_client_id),
                                  ("ONAFRIQ_CLIENT_SECRET", s.onafriq_client_secret),
                                  ("ONAFRIQ_WEBHOOK_SECRET", s.onafriq_webhook_secret)) if not v]
        if missing:
            raise RailUnavailable(f"Onafriq is not configured: {', '.join(missing)}")
        if s.is_production and s.onafriq_env != "production":
            raise RailUnavailable("Onafriq sandbox credentials can't be used in production")
        return cls(s.onafriq_base_url, s.onafriq_client_id, s.onafriq_client_secret,  # type: ignore[arg-type]
                   s.onafriq_webhook_secret, s.onafriq_env)  # type: ignore[arg-type]


class OnafriqRail(PayoutRail):
    code = "onafriq"

    async def quote(self, *, send: Minor, receive_currency: str, country: str, method: str) -> RailQuote:
        OnafriqConfig.load()
        # TODO(vendor-docs): quote/rate endpoint (if any), corridor and payout
        # method identifiers, fee model, and whether Onafriq converts or we
        # prefund in the receive currency.
        raise RailUnavailable(_TODO)

    async def create_payout(self, instruction: PayoutInstruction) -> PayoutResult:
        OnafriqConfig.load()
        # TODO(vendor-docs): auth scheme (OAuth client credentials? API key?),
        # create-transfer endpoint, idempotency header/field (send
        # instruction.idempotency_key), sender and beneficiary field names per
        # corridor and method (bank vs mobile wallet), amount format (minor
        # units?), and the response's reference + status. Map definitive
        # refusals to RailRejected and timeouts/5xx to RailUnavailable.
        raise RailUnavailable(_TODO)

    async def get_status(self, provider_reference: str) -> StatusEvent | None:
        OnafriqConfig.load()
        # TODO(vendor-docs): status lookup endpoint and status vocabulary.
        raise RailUnavailable(_TODO)

    def verify_webhook(self, body: bytes, headers) -> bool:
        # TODO(vendor-docs): webhook signature header, algorithm, signed
        # payload and replay window. Until then every webhook is rejected.
        return False

    def parse_webhook(self, payload: dict) -> StatusEvent:
        # TODO(vendor-docs): event envelope (unique event id), reference field,
        # and status mapping to processing | paid | failed | returned.
        raise RailUnavailable(_TODO)

    async def statement(self, day: date) -> list[StatementLine]:
        OnafriqConfig.load()
        # TODO(vendor-docs): settlement report / statement API or SFTP file
        # format, cut-off time zone, and how returns appear.
        raise RailUnavailable(_TODO)
