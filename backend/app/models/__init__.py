"""SQLAlchemy models, one module per domain. Import order matters for
Alembic autogenerate/FK resolution, so everything is re-exported here.
"""

from app.models.admin import AdminSession, AdminUser
from app.models.chat import ChatMessage
from app.models.claim_payment import ClaimPayment
from app.models.contribution import Contribution, ContributionGroup
from app.models.dormant import FamilyMember, SecuritySetting
from app.models.gamification import Achievement, Challenge
from app.models.loyalty import AutoPay, Beneficiary, LoyaltyReward
from app.models.merchant import (
    BillingLink,
    Merchant,
    MerchantStaff,
    MerchantSubscription,
    MerchantTransaction,
)
from app.models.misc import Contact, PaymentRequest, PurchaseTransaction
from app.models.notification import Notification
from app.models.payment_link import Invoice, InvoicePayment, PaymentLink, SavedPaymentLink
from app.models.rental import Property, PropertyUnit, RentPayment, RentPaymentLink, Tenant
from app.models.travel import TravelDeparture, TravelOperator, TravelRoute
from app.models.user import User, UserSession
from app.models.virtual_card import VirtualCard
from app.models.wallet import CurrencyCorridor, InternationalTransfer, Transaction, WalletCard
from app.models.webauthn import WebauthnCredential

__all__ = [
    "Achievement",
    "AdminSession",
    "AdminUser",
    "AutoPay",
    "Beneficiary",
    "BillingLink",
    "Challenge",
    "ChatMessage",
    "ClaimPayment",
    "Contact",
    "Contribution",
    "ContributionGroup",
    "CurrencyCorridor",
    "FamilyMember",
    "InternationalTransfer",
    "Invoice",
    "InvoicePayment",
    "LoyaltyReward",
    "Merchant",
    "MerchantStaff",
    "MerchantSubscription",
    "MerchantTransaction",
    "Notification",
    "PaymentLink",
    "PaymentRequest",
    "Property",
    "PropertyUnit",
    "PurchaseTransaction",
    "RentPayment",
    "RentPaymentLink",
    "SavedPaymentLink",
    "SecuritySetting",
    "Tenant",
    "Transaction",
    "TravelDeparture",
    "TravelOperator",
    "TravelRoute",
    "User",
    "UserSession",
    "VirtualCard",
    "WalletCard",
    "WebauthnCredential",
]
