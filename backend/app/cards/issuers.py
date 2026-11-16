"""Card issuer-processor adapters.

A Visa card can only be issued by a licensed issuer: a BIN sponsor bank
(Visa principal member) plus an issuer-processor that runs the card
platform, real-time authorization, 3-D Secure and Visa Token Service (tap
to pay). BukkaPay integrates with the processor; the adapter interface below
is what each processor implementation provides.

* sandbox — a simulated processor for development and tests. Cards use the
  Visa test BIN range and work nowhere. Refused in production.
* none    — no issuer contracted yet. Cards are not issued; wallets keep
  working for everything else.

Adding a real processor = one adapter class + its webhook secret. Nothing
else in the card flow changes.
"""

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.config import get_settings


class IssuerUnavailable(Exception):
    """No usable issuer (not contracted / not configured / currency not
    supported). Nothing was created at the issuer."""


class IssuerRejected(Exception):
    """The issuer definitively refused the request."""


@dataclass
class CreatedCard:
    issuer_card_id: str
    last4: str
    exp_month: int
    exp_year: int
    status: str  # "active" or "requested" (issuer finishes asynchronously)


@dataclass
class RevealSession:
    """How the app shows full card details. Real processors return a
    short-lived URL/token for their PCI-compliant hosted view, so the PAN
    never touches BukkaPay servers. The sandbox returns test details."""

    kind: str  # "hosted" | "sandbox"
    expires_at: datetime
    url: str | None = None
    token: str | None = None
    pan: str | None = None
    cvv: str | None = None


@dataclass
class ProvisioningData:
    """Push-provisioning payload handed to the device wallet SDK (Apple
    PassKit / Google TapAndPay). Opaque to BukkaPay."""

    issuer_token_id: str
    wallet: str
    activation_data: str
    encrypted_pass_data: str | None
    ephemeral_public_key: str | None
    token_last4: str | None


class CardIssuer:
    code = "base"
    network = "visa"
    currencies: frozenset[str] = frozenset()

    def supports_currency(self, currency: str) -> bool:
        return currency in self.currencies

    async def create_card(self, *, holder_name: str, reference: str, currency: str, form: str) -> CreatedCard:
        raise NotImplementedError

    async def set_status(self, issuer_card_id: str, status: str) -> None:
        raise NotImplementedError

    async def reveal(self, issuer_card_id: str) -> RevealSession:
        raise NotImplementedError

    async def provision_token(self, issuer_card_id: str, *, wallet: str, device: dict) -> ProvisioningData:
        raise NotImplementedError

    async def delete_token(self, issuer_token_id: str) -> None:
        raise NotImplementedError

    def webhook_secret(self) -> str | None:
        return None


class SandboxIssuer(CardIssuer):
    code = "sandbox"
    # The sandbox bills in any wallet currency; real processors publish their own list.
    currencies = frozenset({"ZAR", "USD", "EUR", "GBP", "NGN", "KES", "GHS", "BWP", "NAD", "ZMW", "UGX", "TZS",
                            "RWF", "XOF", "XAF", "EGP", "MAD", "MUR", "ETB", "MZN", "AOA", "MWK", "LSL", "SZL"})

    def _guard(self) -> None:
        if get_settings().is_production:
            raise IssuerUnavailable("The sandbox card issuer cannot run in production")

    @staticmethod
    def _pan(issuer_card_id: str) -> str:
        # Visa test range (4000 00…), derived — never stored. Luhn-valid.
        digest = hashlib.sha256(issuer_card_id.encode()).hexdigest()
        body = "400000" + "".join(str(int(c, 16) % 10) for c in digest[:9])
        total = 0
        for i, d in enumerate(reversed(body)):
            n = int(d)
            if i % 2 == 0:
                n *= 2
                if n > 9:
                    n -= 9
            total += n
        return body + str((10 - total % 10) % 10)

    async def create_card(self, *, holder_name, reference, currency, form) -> CreatedCard:
        self._guard()
        if not self.supports_currency(currency):
            raise IssuerUnavailable(f"Cards are not available in {currency} yet")
        card_id = "sbxcard_" + secrets.token_hex(8)
        expiry = datetime.now(UTC) + timedelta(days=365 * 4)
        return CreatedCard(issuer_card_id=card_id, last4=self._pan(card_id)[-4:],
                           exp_month=expiry.month, exp_year=expiry.year, status="active")

    async def set_status(self, issuer_card_id, status) -> None:
        self._guard()

    async def reveal(self, issuer_card_id) -> RevealSession:
        self._guard()
        cvv = str(int(hashlib.sha256(("cvv" + issuer_card_id).encode()).hexdigest()[:6], 16) % 900 + 100)
        return RevealSession(kind="sandbox", expires_at=datetime.now(UTC) + timedelta(seconds=60),
                             pan=self._pan(issuer_card_id), cvv=cvv)

    async def provision_token(self, issuer_card_id, *, wallet, device) -> ProvisioningData:
        self._guard()
        token_id = "sbxtok_" + secrets.token_hex(8)
        return ProvisioningData(
            issuer_token_id=token_id, wallet=wallet,
            activation_data="SANDBOX-" + secrets.token_urlsafe(16),
            encrypted_pass_data=None, ephemeral_public_key=None,
            token_last4=str(secrets.randbelow(9000) + 1000),
        )

    async def delete_token(self, issuer_token_id) -> None:
        self._guard()

    def webhook_secret(self) -> str | None:
        return get_settings().card_issuer_webhook_secret or get_settings().sandbox_webhook_secret


ISSUERS: dict[str, CardIssuer] = {i.code: i for i in (SandboxIssuer(),)}


def configured() -> CardIssuer:
    code = get_settings().card_issuer
    if code in ("", "none"):
        raise IssuerUnavailable(
            "Card issuing is not connected yet: it needs a Visa BIN sponsor and an issuer-processor contract"
        )
    issuer = ISSUERS.get(code)
    if issuer is None:
        raise IssuerUnavailable(f"No adapter is implemented for card issuer '{code}'")
    return issuer


def by_code(code: str) -> CardIssuer:
    issuer = ISSUERS.get(code)
    if issuer is None:
        raise IssuerUnavailable(f"Unknown card issuer '{code}'")
    return issuer


# ─── webhook signatures (t=<unix>,v1=<hmac_sha256(secret, "<t>.<body>")>) ─────

TOLERANCE_SECONDS = 300


def sign(issuer: CardIssuer, body: bytes, *, timestamp: int | None = None) -> str:
    t = timestamp or int(datetime.now(UTC).timestamp())
    mac = hmac.new(issuer.webhook_secret().encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={t},v1={mac}"


def verify(issuer: CardIssuer, body: bytes, header: str | None) -> bool:
    secret = issuer.webhook_secret()
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
