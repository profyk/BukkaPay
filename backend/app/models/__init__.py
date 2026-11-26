"""SQLAlchemy models, one module per domain. Import order matters for
Alembic autogenerate/FK resolution, so everything is re-exported here.
"""

from app.ledger.ddl import register_create_all_hooks
from app.models.admin import AdminInvite, AdminSession, AdminUser
from app.models.board import BoardAccessLog, BoardFinancial, BoardMember, BoardSession, BoardUpdate
from app.models.cards import (
    CardAuthorization,
    CardClearing,
    CardDispute,
    CardWalletToken,
    IssuedCard,
)
from app.models.chat import ChatMessage
from app.models.claim_payment import ClaimPayment
from app.models.closure import ClosedAccount
from app.models.contribution import Contribution, ContributionGroup
from app.models.dormant import FamilyMember, SecuritySetting
from app.models.gamification import Achievement, Challenge
from app.models.ledger import (
    CustodianBalanceSnapshot,
    FundingRequest,
    IdempotencyRecord,
    JournalEntry,
    JournalLine,
    LedgerAccount,
    WithdrawalRequest,
)
from app.models.legal import LegalDocument, LegalDocumentVersion
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
from app.models.org import Department
from app.models.payment_link import Invoice, InvoicePayment, PaymentLink, SavedPaymentLink
from app.models.payouts import Payout, PayoutRecipient
from app.models.platform import (
    ApprovalRequest,
    AuditLog,
    ComplianceCase,
    ContributionPayout,
    Country,
    CountryCurrency,
    CountryCustodian,
    Custodian,
    Enquiry,
    FeeSchedule,
    FxQuote,
    MerchantApiKey,
    MerchantQrCode,
    MerchantWebhookEndpoint,
    OutboxEvent,
    PaymentCorridor,
    PaymentProvider,
    ProviderCountry,
    ProviderWebhook,
    ReconciliationItem,
    ReconciliationRun,
    RiskEvent,
    ScreeningResult,
    TransactionLimit,
    Transfer,
)
from app.models.push import NotificationPreference, PushDevice
from app.models.reference import Currency
from app.models.rental import Property, PropertyUnit, RentPayment, RentPaymentLink, Tenant
from app.models.revenue import AccountFeeCharge, Agent, AgentTransaction, PricingSetting
from app.models.settlement import SettlementBatch, SettlementLine
from app.models.support import SupportTicket, TicketMessage
from app.models.trade import (
    EscrowContract,
    EscrowEvent,
    TradeInvoice,
    TradeInvoiceItem,
    TradeReceipt,
)
from app.models.travel import TravelDeparture, TravelOperator, TravelRoute
from app.models.user import User, UserSession
from app.models.virtual_card import VirtualCard
from app.models.wallet import CurrencyCorridor, InternationalTransfer, Transaction, WalletCard
from app.models.webauthn import WebauthnCredential
from app.models.website import SiteContent, WaitlistSignup

register_create_all_hooks(JournalLine.__table__)

__all__ = [
    "AccountFeeCharge",
    "ClosedAccount",
    "Department",
    "BoardAccessLog",
    "BoardFinancial",
    "BoardMember",
    "BoardSession",
    "BoardUpdate",
    "Agent",
    "AgentTransaction",
    "PricingSetting",
    "SettlementBatch",
    "SettlementLine",
    "SupportTicket",
    "TicketMessage",
    "SiteContent",
    "WaitlistSignup",
    "LegalDocument",
    "LegalDocumentVersion",
    "CardAuthorization",
    "CardClearing",
    "CardDispute",
    "CardWalletToken",
    "IssuedCard",
    "Enquiry",
    "ApprovalRequest",
    "AuditLog",
    "ComplianceCase",
    "ContributionPayout",
    "Country",
    "CountryCurrency",
    "CountryCustodian",
    "Custodian",
    "FeeSchedule",
    "FxQuote",
    "MerchantApiKey",
    "MerchantQrCode",
    "MerchantWebhookEndpoint",
    "OutboxEvent",
    "PaymentCorridor",
    "PaymentProvider",
    "ProviderCountry",
    "ProviderWebhook",
    "ReconciliationItem",
    "ReconciliationRun",
    "RiskEvent",
    "ScreeningResult",
    "TransactionLimit",
    "Transfer",
    "Currency",
    "FundingRequest",
    "IdempotencyRecord",
    "JournalEntry",
    "JournalLine",
    "CustodianBalanceSnapshot",
    "TradeInvoice",
    "TradeInvoiceItem",
    "EscrowContract",
    "EscrowEvent",
    "TradeReceipt",
    "LedgerAccount",
    "WithdrawalRequest",
    "Achievement",
    "AdminSession",
    "AdminUser",
    "AdminInvite",
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
    "NotificationPreference",
    "PushDevice",
    "Payout",
    "PayoutRecipient",
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
