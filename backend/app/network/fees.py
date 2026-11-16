"""Fee engine. Picks the most specific active rule for a product and returns
the fee together with the rule snapshot that produced it — callers store
both on the transaction so history never changes when rules do."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import FeeSchedule

CENT = Decimal("0.01")


@dataclass
class FeeResult:
    fee: Decimal
    rule_id: str | None
    breakdown: dict = field(default_factory=dict)


def _specificity(rule: FeeSchedule) -> int:
    return sum(
        1 for v in (rule.country_code, rule.currency, rule.method, rule.merchant_category,
                    rule.customer_type, rule.corridor_id)
        if v is not None
    )


async def compute(
    db: AsyncSession, product: str, amount: Decimal, *, currency: str, country: str | None = None,
    method: str | None = None, merchant_category: str | None = None, customer_type: str | None = None,
    corridor_id=None,
) -> FeeResult:
    now = datetime.now(UTC)
    stmt = select(FeeSchedule).where(
        FeeSchedule.product == product,
        FeeSchedule.active.is_(True),
        or_(FeeSchedule.effective_from.is_(None), FeeSchedule.effective_from <= now),
        or_(FeeSchedule.effective_to.is_(None), FeeSchedule.effective_to > now),
        or_(FeeSchedule.country_code.is_(None), FeeSchedule.country_code == country),
        or_(FeeSchedule.currency.is_(None), FeeSchedule.currency == currency),
        or_(FeeSchedule.method.is_(None), FeeSchedule.method == method),
        or_(FeeSchedule.merchant_category.is_(None), FeeSchedule.merchant_category == merchant_category),
        or_(FeeSchedule.customer_type.is_(None), FeeSchedule.customer_type == customer_type),
        or_(FeeSchedule.corridor_id.is_(None), FeeSchedule.corridor_id == corridor_id),
        or_(FeeSchedule.min_amount.is_(None), FeeSchedule.min_amount <= amount),
        or_(FeeSchedule.max_amount.is_(None), FeeSchedule.max_amount >= amount),
    )
    rules = list((await db.execute(stmt)).scalars())
    if not rules:
        return FeeResult(fee=Decimal("0.00"), rule_id=None, breakdown={"product": product, "rule": None})
    rule = max(rules, key=lambda r: (_specificity(r), r.priority))
    pct_part = (amount * rule.percentage / Decimal(100)).quantize(CENT, rounding=ROUND_HALF_UP)
    fee = pct_part + rule.fixed
    if rule.cap is not None and fee > rule.cap:
        fee = rule.cap
    fee = fee.quantize(CENT, rounding=ROUND_HALF_UP)
    return FeeResult(
        fee=fee,
        rule_id=str(rule.id),
        breakdown={
            "product": product, "rule": str(rule.id), "percentage": str(rule.percentage),
            "fixed": str(rule.fixed), "cap": str(rule.cap) if rule.cap is not None else None,
            "percentage_part": str(pct_part), "fee": str(fee), "currency": currency,
        },
    )
