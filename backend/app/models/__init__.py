"""SQLAlchemy models, one module per domain. Import order matters for
Alembic autogenerate/FK resolution, so everything is re-exported here.
"""

from app.models.admin import AdminSession, AdminUser
from app.models.claim_payment import ClaimPayment
from app.models.contribution import Contribution, ContributionGroup
from app.models.dormant import ChatMessage, FamilyMember, SecuritySetting
from app.models.gamification import Achievement, Challenge
from app.models.gift_card import GiftCard
from app.models.loyalty import AutoPay, Beneficiary, LoyaltyReward
from app.models.merchant import BillingLink, Merchant, MerchantSubscription, MerchantTransaction
from app.models.misc import Contact, PaymentRequest, PurchaseTransaction
from app.models.notification import Notification
from app.models.payment_link import Invoice, InvoicePayment, PaymentLink, SavedPaymentLink
from app.models.rental import Property, PropertyUnit, RentPayment, RentPaymentLink, Tenant
from app.models.user import User, UserSession
from app.models.virtual_card import VirtualCard
from app.models.wallet import Transaction, WalletCard
from app.models.webauthn import WebauthnCredential

__all__ = [
    "AdminSession",
    "AdminUser",
    "ClaimPayment",
    "Contribution",
    "ContributionGroup",
    "ChatMessage",
    "FamilyMember",
    "SecuritySetting",
    "Achievement",
    "Challenge",
    "GiftCard",
    "AutoPay",
    "Beneficiary",
    "LoyaltyReward",
    "BillingLink",
    "Merchant",
    "MerchantSubscription",
    "MerchantTransaction",
    "Contact",
    "PaymentRequest",
    "PurchaseTransaction",
    "Notification",
    "Invoice",
    "InvoicePayment",
    "PaymentLink",
    "SavedPaymentLink",
    "Property",
    "PropertyUnit",
    "RentPayment",
    "RentPaymentLink",
    "Tenant",
    "User",
    "UserSession",
    "VirtualCard",
    "Transaction",
    "WalletCard",
    "WebauthnCredential",
]
