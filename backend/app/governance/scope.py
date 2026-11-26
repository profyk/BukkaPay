"""Country scope for staff. An admin with `country_scope = ["KE", "UG"]` sees
and acts on customers, merchants, agents and tickets from those countries
only; an empty scope means every country (the owner, executives, central
teams). Enforced on the server, not just hidden in the UI."""

from __future__ import annotations

from sqlalchemy import select

from app.core.errors import ApiError


def countries(ctx) -> list[str] | None:
    """None = unrestricted."""
    admin = getattr(ctx, "admin", None)
    if admin is None:  # master key (setup only)
        return None
    scope = [c.upper() for c in (admin.country_scope or []) if c]
    return scope or None


def filter(stmt, ctx, column):
    """Limit a query to the admin's countries (no-op when unrestricted)."""
    scope = countries(ctx)
    return stmt if scope is None else stmt.where(column.in_(scope))


def filter_by_user(stmt, ctx, user_id_column):
    """For rows that belong to a customer (tickets, transactions): the
    customer's country of residence decides."""
    from app.models.user import User

    scope = countries(ctx)
    if scope is None:
        return stmt
    return stmt.where(user_id_column.in_(select(User.id).where(User.residence_country.in_(scope))))


def require(ctx, country: str | None) -> None:
    scope = countries(ctx)
    if scope is not None and (country or "").upper() not in scope:
        raise ApiError("This is outside the countries you cover", status_code=403)
