from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import (
    BillingLinkStatus,
    MerchantBusinessType,
    MerchantStaffRole,
    MerchantStaffStatus,
    MerchantTransactionStatus,
    MerchantTransactionType,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.models.mixins import (
    CreatedAt,
    CreatedOnlyMixin,
    CurrencyCode,
    Money,
    OptionalTimestamp,
    TimestampMixin,
    UUIDFk,
    UUIDPk,
)


class Merchant(Base, TimestampMixin):
    __tablename__ = "merchants"
    __table_args__ = (
        CheckConstraint("wallet_balance >= 0", name="ck_merchants_wallet_balance_nonneg"),
    )

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    business_name: Mapped[str] = mapped_column(Text)
    business_type: Mapped[MerchantBusinessType] = mapped_column(
        Enum(MerchantBusinessType, name="merchant_business_type", native_enum=True, values_callable=lambda x: [e.value for e in x])
    )
    business_category: Mapped[str | None] = mapped_column(Text)
    business_logo: Mapped[str | None] = mapped_column(Text)
    business_email: Mapped[str | None] = mapped_column(Text)
    business_phone: Mapped[str | None] = mapped_column(Text)
    business_address: Mapped[str | None] = mapped_column(Text)
    business_reg_number: Mapped[str | None] = mapped_column(Text)
    vat_number: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(Text)
    qr_code: Mapped[str] = mapped_column(Text, unique=True, index=True)
    payment_link: Mapped[str] = mapped_column(Text, unique=True, index=True)
    wallet_balance: Mapped[Money] = mapped_column(default=0)
    country_code: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), default="ZA")
    settlement_currency: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code"), default="ZAR")
    # KYB gate: a merchant can't take payments or withdraw until approved.
    kyb_status: Mapped[str] = mapped_column(Text, default="not_submitted")
    kyb_submitted_at: Mapped[OptionalTimestamp]
    kyb_reviewed_at: Mapped[OptionalTimestamp]
    kyb_rejection_reason: Mapped[str | None] = mapped_column(Text)
    kyb_details: Mapped[dict | None] = mapped_column(JSONB)
    # "business": full KYB (registration, directors, documents), no cap.
    # "individual": street vendors, tuck shops, individual landlords —
    # verified through the owner's own ID check (KYC level 2) instead of
    # business documents, and capped by the "merchant_individual" limit.
    verification_tier: Mapped[str] = mapped_column(String(12), default="business", server_default="business")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    daily_limit: Mapped[Money] = mapped_column(default=10000)
    subscription_plan: Mapped[SubscriptionPlan] = mapped_column(
        Enum(SubscriptionPlan, name="subscription_plan", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=SubscriptionPlan.STARTER,
    )
    subscription_status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=SubscriptionStatus.ACTIVE,
    )
    subscription_expires_at: Mapped[OptionalTimestamp]

    # Payout banking details — where the Stitch payment gateway sends money
    # when this merchant withdraws. Set once from Settings, reused for
    # every withdrawal instead of re-entering bank details each time.
    bank_id: Mapped[str | None] = mapped_column(Text)
    bank_name: Mapped[str | None] = mapped_column(Text)
    account_holder: Mapped[str | None] = mapped_column(Text)
    account_number: Mapped[str | None] = mapped_column(Text)
    account_type: Mapped[str | None] = mapped_column(Text, default="savings")


class MerchantStaff(Base, TimestampMixin):
    """A staff member with scoped dashboard access to one merchant. Follows
    the same invite-code-then-link pattern as rental Tenants: the owner
    creates a row with a shareable code and no user_id yet, the staff
    member (an existing BukkaPay user) redeems the code to link their own
    account — no separate staff login system, no email delivery needed."""

    __tablename__ = "merchant_staff"

    id: Mapped[UUIDPk]
    merchant_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True
    )
    invite_code: Mapped[str] = mapped_column(Text, unique=True, index=True)
    user_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    role: Mapped[MerchantStaffRole] = mapped_column(
        Enum(MerchantStaffRole, name="merchant_staff_role", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=MerchantStaffRole.CASHIER,
    )
    status: Mapped[MerchantStaffStatus] = mapped_column(
        Enum(MerchantStaffStatus, name="merchant_staff_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=MerchantStaffStatus.PENDING,
    )
    linked_at: Mapped[OptionalTimestamp]


class MerchantTransaction(Base, CreatedOnlyMixin):
    __tablename__ = "merchant_transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_merchant_transactions_amount_positive"),
    )

    id: Mapped[UUIDPk]
    merchant_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True
    )
    payer_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    payer_name: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[Money]
    type: Mapped[MerchantTransactionType] = mapped_column(
        Enum(MerchantTransactionType, name="merchant_transaction_type", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=MerchantTransactionType.PAYMENT,
    )
    status: Mapped[MerchantTransactionStatus] = mapped_column(
        Enum(MerchantTransactionStatus, name="merchant_transaction_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=MerchantTransactionStatus.COMPLETED,
    )
    reference: Mapped[str | None] = mapped_column(Text)


class MerchantSubscription(Base, CreatedOnlyMixin):
    __tablename__ = "merchant_subscriptions"

    id: Mapped[UUIDPk]
    merchant_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True
    )
    plan: Mapped[SubscriptionPlan] = mapped_column(
        Enum(SubscriptionPlan, name="subscription_plan", native_enum=True, create_type=False, values_callable=lambda x: [e.value for e in x]),
        default=SubscriptionPlan.STARTER,
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status", native_enum=True, create_type=False, values_callable=lambda x: [e.value for e in x]),
        default=SubscriptionStatus.ACTIVE,
    )
    price: Mapped[Money] = mapped_column(default=0)
    billing_cycle: Mapped[str] = mapped_column(Text, default="monthly")
    started_at: Mapped[CreatedAt]
    expires_at: Mapped[OptionalTimestamp]
    stripe_subscription_id: Mapped[str | None] = mapped_column(Text)


class BillingLink(Base, CreatedOnlyMixin):
    __tablename__ = "billing_links"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_billing_links_amount_positive"),)

    id: Mapped[UUIDPk]
    merchant_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True
    )
    payment_link_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payment_links.id", ondelete="SET NULL"), index=True
    )
    biller_name: Mapped[str] = mapped_column(Text)
    bill_type: Mapped[str] = mapped_column(Text, default="other")
    description: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[Money]
    currency: Mapped[CurrencyCode] = mapped_column(default="ZAR")
    account_number: Mapped[str | None] = mapped_column(Text)
    billing_period: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[OptionalTimestamp]
    attachments: Mapped[list | None] = mapped_column(JSONB, default=list)
    recipients: Mapped[list | None] = mapped_column(JSONB, default=list)
    status: Mapped[BillingLinkStatus] = mapped_column(
        Enum(BillingLinkStatus, name="billing_link_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=BillingLinkStatus.ACTIVE,
    )
    total_collected: Mapped[Money] = mapped_column(default=0)
    payment_count: Mapped[int] = mapped_column(Integer, default=0)
