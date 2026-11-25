"""Paymentology adapter (virtual card issuing and processing).

STATUS: typed stub. No Paymentology documentation is in the repository
(`docs/vendors/paymentology/` is empty), and we never guess a provider's
endpoints, field names, auth scheme or webhook format. Every call below
refuses with `IssuerUnavailable` until the docs arrive and the TODOs are
filled in; inbound webhooks are rejected (fail closed).

What IS final and provider-independent: the `CardIssuer` interface this
implements, the authorization/clearing/dispute logic in app.cards.*, the
ledger postings, and the tests (which run against app.cards.mock_issuer).
Filling in this file is the only change needed to go live.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.cards.issuers import (
    CardIssuer,
    CreatedCard,
    IssuerUnavailable,
    ProvisioningData,
    RevealSession,
)
from app.core.config import get_settings


@dataclass(frozen=True)
class PaymentologyConfig:
    base_url: str
    api_key: str
    api_secret: str
    program_id: str
    webhook_secret: str
    env: str  # sandbox | production

    @classmethod
    def load(cls) -> PaymentologyConfig:
        s = get_settings()
        if not s.paymentology_enabled:
            raise IssuerUnavailable("Paymentology is switched off (PAYMENTOLOGY_ENABLED=false)")
        missing = [n for n, v in (("PAYMENTOLOGY_BASE_URL", s.paymentology_base_url),
                                  ("PAYMENTOLOGY_API_KEY", s.paymentology_api_key),
                                  ("PAYMENTOLOGY_API_SECRET", s.paymentology_api_secret),
                                  ("PAYMENTOLOGY_PROGRAM_ID", s.paymentology_program_id),
                                  ("PAYMENTOLOGY_WEBHOOK_SECRET", s.paymentology_webhook_secret)) if not v]
        if missing:
            raise IssuerUnavailable(f"Paymentology is not configured: {', '.join(missing)}")
        if s.is_production and s.paymentology_env != "production":
            raise IssuerUnavailable("Paymentology sandbox credentials can't be used in production")
        return cls(s.paymentology_base_url, s.paymentology_api_key, s.paymentology_api_secret,  # type: ignore[arg-type]
                   s.paymentology_program_id, s.paymentology_webhook_secret, s.paymentology_env)  # type: ignore[arg-type]


_TODO = "Paymentology integration needs the vendor docs (docs/vendors/paymentology)"


class PaymentologyIssuer(CardIssuer):
    code = "paymentology"
    network = "visa"
    # TODO(vendor-docs): the program's supported billing currencies.
    currencies = frozenset({"ZAR", "USD", "BWP"})

    async def create_card(self, *, holder_name: str, reference: str, currency: str, form: str) -> CreatedCard:
        PaymentologyConfig.load()
        # TODO(vendor-docs): card creation endpoint, request fields (cardholder,
        # program/product id, currency, virtual form), how the idempotency key
        # is passed (we use `reference` = our card id), and the response fields
        # for the card id, last 4 and expiry. Never request or store the PAN/CVV.
        raise IssuerUnavailable(_TODO)

    async def set_status(self, issuer_card_id: str, status: str) -> None:
        PaymentologyConfig.load()
        # TODO(vendor-docs): freeze / unfreeze / terminate endpoint(s) and the
        # provider's status vocabulary (map active/frozen/cancelled to it).
        raise IssuerUnavailable(_TODO)

    async def reveal(self, issuer_card_id: str) -> RevealSession:
        PaymentologyConfig.load()
        # TODO(vendor-docs): PCI secure display. Expect a short-lived hosted URL
        # or a tokenised display SDK session; return kind="hosted". The PAN,
        # CVV and expiry must never pass through BukkaPay servers or logs.
        raise IssuerUnavailable(_TODO)

    async def provision_token(self, issuer_card_id: str, *, wallet: str, device: dict) -> ProvisioningData:
        PaymentologyConfig.load()
        # TODO(vendor-docs): Apple Pay / Google Pay push-provisioning endpoint and payload.
        raise IssuerUnavailable(_TODO)

    async def delete_token(self, issuer_token_id: str) -> None:
        PaymentologyConfig.load()
        # TODO(vendor-docs): token lifecycle (suspend / delete) endpoint.
        raise IssuerUnavailable(_TODO)

    def webhook_secret(self) -> str | None:
        return get_settings().paymentology_webhook_secret

    def verify_webhook(self, body: bytes, headers) -> bool:
        # TODO(vendor-docs): signature header name, algorithm, signed payload and
        # timestamp/replay window for both the real-time auth call and events.
        # Until then every Paymentology request is rejected (fail closed).
        return False

    def parse_authorization(self, data: dict) -> dict:
        # TODO(vendor-docs): map the real-time authorization (or JIT funding)
        # request to our normalized fields: authorizationId, cardId, amount,
        # currency, merchantAmount, merchantCurrency, merchantName, merchantMcc,
        # merchantCountry, channel, tokenId. Also: the response format and the
        # timeout we must answer within (PAYMENTOLOGY_AUTH_BUDGET_MS).
        raise IssuerUnavailable(_TODO)

    def parse_event(self, data: dict) -> tuple[str, dict]:
        # TODO(vendor-docs): event envelope (id, type) and the payloads for
        # clearing/presentment, reversal, refund, expiry, chargeback and
        # token events; map types to ours (transaction.cleared, .reversed,
        # .refunded, dispute.*, token.updated).
        raise IssuerUnavailable(_TODO)
