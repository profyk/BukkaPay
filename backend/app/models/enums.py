"""Native Python enums backing Postgres ENUM columns. Every stringly-typed
status/type/role/category column from the old free-text schema gets one of
these (redesign principle #4). Values match the exact strings the Node app
already writes/reads, so no data transformation is needed.
"""

from enum import StrEnum


class AdminRole(StrEnum):
    """Least-privilege admin roles; permissions per role live in
    app.governance.permissions. `admin` is the legacy general role."""

    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"
    CEO = "ceo"
    FINANCE_ADMIN = "finance_admin"
    COMPLIANCE_OFFICER = "compliance_officer"
    OPERATIONS_ADMIN = "operations_admin"
    CUSTOMER_SUPPORT = "customer_support"
    MERCHANT_SUPPORT = "merchant_support"
    TECHNICAL_ADMIN = "technical_admin"
    AUDITOR = "auditor"
    RISK_ANALYST = "risk_analyst"
    KYC_ANALYST = "kyc_analyst"
    TREASURY_MANAGER = "treasury_manager"
    MARKETING_MANAGER = "marketing_manager"
    TRAVEL_MANAGER = "travel_manager"


class TransactionType(StrEnum):
    CREDIT = "credit"
    DEBIT = "debit"
    TRANSFER = "transfer"


class KycStatus(StrEnum):
    NOT_SUBMITTED = "not_submitted"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class KycDocumentType(StrEnum):
    NATIONAL_ID = "national_id"
    PASSPORT = "passport"
    DRIVER_LICENSE = "driver_license"


class PaymentRequestStatus(StrEnum):
    PENDING = "pending"
    PAID = "paid"
    DECLINED = "declined"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class MerchantBusinessType(StrEnum):
    RETAIL = "retail"
    RESTAURANT = "restaurant"
    SERVICES = "services"
    RENTAL = "rental"
    OTHER = "other"
    SME = "sme"
    TUCKSHOP = "tuckshop"
    STREET_VENDOR = "street_vendor"
    LOGISTICS = "logistics"
    ONLINE = "online"
    SCHOOL = "school"
    UTILITY = "utility"


class MerchantStaffRole(StrEnum):
    """The owner is merchants.user_id; staff roles below. `manager` is the
    legacy name for administrator and keeps the same rights."""

    MANAGER = "manager"
    ADMIN = "admin"
    FINANCE = "finance"
    CASHIER = "cashier"
    VIEWER = "viewer"


class MerchantStaffStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    REMOVED = "removed"


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
    TRAVEL = "travel"


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


class TransferPurpose(StrEnum):
    FAMILY_FRIENDS = "family_friends"
    BUSINESS = "business"
    BILLS_RENT = "bills_rent"
    SCHOOL_FEES = "school_fees"
    MEDICAL = "medical"
    GIFT = "gift"
    OTHER = "other"


class TransferZone(StrEnum):
    LOCAL = "local"
    AFRICA = "africa"
    INTERNATIONAL = "international"


class TravelMode(StrEnum):
    BUS = "bus"
    FLIGHT = "flight"
