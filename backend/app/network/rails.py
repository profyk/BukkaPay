"""Settlement rail adapters. Each corridor names a rail provider; the adapter
sends the settlement instruction. Real rails report the outcome later via
signed webhooks (app.network.webhooks).

* sandbox — a clearly simulated rail. No real money moves. It "settles" by
  emitting its own signed settlement event through the outbox after a delay.
* book    — BukkaPay's own books: both wallets are BukkaPay wallets, so the
  transfer settles instantly against the money BukkaPay already holds in
  the destination country (prefunded pool). No per-transfer rail fee; the
  countries' pools are squared up later in bulk (see app.network.treasury).
* papss   — interface only. PAPSS access requires a sponsoring participant
  bank and central-bank onboarding; until then it refuses instructions.
"""

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.platform import PaymentProvider, Transfer
from app.network import outbox


class RailRejected(Exception):
    """The rail definitively refused; nothing was sent."""


class RailUnavailable(Exception):
    """The rail can't be used at all (not connected / not configured)."""


class RailAdapter:
    code = "base"

    async def instruct(self, db: AsyncSession, provider: PaymentProvider, transfer: Transfer) -> str:
        raise NotImplementedError


class SandboxRail(RailAdapter):
    code = "sandbox"

    async def instruct(self, db, provider, transfer) -> str:
        if provider.mode != "sandbox":
            raise RailUnavailable("The sandbox rail can only run in sandbox mode")
        reference = "SBX-" + secrets.token_hex(6).upper()
        delay = get_settings().sandbox_settlement_delay_seconds
        await outbox.enqueue(
            db, "rail.sandbox.settle", {"transfer_reference": transfer.reference, "rail_reference": reference},
            available_at=datetime.now(UTC) + timedelta(seconds=delay),
        )
        return reference


class BookRail(RailAdapter):
    """Settles on BukkaPay's ledger within seconds. Only for corridors whose
    settlement model is `internal_book`; the destination pool's capacity is
    enforced by routing.check_liquidity before the sender is debited."""

    code = "book"

    async def instruct(self, db, provider, transfer) -> str:
        from app.models.platform import PaymentCorridor

        corridor = await db.get(PaymentCorridor, transfer.corridor_id)
        if corridor is None or corridor.settlement_model != "internal_book":
            raise RailUnavailable("The book rail only settles internal_book corridors")
        reference = "BOOK-" + secrets.token_hex(6).upper()
        await outbox.enqueue(db, "rail.book.settle",
                             {"transfer_reference": transfer.reference, "rail_reference": reference})
        return reference


class PapssRail(RailAdapter):
    code = "papss"

    async def instruct(self, db, provider, transfer) -> str:
        raise RailUnavailable(
            "PAPSS is not connected: it requires a sponsoring PAPSS participant bank and onboarding"
        )


ADAPTERS: dict[str, RailAdapter] = {a.code: a for a in (SandboxRail(), BookRail(), PapssRail())}


def adapter_for(provider: PaymentProvider) -> RailAdapter:
    adapter = ADAPTERS.get(provider.code)
    if adapter is None:
        raise RailUnavailable(f"No rail adapter is implemented for provider '{provider.code}'")
    return adapter
