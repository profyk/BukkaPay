"""Database-level ledger guarantees, shared by the Alembic migration and the
ORM ``create_all`` path (tests), so both schemas enforce the same rules.

* journal_entries / journal_lines are append-only.
* every journal entry balances per currency (deferred, checked at COMMIT).
* every line's currency matches its account's currency.
* balances (ledger_accounts.balance, wallet_cards.balance,
  merchants.wallet_balance) can only change while the posting engine has
  flagged the transaction with ``bukkapay.ledger_posting = 'on'`` — so no
  other code path, admin tool or ad-hoc UPDATE can edit a balance.
"""

from sqlalchemy import DDL, event

STATEMENTS: list[str] = [
    """
    CREATE OR REPLACE FUNCTION ledger_forbid_mutation() RETURNS trigger AS $$
    BEGIN
        RAISE EXCEPTION 'ledger table % is append-only; post a reversal instead', TG_TABLE_NAME;
    END
    $$ LANGUAGE plpgsql
    """,
    """
    CREATE OR REPLACE FUNCTION ledger_check_line() RETURNS trigger AS $$
    DECLARE acct_currency text;
    BEGIN
        SELECT currency INTO acct_currency FROM ledger_accounts WHERE id = NEW.account_id;
        IF acct_currency IS DISTINCT FROM NEW.currency THEN
            RAISE EXCEPTION 'journal line currency % does not match account currency %',
                NEW.currency, acct_currency;
        END IF;
        RETURN NEW;
    END
    $$ LANGUAGE plpgsql
    """,
    """
    CREATE OR REPLACE FUNCTION ledger_check_entry_balanced() RETURNS trigger AS $$
    DECLARE bad record;
    BEGIN
        SELECT currency, sum(debit) AS d, sum(credit) AS c INTO bad
        FROM journal_lines WHERE entry_id = NEW.entry_id
        GROUP BY currency HAVING sum(debit) <> sum(credit) LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'journal entry % does not balance in % (debits %, credits %)',
                NEW.entry_id, bad.currency, bad.d, bad.c;
        END IF;
        RETURN NULL;
    END
    $$ LANGUAGE plpgsql
    """,
]

STATEMENTS.append(
    """
    CREATE OR REPLACE FUNCTION ledger_guard_balance() RETURNS trigger AS $$
    BEGIN
        IF current_setting('bukkapay.ledger_posting', true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION '%.% can only be changed by a ledger posting', TG_TABLE_NAME, TG_ARGV[0];
        END IF;
        RETURN NEW;
    END
    $$ LANGUAGE plpgsql
    """
)

TRIGGERS: list[str] = [
    "DROP TRIGGER IF EXISTS trg_journal_entries_append_only ON journal_entries",
    """CREATE TRIGGER trg_journal_entries_append_only BEFORE UPDATE OR DELETE ON journal_entries
       FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation()""",
    "DROP TRIGGER IF EXISTS trg_journal_lines_append_only ON journal_lines",
    """CREATE TRIGGER trg_journal_lines_append_only BEFORE UPDATE OR DELETE ON journal_lines
       FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation()""",
    "DROP TRIGGER IF EXISTS trg_journal_lines_currency ON journal_lines",
    """CREATE TRIGGER trg_journal_lines_currency BEFORE INSERT ON journal_lines
       FOR EACH ROW EXECUTE FUNCTION ledger_check_line()""",
    "DROP TRIGGER IF EXISTS trg_journal_lines_balanced ON journal_lines",
    """CREATE CONSTRAINT TRIGGER trg_journal_lines_balanced AFTER INSERT ON journal_lines
       DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_entry_balanced()""",
    "DROP TRIGGER IF EXISTS trg_ledger_accounts_balance_guard ON ledger_accounts",
    """CREATE TRIGGER trg_ledger_accounts_balance_guard BEFORE UPDATE OF balance ON ledger_accounts
       FOR EACH ROW WHEN (OLD.balance IS DISTINCT FROM NEW.balance)
       EXECUTE FUNCTION ledger_guard_balance('balance')""",
    "DROP TRIGGER IF EXISTS trg_wallet_cards_balance_guard ON wallet_cards",
    """CREATE TRIGGER trg_wallet_cards_balance_guard BEFORE UPDATE OF balance ON wallet_cards
       FOR EACH ROW WHEN (OLD.balance IS DISTINCT FROM NEW.balance)
       EXECUTE FUNCTION ledger_guard_balance('balance')""",
    "DROP TRIGGER IF EXISTS trg_merchants_balance_guard ON merchants",
    """CREATE TRIGGER trg_merchants_balance_guard BEFORE UPDATE OF wallet_balance ON merchants
       FOR EACH ROW WHEN (OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance)
       EXECUTE FUNCTION ledger_guard_balance('wallet_balance')""",
    "DROP TRIGGER IF EXISTS trg_contribution_groups_balance_guard ON contribution_groups",
    """CREATE TRIGGER trg_contribution_groups_balance_guard BEFORE UPDATE OF current_amount ON contribution_groups
       FOR EACH ROW WHEN (OLD.current_amount IS DISTINCT FROM NEW.current_amount)
       EXECUTE FUNCTION ledger_guard_balance('current_amount')""",
]

ALL = STATEMENTS + TRIGGERS


def register_create_all_hooks(journal_lines_table) -> None:
    """Attach the DDL to ``create_all`` (runs once journal_lines exists)."""
    for stmt in ALL:
        # DDL() applies %-formatting; the plpgsql RAISE messages use literal %.
        event.listen(journal_lines_table, "after_create", DDL(stmt.replace("%", "%%")))
