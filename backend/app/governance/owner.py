"""The platform owner is the one and only super admin, forever.

Enforced three times: here (service checks with clear errors), in the
database (trigger + unique index from migration 0024, so no script, console
query or future bug can create a second super admin or remove the owner),
and in the admin panel (Super Admin is never offered as a role)."""

OWNER_EMAIL = "profykersha18@gmail.com"


def is_owner_email(email: str | None) -> bool:
    return (email or "").strip().lower() == OWNER_EMAIL
