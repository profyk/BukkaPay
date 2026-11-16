"""Platform fee revenue, read from the ledger.

Fees are credited to the ``revenue:fees:<CCY>`` ledger accounts by the same
journal entry that charges the customer (see ``app.ledger.accounts``), so
revenue can never drift from what customers were charged. This module only
reports those balances for the admin console.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import LedgerAccount
from app.models.user import User

PLATFORM_WALLET_ID = "BKP-PLATFORM"


async def get_balances(db: AsyncSession) -> list:
    """Fee revenue per currency, plus anything still sitting on the legacy
    platform wallet cards from before the ledger (shown so it is not lost
    from view; it is reconciled via suspense:migration)."""
    revenue = list(
        (
            await db.execute(
                select(LedgerAccount)
                .where(LedgerAccount.code.like("revenue:fees:%"))
                .order_by(LedgerAccount.currency)
            )
        ).scalars()
    )
    totals: dict[str, object] = {a.currency: a.balance for a in revenue}

    from app.models.wallet import WalletCard

    legacy_user = (
        await db.execute(select(User).where(User.wallet_id == PLATFORM_WALLET_ID))
    ).scalar_one_or_none()
    if legacy_user is not None:
        for card in (
            await db.execute(select(WalletCard).where(WalletCard.user_id == legacy_user.id))
        ).scalars():
            totals[card.currency] = totals.get(card.currency, 0) + card.balance

    class _Row:
        def __init__(self, currency, balance):
            self.currency, self.balance = currency, balance

    return [_Row(c, b) for c, b in sorted(totals.items())]
