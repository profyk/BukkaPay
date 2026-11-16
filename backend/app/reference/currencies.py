"""Currency lookups backed by the ``currencies`` table.

``SEED`` is the initial data inserted by migration 0016 (and by the test
fixtures). ``wallet_enabled`` is true only for the currencies BukkaPay
already issued wallets in before this migration (ZAR/USD/BWP plus the five
added by 0008), so existing balances keep working; the new African
currencies start disabled until their custody arrangements are activated.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.reference import Currency

# code, name, symbol, decimals, wallet_enabled
SEED: list[tuple[str, str, str, int, bool]] = [
    ("ZAR", "South African Rand", "R", 2, True),
    ("USD", "United States Dollar", "$", 2, True),
    ("BWP", "Botswana Pula", "P", 2, True),
    ("NGN", "Nigerian Naira", "₦", 2, True),
    ("KES", "Kenyan Shilling", "KSh", 2, True),
    ("GHS", "Ghanaian Cedi", "GH₵", 2, True),
    ("EUR", "Euro", "€", 2, True),
    ("GBP", "Pound Sterling", "£", 2, True),
    ("ZWG", "Zimbabwe Gold (ZiG)", "ZiG", 2, False),
    ("ZMW", "Zambian Kwacha", "K", 2, False),
    ("EGP", "Egyptian Pound", "E£", 2, False),
]

DEFAULT_WALLET_CURRENCY = "ZAR"


async def get_currency(db: AsyncSession, code: str | None) -> Currency | None:
    if not code:
        return None
    return await db.get(Currency, code.strip().upper())


async def require_wallet_currency(db: AsyncSession, code: str | None) -> Currency:
    """The currency, if customers may currently hold a wallet in it."""
    currency = await get_currency(db, code)
    if currency is None or currency.status != "active" or not currency.wallet_enabled:
        raise ApiError(f"Unsupported currency: {code}")
    return currency


async def list_currencies(db: AsyncSession, *, wallet_enabled_only: bool = False) -> list[Currency]:
    stmt = select(Currency).where(Currency.status == "active").order_by(Currency.code)
    if wallet_enabled_only:
        stmt = stmt.where(Currency.wallet_enabled.is_(True))
    return list((await db.execute(stmt)).scalars().all())
