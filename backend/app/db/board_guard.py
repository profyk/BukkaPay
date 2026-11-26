"""Database guards for the Boardroom (migration 0045 and the test schema).

* boardroom_audit_logs and board_resolution_votes are append-only.
* A published report can't be edited or deleted; the only change allowed is
  its status moving to 'superseded' or 'withdrawn' (a correction is a new
  version that points at it).
* A concluded resolution can't change or be deleted.
* Published minutes can't change or be deleted.
"""

FUNCTIONS = [
    r"""
CREATE OR REPLACE FUNCTION boardroom_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END
$fn$""",
    r"""
CREATE OR REPLACE FUNCTION boardroom_report_immutable() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF OLD.status IN ('published', 'superseded', 'withdrawn') THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'A published report cannot be deleted' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.methodology IS DISTINCT FROM OLD.methodology
           OR NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end
           OR NEW.title IS DISTINCT FROM OLD.title OR NEW.summary IS DISTINCT FROM OLD.summary
           OR NEW.version IS DISTINCT FROM OLD.version OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
           OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.reporting_currency IS DISTINCT FROM OLD.reporting_currency
           OR NEW.audience IS DISTINCT FROM OLD.audience
           OR (OLD.status = 'published' AND NEW.status NOT IN ('published', 'superseded', 'withdrawn'))
           OR (OLD.status IN ('superseded', 'withdrawn') AND NEW.status IS DISTINCT FROM OLD.status) THEN
            RAISE EXCEPTION 'A published report cannot be changed; publish a corrected version'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
$fn$""",
    r"""
CREATE OR REPLACE FUNCTION boardroom_resolution_final() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF OLD.status = 'concluded' THEN
        RAISE EXCEPTION 'A concluded resolution is a permanent record' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
$fn$""",
    r"""
CREATE OR REPLACE FUNCTION boardroom_minutes_final() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF OLD.status = 'published' THEN
        RAISE EXCEPTION 'Published minutes cannot be changed' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
$fn$""",
]

TRIGGERS = [
    "DROP TRIGGER IF EXISTS trg_boardroom_audit_append_only ON boardroom_audit_logs",
    "CREATE TRIGGER trg_boardroom_audit_append_only BEFORE UPDATE OR DELETE ON boardroom_audit_logs "
    "FOR EACH ROW EXECUTE FUNCTION boardroom_append_only()",
    "DROP TRIGGER IF EXISTS trg_board_votes_append_only ON board_resolution_votes",
    "CREATE TRIGGER trg_board_votes_append_only BEFORE UPDATE OR DELETE ON board_resolution_votes "
    "FOR EACH ROW EXECUTE FUNCTION boardroom_append_only()",
    "DROP TRIGGER IF EXISTS trg_board_reports_immutable ON board_report_publications",
    "CREATE TRIGGER trg_board_reports_immutable BEFORE UPDATE OR DELETE ON board_report_publications "
    "FOR EACH ROW EXECUTE FUNCTION boardroom_report_immutable()",
    "DROP TRIGGER IF EXISTS trg_board_resolutions_final ON board_resolutions",
    "CREATE TRIGGER trg_board_resolutions_final BEFORE UPDATE OR DELETE ON board_resolutions "
    "FOR EACH ROW EXECUTE FUNCTION boardroom_resolution_final()",
    "DROP TRIGGER IF EXISTS trg_board_minutes_final ON board_minutes",
    "CREATE TRIGGER trg_board_minutes_final BEFORE UPDATE OR DELETE ON board_minutes "
    "FOR EACH ROW EXECUTE FUNCTION boardroom_minutes_final()",
]

STATEMENTS = FUNCTIONS + TRIGGERS
