"""Chart of accounts. Every account is created on first use, race-safely
(``INSERT … ON CONFLICT DO NOTHING`` then re-select).

Account codes
-------------
wallet:<card_id>                      liability  customer wallet (projection: wallet_cards.balance)
card:holds:<CCY>                      liability  card authorizations held, not yet cleared
card:payable:<issuer>:<CCY>           liability  cleared card spend owed to the issuer-processor
receivable:card_overdraft:<CCY>       asset      clearings a wallet could not cover
merchant:<merchant_id>:<CCY>          liability  merchant payable (projection: merchants.wallet_balance)
revenue:fees:<CCY>                    revenue    platform fee income
escrow:claims:<CCY>                   liability  claim-link money held until claimed or cancelled
payouts:pending:<CCY>                 liability  owed to a bank/cash payee, payout not yet confirmed
clearing:<provider>:<CCY>             asset      money held at / due from a PSP or custodian
fx:position:<CCY>                     asset      FX conversion position (one per currency leg)
suspense:migration:<CCY>              equity     balances that existed before the ledger (to reconcile)
"""

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ledger import posting
from app.models.ledger import LedgerAccount
from app.models.wallet import WalletCard


async def _get_or_create(
    db: AsyncSession, *, code: str, name: str, type: str, currency: str,
    allow_negative: bool = False, wallet_card_id: uuid.UUID | None = None,
    merchant_id: uuid.UUID | None = None, contribution_group_id: uuid.UUID | None = None,
) -> tuple[LedgerAccount, bool]:
    existing = (
        await db.execute(select(LedgerAccount).where(LedgerAccount.code == code))
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False
    inserted = (
        await db.execute(
            insert(LedgerAccount)
            .values(
                code=code, name=name, type=type, currency=currency,
                allow_negative=allow_negative, wallet_card_id=wallet_card_id,
                merchant_id=merchant_id, contribution_group_id=contribution_group_id,
                balance=Decimal("0.00"), version=0,
            )
            .on_conflict_do_nothing(index_elements=["code"])
            .returning(LedgerAccount.id)
        )
    ).scalar_one_or_none()
    account = (
        await db.execute(
            select(LedgerAccount).where(LedgerAccount.code == code)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return account, inserted is not None


async def system_account(
    db: AsyncSession, code: str, name: str, type: str, currency: str, *, allow_negative: bool = False,
) -> LedgerAccount:
    account, _ = await _get_or_create(
        db, code=code, name=name, type=type, currency=currency, allow_negative=allow_negative
    )
    return account


async def fee_revenue(db: AsyncSession, currency: str) -> LedgerAccount:
    return await system_account(db, f"revenue:fees:{currency}", f"Fee revenue ({currency})", "revenue", currency)


async def claims_escrow(db: AsyncSession, currency: str) -> LedgerAccount:
    return await system_account(
        db, f"escrow:claims:{currency}", f"Claim links in escrow ({currency})", "liability", currency
    )


async def payouts_pending(db: AsyncSession, currency: str) -> LedgerAccount:
    return await system_account(
        db, f"payouts:pending:{currency}", f"Payouts awaiting confirmation ({currency})", "liability", currency
    )


async def provider_clearing(db: AsyncSession, provider: str, currency: str) -> LedgerAccount:
    # An asset that can legitimately run negative between a payout being
    # sent and the provider's settlement report — reconciliation owns it.
    return await system_account(
        db, f"clearing:{provider}:{currency}", f"{provider} clearing ({currency})", "asset", currency,
        allow_negative=True,
    )


async def fx_position(db: AsyncSession, currency: str) -> LedgerAccount:
    return await system_account(
        db, f"fx:position:{currency}", f"FX position ({currency})", "asset", currency, allow_negative=True
    )


async def migration_suspense(db: AsyncSession, currency: str) -> LedgerAccount:
    return await system_account(
        db, f"suspense:migration:{currency}", f"Pre-ledger opening balances ({currency})", "equity",
        currency, allow_negative=True,
    )


async def wallet_account(db: AsyncSession, card: WalletCard) -> LedgerAccount:
    """The ledger account behind a wallet card. A card that already held a
    balance before the ledger existed gets an opening entry against
    ``suspense:migration`` the first time it is touched, so its projection
    and its ledger agree from then on."""
    account, created = await _get_or_create(
        db, code=f"wallet:{card.id}", name=f"Wallet {card.id}", type="liability",
        currency=card.currency, wallet_card_id=card.id,
    )
    if created:
        locked_card = (
            await db.execute(
                select(WalletCard).where(WalletCard.id == card.id).with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        opening = locked_card.balance or Decimal("0.00")
        if opening > 0:
            suspense = await migration_suspense(db, card.currency)
            await posting.post(
                db, kind="opening_balance",
                description=f"Opening balance for wallet {card.id} (pre-ledger)",
                legs=[posting.debit(suspense, opening), posting.credit(account, opening)],
                details={"wallet_card_id": str(card.id)},
            )
            await db.refresh(account)
    return account


async def campaign_escrow(db: AsyncSession, group) -> LedgerAccount:
    """Money contributed to a campaign, held until the creator pays it out.
    Pre-ledger `current_amount` values were pledge counters, not money, so
    they are NOT brought in as an opening balance (see migration 0017)."""
    account, _ = await _get_or_create(
        db, code=f"campaign:{group.id}", name=f"Campaign {group.id}", type="liability",
        currency=group.currency, contribution_group_id=group.id,
    )
    return account


async def adjustments(db: AsyncSession, currency: str) -> LedgerAccount:
    """Counter-account for approved manual corrections (maker-checker)."""
    return await system_account(
        db, f"adjustments:{currency}", f"Approved adjustments ({currency})", "expense", currency,
        allow_negative=True,
    )


async def transit_outbound(db: AsyncSession, currency: str) -> LedgerAccount:
    """Cross-border money debited from senders, not yet settled by the rail."""
    return await system_account(
        db, f"transit:outbound:{currency}", f"Outbound transfers in transit ({currency})", "liability", currency
    )


async def merchant_account(db: AsyncSession, merchant, currency: str | None = None) -> LedgerAccount:
    """Merchant payable in `currency`. Only the settlement-currency account
    projects onto merchants.wallet_balance; balances in other currencies are
    reported per currency from the ledger."""
    currency = currency or merchant.settlement_currency
    projected = currency == merchant.settlement_currency
    account, created = await _get_or_create(
        db, code=f"merchant:{merchant.id}:{currency}", name=f"Merchant {merchant.id} ({currency})",
        type="liability", currency=currency, merchant_id=merchant.id if projected else None,
    )
    if created and projected:
        from app.models.merchant import Merchant

        locked = (
            await db.execute(
                select(Merchant).where(Merchant.id == merchant.id).with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        opening = locked.wallet_balance or Decimal("0.00")
        if opening > 0:
            suspense = await migration_suspense(db, currency)
            await posting.post(
                db, kind="opening_balance",
                description=f"Opening balance for merchant {merchant.id} (pre-ledger)",
                legs=[posting.debit(suspense, opening), posting.credit(account, opening)],
                details={"merchant_id": str(merchant.id)},
            )
            await db.refresh(account)
    return account


# ─── cards ──────────────────────────────────────────────────────────────────


async def card_holds(db: AsyncSession, currency: str) -> LedgerAccount:
    """Card authorizations approved but not yet cleared."""
    return await system_account(
        db, f"card:holds:{currency}", f"Card authorization holds ({currency})", "liability", currency
    )


async def card_issuer_payable(db: AsyncSession, issuer: str, currency: str) -> LedgerAccount:
    """Cleared card spend owed to the issuer-processor (settled from the
    prefunded settlement account; reconciled against its daily report)."""
    return await system_account(
        db, f"card:payable:{issuer}:{currency}", f"Owed to card issuer {issuer} ({currency})", "liability",
        currency, allow_negative=True,
    )


async def card_overdraft(db: AsyncSession, currency: str) -> LedgerAccount:
    """Clearings the wallet could not cover (clearing can't be declined):
    owed by customers, collected from their next top-up."""
    return await system_account(
        db, f"receivable:card_overdraft:{currency}", f"Card overdrafts receivable ({currency})", "asset",
        currency,
    )
