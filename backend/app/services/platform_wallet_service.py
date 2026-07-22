"""The platform's own reserved wallet — where transfer/payment fees actually
land. Before this existed, `_apply_transfer_pricing` (wallet_service.py)
correctly computed and deducted a fee from every P2P send, but never
credited it anywhere: the sender paid less, the recipient received less,
and the difference simply vanished from the ledger instead of becoming
collectible platform revenue. This service gives that fee a real home —
a system account nothing can log into (no password, frozen) that only
ever grows via fee credits, using the exact same WalletCard mechanics as
any real user's wallet so it shows up in the same balance/transaction
machinery the rest of the app already trusts.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.wallet import WalletCard

PLATFORM_WALLET_ID = "BKP-PLATFORM"
PLATFORM_USERNAME = "bukkapay_platform"
PLATFORM_EMAIL = "platform@bukkapay.internal"


async def get_or_create_platform_user(db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.wallet_id == PLATFORM_WALLET_ID))
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    user = User(
        wallet_id=PLATFORM_WALLET_ID,
        name="BukkaPay Platform Revenue",
        email=PLATFORM_EMAIL,
        username=PLATFORM_USERNAME,
        password=None,
        verified=True,
        frozen=True,
        role="platform",
    )
    db.add(user)
    await db.flush()
    return user


async def credit_fee(db: AsyncSession, currency: str, amount: Decimal) -> None:
    """Credit a transfer/payment fee to the platform wallet in the given
    currency. Called at the exact point a fee is deducted from a user, so
    revenue capture can never drift out of sync with what users are
    actually charged."""
    if amount <= 0:
        return

    # Local import to avoid a circular import (wallet_service imports this
    # module to call credit_fee from inside send_money).
    from app.services.wallet_service import get_or_create_currency_card

    platform_user = await get_or_create_platform_user(db)
    card = await get_or_create_currency_card(db, platform_user.id, currency)
    card.balance = card.balance + amount
    await db.flush()


async def get_balances(db: AsyncSession) -> list[WalletCard]:
    result = await db.execute(select(User).where(User.wallet_id == PLATFORM_WALLET_ID))
    user = result.scalar_one_or_none()
    if user is None:
        return []
    result = await db.execute(select(WalletCard).where(WalletCard.user_id == user.id))
    return list(result.scalars().all())
