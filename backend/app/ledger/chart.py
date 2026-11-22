"""BukkaPay's system chart of accounts: the SYS_* accounts, per currency.

A ledger account holds exactly one currency, so each SYS_* name exists once
per supported currency, e.g. SYS_REVENUE_FX_ZAR / _USD / _BWP. Every account
is in one of three segregated categories (enforced by the database):

    customer  wallet:<card_id>                 a customer's wallet
    merchant  merchant:<merchant_id>:<CCY>     a merchant's balance
    system    everything else                  BukkaPay's own books

System accounts that already existed under an older code keep that code (so
the money already in them stays traceable) and gain the SYS_* system_code.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

LAUNCH_CURRENCIES = ("ZAR", "USD", "BWP")


@dataclass(frozen=True)
class SystemAccount:
    name: str          # SYS_* name without the currency suffix
    code: str          # ledger code template, {ccy} = currency
    title: str
    type: str          # asset | liability | equity | revenue | expense
    allow_negative: bool = False
    purpose: str = ""


SYSTEM_ACCOUNTS: tuple[SystemAccount, ...] = (
    SystemAccount("SYS_SAFEGUARD", "safeguard:{ccy}", "Safeguarded funds", "asset",
                  purpose="Customer and merchant money held 1:1 at the safeguarding bank/custodian"),
    SystemAccount("SYS_FX_POOL", "fx:position:{ccy}", "FX pool", "asset", allow_negative=True,
                  purpose="Currency bought and sold when customers swap or send across borders"),
    SystemAccount("SYS_TRADE_ESCROW", "escrow:trade:{ccy}", "Trade escrow", "liability",
                  purpose="Buyer money locked against a supplier invoice until release or refund"),
    SystemAccount("SYS_REVENUE_ESCROW_FEES", "revenue:escrow_fees:{ccy}", "Trade escrow fee revenue", "revenue",
                  purpose="The 1.0–1.5% fee on released trade escrow"),
    SystemAccount("SYS_REVENUE_FX", "revenue:fx:{ccy}", "FX spread revenue", "revenue",
                  purpose="The spread BukkaPay earns on currency swaps"),
    SystemAccount("SYS_REVENUE_MERCHANT_FEES", "revenue:merchant_fees:{ccy}", "Merchant fee revenue", "revenue",
                  purpose="Fees merchants pay on QR and checkout payments"),
    SystemAccount("SYS_REVENUE_CASHOUT", "revenue:cashout:{ccy}", "Cash-out fee revenue", "revenue",
                  purpose="Flat fees on withdrawals to bank or mobile money"),
    SystemAccount("SYS_REVENUE_INTERCHANGE", "revenue:interchange:{ccy}", "Card interchange revenue", "revenue",
                  purpose="Interchange earned on virtual card spend"),
    SystemAccount("SYS_FLIGHT_SETTLEMENT", "payable:travel_operators:{ccy}", "Flight settlement", "liability",
                  purpose="Ticket money owed to airlines until settled with them"),
    SystemAccount("SYS_CARD_HOLD_ESCROW", "card:holds:{ccy}", "Card authorisation holds", "liability",
                  purpose="Card authorisations approved but not yet cleared"),
)

_BY_NAME = {a.name: a for a in SYSTEM_ACCOUNTS}


def system_code_for(code: str) -> str | None:
    """SYS_* code for a ledger code, e.g. 'revenue:fx:ZAR' -> 'SYS_REVENUE_FX_ZAR'."""
    for a in SYSTEM_ACCOUNTS:
        prefix = a.code.split("{ccy}")[0]
        if code.startswith(prefix) and code.count(":") == a.code.count(":"):
            ccy = code[len(prefix):]
            if len(ccy) == 3 and ccy.isalpha() and ccy.isupper():
                return f"{a.name}_{ccy}"
    return None


def category_for(code: str) -> str:
    if code.startswith("wallet:"):
        return "customer"
    if code.startswith("merchant:"):
        return "merchant"
    return "system"


async def sys_account(db: AsyncSession, name: str, currency: str):
    """The SYS_* account for a currency, created on first use."""
    from app.ledger.accounts import system_account

    a = _BY_NAME[name]
    return await system_account(db, a.code.format(ccy=currency), f"{a.title} ({currency})", a.type, currency,
                                allow_negative=a.allow_negative)
