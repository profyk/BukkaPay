"""Native Python enums backing Postgres ENUM columns. Every stringly-typed
status/type/role/category column from the old free-text schema gets one of
these (redesign principle #4). Values match the exact strings the Node app
already writes/reads, so no data transformation is needed.
"""

from enum import StrEnum


class AdminRole(StrEnum):
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class TransactionType(StrEnum):
    CREDIT = "credit"
    DEBIT = "debit"
    TRANSFER = "transfer"


class PaymentRequestStatus(StrEnum):
    PENDING = "pending"
    PAID = "paid"
    DECLINED = "declined"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class BillSplitStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class MerchantBusinessType(StrEnum):
    RETAIL = "retail"
    RESTAURANT = "restaurant"
    SERVICES = "services"
    RENTAL = "rental"
    OTHER = "other"


class MerchantTransactionType(StrEnum):
    PAYMENT = "payment"
    REFUND = "refund"
    WITHDRAWAL = "withdrawal"


class MerchantTransactionStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class BillingLinkStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class SubscriptionPlan(StrEnum):
    STARTER = "starter"
    PRO = "pro"
    BUSINESS = "business"


class SubscriptionStatus(StrEnum):
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELLED = "cancelled"


class PropertyType(StrEnum):
    APARTMENT = "apartment"
    HOUSE = "house"
    COMMERCIAL = "commercial"
    OTHER = "other"


class RentPaymentMethod(StrEnum):
    WALLET = "wallet"
    CARD = "card"
    STITCH = "stitch"


class RentPaymentStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class LinkStatus(StrEnum):
    PENDING = "pending"
    PAID = "paid"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class GiftCardStatus(StrEnum):
    PENDING = "pending"
    REDEEMED = "redeemed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class ClaimPaymentStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class ClaimMethod(StrEnum):
    WALLET = "wallet"
    BANK = "bank"
    CASH = "cash"


class PickupStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"


class PaymentLinkType(StrEnum):
    PERSONAL = "personal"
    BUSINESS = "business"


class PaymentLinkRegion(StrEnum):
    LOCAL = "local"
    INTERNATIONAL = "international"


class PaymentLinkDestination(StrEnum):
    WALLET = "wallet"
    BANK = "bank"


class PaymentLinkStatus(StrEnum):
    PENDING = "pending"
    PARTIAL = "partial"
    PAID = "paid"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class InvoicePaymentStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


class InvoicePaymentMethod(StrEnum):
    CARD = "card"
    WALLET = "wallet"
    STITCH = "stitch"


class LinkType(StrEnum):
    PAYMENT = "payment"
    INVOICE = "invoice"
    BILLING = "billing"


class DocumentType(StrEnum):
    INVOICE = "invoice"
    RECEIPT = "receipt"


class PurchaseCategory(StrEnum):
    AIRTIME = "airtime"
    ELECTRICITY = "electricity"
    TICKET = "ticket"
    HOTEL = "hotel"
    RENTAL = "rental"
    MARKETPLACE = "marketplace"
    CONTRIBUTION = "contribution"
    TRANSFER = "transfer"


class PurchaseStatus(StrEnum):
    SUCCESS = "success"
    PENDING = "pending"
    FAILED = "failed"
    REFUNDED = "refunded"


class ContributionCategory(StrEnum):
    MEDICAL = "medical"
    EDUCATION = "education"
    EVENT = "event"
    EMERGENCY = "emergency"
    COMMUNITY = "community"
    OTHER = "other"


class AutoPayFrequency(StrEnum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class NotificationType(StrEnum):
    INFO = "info"
    SUCCESS = "success"
    ALERT = "alert"
    WARNING = "warning"
    ERROR = "error"
