"""Database guard: the platform owner is the one and only super admin.

Used by migration 0024 and by the test schema, so tests exercise the exact
SQL production runs."""

from app.governance.owner import OWNER_EMAIL

OWNER = OWNER_EMAIL

SINGLE_SUPER_ADMIN_INDEX = (
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_single_super_admin "
    "ON admin_users (role) WHERE role = 'super_admin'"
)

FUNCTION = f"""
CREATE OR REPLACE FUNCTION bukkapay_admin_owner_guard() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF lower(OLD.email) = '{OWNER}' THEN
            RAISE EXCEPTION 'The platform owner cannot be deleted' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.role = 'super_admin' AND lower(NEW.email) <> '{OWNER}' THEN
        RAISE EXCEPTION 'Only the platform owner can be super admin' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND lower(OLD.email) = '{OWNER}' THEN
        IF lower(NEW.email) <> '{OWNER}' THEN
            RAISE EXCEPTION 'The platform owner''s email cannot be changed' USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.role = 'super_admin' AND (NEW.role <> 'super_admin' OR NOT NEW.is_active) THEN
            RAISE EXCEPTION 'The platform owner cannot be demoted or deactivated' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END
$fn$
"""

DROP_TRIGGER = "DROP TRIGGER IF EXISTS trg_admin_owner_guard ON admin_users"

TRIGGER = """
CREATE TRIGGER trg_admin_owner_guard
BEFORE INSERT OR UPDATE OR DELETE ON admin_users
FOR EACH ROW EXECUTE FUNCTION bukkapay_admin_owner_guard()
"""

INVITES_NOT_SUPER = (
    "ALTER TABLE admin_invites ADD CONSTRAINT ck_admin_invites_not_super CHECK (role <> 'super_admin')"
)
