"""Admin role → permission map (least privilege).

Permissions are coarse verbs on areas. `*.view` is read-only; `*.manage`
changes configuration; approvals are a separate permission so the person
who proposes a high-risk change cannot also be the only one able to apply
it. The master API key (machine access) is treated as super admin.
"""

ALL_PERMISSIONS = {
    "dashboard.view",
    "users.view", "users.manage", "users.freeze",
    "kyc.view", "kyc.review",
    "wallets.view", "wallets.restrict",
    "transactions.view",
    "merchants.view", "merchants.manage", "merchants.kyb_review",
    "network.view", "network.manage",          # countries, currencies, custodians, providers, corridors
    "fees.view", "fees.manage",
    "fx.view", "fx.manage",
    "ledger.view", "ledger.adjust_request",
    "approvals.view", "approvals.decide",
    "reconciliation.view", "reconciliation.run", "reconciliation.resolve",
    "compliance.view", "compliance.manage",
    "support.view", "support.manage",
    "audit.view",
    "admins.manage",
    "webhooks.view",
    "broadcast.send",
    "travel.manage",
    "website.view", "website.manage",
    # Drafting legal documents is separate from publishing them: publishing
    # changes what customers agree to.
    "legal.view", "legal.manage", "legal.publish",
}

_VIEW_ALL = {p for p in ALL_PERMISSIONS if p.endswith(".view")}

ROLE_LABELS: dict[str, str] = {
    "super_admin": "Super Admin", "ceo": "CEO", "admin": "Admin", "finance_admin": "Finance Admin",
    "compliance_officer": "Compliance Officer", "operations_admin": "Operations Admin",
    "customer_support": "Customer Support", "merchant_support": "Merchant Support",
    "technical_admin": "Technical Admin", "auditor": "Auditor",
}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "super_admin": set(ALL_PERMISSIONS),
    "ceo": _VIEW_ALL | {"approvals.decide"},
    "finance_admin": _VIEW_ALL | {
        "fees.manage", "fx.manage", "ledger.adjust_request", "approvals.decide",
        "reconciliation.run", "reconciliation.resolve",
    },
    "compliance_officer": _VIEW_ALL | {
        "kyc.review", "merchants.kyb_review", "compliance.manage", "users.freeze", "wallets.restrict",
        "approvals.decide", "legal.manage", "legal.publish",
    },
    "operations_admin": _VIEW_ALL | {
        "network.manage", "users.manage", "merchants.manage", "wallets.restrict", "users.freeze",
        "broadcast.send", "travel.manage", "support.manage", "website.manage", "legal.manage",
    },
    "customer_support": {
        "dashboard.view", "users.view", "kyc.view", "wallets.view", "transactions.view", "support.view",
        "support.manage",
    },
    "merchant_support": {
        "dashboard.view", "merchants.view", "transactions.view", "support.view", "support.manage",
    },
    "technical_admin": {"dashboard.view", "network.view", "webhooks.view", "audit.view", "reconciliation.view"},
    "auditor": _VIEW_ALL,
    # Legacy general-purpose role from before least-privilege roles existed.
    "admin": _VIEW_ALL | {
        "users.manage", "users.freeze", "kyc.review", "wallets.restrict", "merchants.manage",
        "merchants.kyb_review", "broadcast.send", "travel.manage", "support.manage", "website.manage",
    },
}


def permissions_for(role: str | None, *, is_master_key: bool = False) -> set[str]:
    if is_master_key:
        return set(ALL_PERMISSIONS)
    return ROLE_PERMISSIONS.get(role or "", set())
