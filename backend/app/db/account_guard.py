"""Database guard: admins and customer/business accounts never share an email.

Used by migration 0027 and by the test schema."""

from app.governance.owner import OWNER_EMAIL

ACCOUNT_TYPE_CHECK = (
    "ALTER TABLE users ADD CONSTRAINT ck_users_account_type CHECK (account_type IN ('personal', 'business'))"
)

FUNCTION = f"""
CREATE OR REPLACE FUNCTION bukkapay_separate_admin_and_user_emails() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    IF TG_OP = 'UPDATE' AND lower(NEW.email) = lower(OLD.email) THEN
        RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'users' THEN
        IF EXISTS (SELECT 1 FROM admin_users a WHERE lower(a.email) = lower(NEW.email)) THEN
            RAISE EXCEPTION 'This email belongs to an admin account' USING ERRCODE = 'unique_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'admin_users' THEN
        -- The owner's admin row may predate this rule; everyone else is strict.
        IF lower(NEW.email) <> '{OWNER_EMAIL}'
           AND EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(NEW.email)) THEN
            RAISE EXCEPTION 'This email belongs to a customer or business account' USING ERRCODE = 'unique_violation';
        END IF;
    END IF;
    RETURN NEW;
END
$fn$
"""

TRIGGERS = [
    "DROP TRIGGER IF EXISTS trg_users_not_admin_email ON users",
    "CREATE TRIGGER trg_users_not_admin_email BEFORE INSERT OR UPDATE OF email ON users "
    "FOR EACH ROW EXECUTE FUNCTION bukkapay_separate_admin_and_user_emails()",
    "DROP TRIGGER IF EXISTS trg_admin_users_not_user_email ON admin_users",
    "CREATE TRIGGER trg_admin_users_not_user_email BEFORE INSERT OR UPDATE OF email ON admin_users "
    "FOR EACH ROW EXECUTE FUNCTION bukkapay_separate_admin_and_user_emails()",
]
