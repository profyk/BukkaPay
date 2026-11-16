import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.models.contribution import Contribution, ContributionGroup


async def get_groups_by_creator(db: AsyncSession, creator_id: uuid.UUID) -> list[ContributionGroup]:
    result = await db.execute(select(ContributionGroup).where(ContributionGroup.creator_id == creator_id))
    return list(result.scalars().all())


async def get_group(db: AsyncSession, group_id: str) -> ContributionGroup | None:
    try:
        group_uuid = uuid.UUID(group_id)
    except ValueError:
        return None
    result = await db.execute(select(ContributionGroup).where(ContributionGroup.id == group_uuid))
    return result.scalar_one_or_none()


async def get_group_by_share_code(db: AsyncSession, code: str) -> ContributionGroup | None:
    result = await db.execute(select(ContributionGroup).where(ContributionGroup.share_code == code))
    return result.scalar_one_or_none()


async def get_contributions_by_group(db: AsyncSession, group_id: uuid.UUID) -> list[Contribution]:
    result = await db.execute(select(Contribution).where(Contribution.group_id == group_id))
    return list(result.scalars().all())


async def create_group(
    db: AsyncSession, creator_id: uuid.UUID, *, title: str, description: str | None, category: str,
    target_amount: str | None, currency: str | None, is_active: bool | None, end_date,
) -> ContributionGroup:
    from app.models.user import User
    from app.network import countries
    from app.reference import currencies

    creator = await db.get(User, creator_id)
    country = await countries.require_operating(db, creator.residence_country)
    currency = (await currencies.require_wallet_currency(db, currency or country.default_currency)).code
    share_code = f"CON-{secrets.token_hex(4).upper()}"
    group = ContributionGroup(
        creator_id=creator_id, title=title, description=description, category=category,
        target_amount=posting.parse_amount(target_amount, field="target amount") if target_amount else None,
        currency=currency, share_code=share_code,
        is_active=True if is_active is None else is_active, end_date=end_date,
    )
    db.add(group)
    await db.flush()
    return group


async def lock_group(db: AsyncSession, group_id: uuid.UUID) -> ContributionGroup:
    group = (await db.execute(select(ContributionGroup).where(ContributionGroup.id == group_id)
                              .with_for_update().execution_options(populate_existing=True))).scalar_one()
    return group


def ensure_open(group: ContributionGroup) -> None:
    from datetime import UTC, datetime

    if not group.is_active:
        raise ApiError("This contribution campaign is closed")
    if group.end_date is not None and group.end_date <= datetime.now(UTC):
        raise ApiError("This contribution campaign has ended")


async def contribute_from_wallet(
    db: AsyncSession, group: ContributionGroup, contributor_id: uuid.UUID, *, contributor_name: str,
    contributor_phone: str | None, amount: str, message: str | None, is_anonymous: bool | None,
) -> Contribution:
    """Signed-in contribution: the contributor's wallet → campaign escrow."""
    from app.models.enums import TransactionType
    from app.models.wallet import Transaction, WalletCard

    ensure_open(group)
    parsed = posting.parse_amount(amount)
    card = (await db.execute(select(WalletCard).where(
        WalletCard.user_id == contributor_id, WalletCard.currency == group.currency)
        .order_by(WalletCard.is_default.desc(), WalletCard.created_at))).scalars().first()
    if card is None:
        raise ApiError(f"You need a {group.currency} wallet to contribute to this campaign")
    if card.frozen or card.blocked or card.flagged:
        raise ApiError("This card is restricted", status_code=403)
    contribution = Contribution(
        group_id=group.id, contributor_id=contributor_id, contributor_name=contributor_name,
        contributor_phone=contributor_phone, amount=parsed, message=message,
        is_anonymous=bool(is_anonymous), status="paid",
    )
    db.add(contribution)
    await db.flush()
    entry = await posting.post(
        db, kind="contribution", description=f"Contribution to campaign {group.id}",
        legs=[posting.debit(await ledger_accounts.wallet_account(db, card), parsed),
              posting.credit(await ledger_accounts.campaign_escrow(db, group), parsed)],
        details={"contribution_id": str(contribution.id), "group_id": str(group.id),
                 "sender_id": str(contributor_id)},
    )
    contribution.journal_entry_id = entry.id
    db.add(Transaction(user_id=contributor_id, card_id=card.id, title=f"Contribution: {group.title}",
                       category="contribution", amount=parsed, type=TransactionType.DEBIT, icon="people"))
    await db.flush()
    return contribution


async def record_funded_contribution(db: AsyncSession, group: ContributionGroup, funding) -> Contribution:
    """A guest contribution paid by EFT, credited once Stitch confirms."""
    contribution = Contribution(
        group_id=group.id, contributor_id=None, contributor_name=funding.payer_name or "Guest",
        contributor_phone=None, amount=funding.amount, message=None, is_anonymous=False, status="paid",
    )
    db.add(contribution)
    await db.flush()
    entry = await posting.post(
        db, kind="contribution", description=f"Guest contribution to campaign {group.id}",
        legs=[posting.debit(await ledger_accounts.provider_clearing(db, funding.provider, funding.currency),
                            funding.amount),
              posting.credit(await ledger_accounts.campaign_escrow(db, group), funding.amount)],
        details={"contribution_id": str(contribution.id), "group_id": str(group.id),
                 "funding_request_id": str(funding.id)},
    )
    contribution.journal_entry_id = entry.id
    await db.flush()
    return contribution


async def payout(db: AsyncSession, group: ContributionGroup, creator_id: uuid.UUID, amount: str | None):
    """Creator moves collected money from the campaign escrow to their own
    wallet. Only the creator can, and only what has actually been collected."""
    from app.models.enums import NotificationType, TransactionType
    from app.models.platform import ContributionPayout
    from app.models.wallet import Transaction
    from app.network import fees
    from app.services import notification_service
    from app.services.wallet_service import get_or_create_currency_card

    if group.creator_id != creator_id:
        raise ApiError("Only the campaign creator can withdraw its funds", status_code=403)
    group = await lock_group(db, group.id)
    available = group.current_amount
    parsed = posting.parse_amount(amount) if amount else available
    if parsed <= 0 or parsed > available:
        raise ApiError(f"Available to withdraw: {group.currency} {available:.2f}")
    card = await get_or_create_currency_card(db, creator_id, group.currency)
    fee = await fees.compute(db, "contribution_payout", parsed, currency=group.currency)
    entry = await posting.post(
        db, kind="contribution_payout", description=f"Campaign {group.id} payout",
        legs=[posting.debit(await ledger_accounts.campaign_escrow(db, group), parsed),
              posting.credit(await ledger_accounts.wallet_account(db, card), parsed - fee.fee),
              posting.credit(await ledger_accounts.fee_revenue(db, group.currency), fee.fee)],
        details={"group_id": str(group.id), "fee_breakdown": fee.breakdown},
    )
    db.add(ContributionPayout(group_id=group.id, amount=parsed, currency=group.currency,
                              destination_card_id=card.id, journal_entry_id=entry.id))
    group.paid_out_amount = group.paid_out_amount + parsed
    db.add(Transaction(user_id=creator_id, card_id=card.id, title=f"Campaign payout: {group.title}",
                       category="contribution", amount=parsed - fee.fee, type=TransactionType.CREDIT,
                       icon="people", fee_amount=fee.fee))
    await notification_service.create_notification(
        db, creator_id, NotificationType.SUCCESS, "Campaign payout",
        f"{group.currency} {parsed - fee.fee:.2f} moved from '{group.title}' to your wallet")
    await db.flush()
    return {"amount": f"{parsed:.2f}", "fee": f"{fee.fee:.2f}", "net": f"{parsed - fee.fee:.2f}",
            "currency": group.currency, "remaining": f"{group.current_amount:.2f}", "reference": entry.reference}


def with_status(group: ContributionGroup) -> dict:
    return {**{c.name: getattr(group, c.name) for c in group.__table__.columns},
            "status": "active" if group.is_active else "inactive"}
