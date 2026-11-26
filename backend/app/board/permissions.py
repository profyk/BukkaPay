"""Boardroom roles and permissions. Deny by default.

A member's permissions = their role's set + their personal grants − their
personal denies. The owner (the company's sole super administrator) holds
every permission. A role is always read from the database, never from the
request. Boardroom permissions don't overlap with admin permissions in any
way: no Boardroom session is accepted by the operational admin API.
"""

from __future__ import annotations

from app.models.board import BoardMember

ROLES = {
    "chair": "Board Chairperson",
    "executive_director": "Executive Director",
    "non_executive_director": "Non-Executive Director",
    "investor": "Investor",
    "shareholder": "Shareholder",
    "financial_observer": "Financial Observer",
}
OWNER_ROLE = "super_admin"  # shown as "Company Super Administrator"; only the owner, never assignable
OWNER_LABEL = "Company Super Administrator"

PERMISSIONS = {
    # reading
    "dashboard.view": "Executive dashboard (approved company KPIs)",
    "reports.view": "Published reports and financial summaries",
    "adoption.view": "Customer and merchant growth",
    "analytics.view": "Transaction, currency and wallet analytics",
    "revenue.view": "Revenue by stream, currency and country",
    "financials.view": "Profit and loss, balance sheet, cash flow, budgets",
    "crossborder.view": "Cross-border corridors and transfers",
    "pos.view": "Card and POS payments",
    "fx.view": "Currency conversions and FX revenue",
    "custodians.view": "Custodian balances and reconciliations",
    "countries.view": "Country performance and expansion",
    "fundraising.view": "Funding rounds and progress",
    "investments.own": "My own investments and shareholding",
    "investors.view": "Every investor's records and the share register",
    "use_of_funds.view": "Capital allocation and spending",
    "milestones.view": "Strategic milestones and partnerships",
    "risks.view": "Risk register and company health",
    "governance.view": "Board meetings, agendas and minutes",
    "resolutions.view": "Resolutions and results",
    "resolutions.vote": "Vote on resolutions they're eligible for",
    "documents.view": "Document library (each file has its own audience)",
    "announcements.view": "Company announcements",
    "insights.view": "AI-assisted summaries of approved data",
    # managing
    "meetings.manage": "Schedule meetings, agendas, attendance, minutes",
    "resolutions.manage": "Create, open and conclude resolutions",
    "documents.manage": "Upload and archive documents",
    "announcements.manage": "Write and publish announcements",
    "milestones.manage": "Record milestones and partnership progress",
    "risks.manage": "Maintain the risk register",
    "custodians.record": "Record custodian statements and reconciliations",
    "use_of_funds.propose": "Propose budget changes and record spending",
    "use_of_funds.approve": "Approve budget changes",
    "investors.manage": "Investor records, rounds and the share register",
    "reports.publish": "Freeze, approve and publish reports",
    "financials.manage": "Management accounts, budgets, periods and targets",
    "users.manage": "Invite, suspend and assign roles",
    "audit.view": "Boardroom audit trail and access history",
}

_READ_INVESTOR = {"dashboard.view", "reports.view", "adoption.view", "analytics.view", "fundraising.view",
                  "investments.own", "documents.view", "announcements.view"}
_READ_DIRECTOR = _READ_INVESTOR | {
    "revenue.view", "financials.view", "crossborder.view", "pos.view", "fx.view", "custodians.view",
    "countries.view", "investors.view", "use_of_funds.view", "milestones.view", "risks.view", "governance.view",
    "resolutions.view", "resolutions.vote", "insights.view"}

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "investor": frozenset(_READ_INVESTOR),
    "shareholder": frozenset(_READ_INVESTOR | {"resolutions.view", "resolutions.vote"}),
    "non_executive_director": frozenset(_READ_DIRECTOR),
    "executive_director": frozenset(_READ_DIRECTOR | {
        "announcements.manage", "milestones.manage", "risks.manage", "custodians.record", "use_of_funds.propose",
        "documents.manage"}),
    "chair": frozenset(_READ_DIRECTOR | {"meetings.manage", "resolutions.manage", "documents.manage",
                                         "audit.view", "use_of_funds.approve"}),
    # Only what the owner grants them, item by item.
    "financial_observer": frozenset(),
}
# Investors and shareholders keep their own records private; this permission
# lets someone see other investors' records, so it is director-level only.
_NEVER_GRANTABLE_TO = {"investor": {"investors.view", "investors.manage", "users.manage"},
                       "shareholder": {"investors.view", "investors.manage", "users.manage"},
                       "financial_observer": {"investors.manage", "users.manage"}}
# Never grantable to anyone but the owner.
OWNER_ONLY = frozenset({"users.manage", "reports.publish", "investors.manage", "financials.manage"})


def is_owner(m: BoardMember) -> bool:
    from app.board.service import is_owner as _is_owner

    return _is_owner(m)


def role_of(m: BoardMember) -> str:
    return OWNER_ROLE if is_owner(m) else (m.role if m.role in ROLES else "financial_observer")


def permissions_of(m: BoardMember) -> frozenset[str]:
    if is_owner(m):
        return frozenset(PERMISSIONS)
    role = role_of(m)
    base = set(ROLE_PERMISSIONS.get(role, frozenset()))
    blocked = OWNER_ONLY | _NEVER_GRANTABLE_TO.get(role, set())
    base |= {p for p in (m.permission_grants or []) if p in PERMISSIONS and p not in blocked}
    base -= set(m.permission_denies or [])
    return frozenset(base)


def can(m: BoardMember, permission: str) -> bool:
    return permission in permissions_of(m)


def validate_role(role: str) -> str:
    from app.core.errors import ApiError

    if role not in ROLES:
        raise ApiError("Choose one of the Boardroom roles", status_code=422)
    return role


def validate_grants(role: str, grants: list[str] | None, denies: list[str] | None) -> tuple[list[str], list[str]]:
    from app.core.errors import ApiError

    grants, denies = sorted(set(grants or [])), sorted(set(denies or []))
    unknown = [p for p in grants + denies if p not in PERMISSIONS]
    if unknown:
        raise ApiError(f"Unknown permission: {unknown[0]}", status_code=422)
    blocked = [p for p in grants if p in OWNER_ONLY or p in _NEVER_GRANTABLE_TO.get(role, set())]
    if blocked:
        raise ApiError(f"{blocked[0]} can't be given to a {ROLES[role]}", status_code=422)
    return grants, denies


def audience_ok(m: BoardMember, audience: list | None) -> bool:
    """A document/report/announcement audience: list of roles; empty = all members."""
    if is_owner(m):
        return True
    return not audience or role_of(m) in audience


def catalogue() -> dict:
    return {
        "roles": [{"code": k, "label": v, "permissions": sorted(ROLE_PERMISSIONS[k])} for k, v in ROLES.items()],
        "permissions": [{"code": k, "label": v, "ownerOnly": k in OWNER_ONLY} for k, v in PERMISSIONS.items()],
    }
