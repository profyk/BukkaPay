"""Row-level security: deny-by-default for Supabase's API roles.

The database sits in a Supabase project, and Supabase publishes every table
in `public` through its REST and GraphQL APIs to the `anon` and
`authenticated` roles. The anon key ships inside the apps, so a table
without RLS would be readable (and writable) by anyone who has the app.

No client talks to these tables through Supabase: all data goes through the
BukkaPay API, which enforces ownership, PINs, limits and the ledger. So the
policy is simply "no policies": RLS is enabled on every table and the API
roles get nothing. The backend connects as the role that owns the tables,
and table owners bypass RLS (it is enabled, not FORCEd), so the API is
unaffected.

`bukkapay_enable_rls()` is idempotent. Migration 0022 installs and runs it,
an event trigger re-runs it for every table created later, and the test
suite runs with it on, which proves the API works under RLS.
"""

FUNCTION = r"""
CREATE OR REPLACE FUNCTION bukkapay_enable_rls() RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
    t record;
    r text;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND pg_get_userbyid(c.relowner) = current_user
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
        FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
                EXECUTE format('REVOKE ALL ON public.%I FROM %I', t.relname, r);
            END IF;
        END LOOP;
    END LOOP;
    -- Sequences and functions too: nothing in public is for the API roles.
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
        END IF;
    END LOOP;
END
$fn$;
"""

ENABLE = "SELECT bukkapay_enable_rls()"

# Event triggers need superuser on plain Postgres (Supabase allows them for
# `postgres`). Where it can't be created, every migration that adds a table
# must end with ENABLE instead, and tests/test_rls.py catches a miss.
EVENT_TRIGGER = r"""
DO $do$
BEGIN
    CREATE OR REPLACE FUNCTION bukkapay_rls_on_create() RETURNS event_trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
        PERFORM bukkapay_enable_rls();
    END
    $fn$;
    DROP EVENT TRIGGER IF EXISTS bukkapay_rls_on_create;
    CREATE EVENT TRIGGER bukkapay_rls_on_create ON ddl_command_end
        WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
        EXECUTE FUNCTION bukkapay_rls_on_create();
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'bukkapay: no privilege for an event trigger; new tables need bukkapay_enable_rls()';
END
$do$;
"""
