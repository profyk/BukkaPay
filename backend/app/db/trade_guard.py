"""Database guards for trade records: escrow history and trade receipts are
append-only (reuses the ledger's ledger_forbid_mutation() function).
Used by migration 0030 and the test schema."""

TRIGGERS = [
    "DROP TRIGGER IF EXISTS trg_escrow_events_append_only ON escrow_events",
    "CREATE TRIGGER trg_escrow_events_append_only BEFORE UPDATE OR DELETE ON escrow_events "
    "FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation()",
    "DROP TRIGGER IF EXISTS trg_trade_receipts_append_only ON trade_receipts",
    "CREATE TRIGGER trg_trade_receipts_append_only BEFORE UPDATE OR DELETE ON trade_receipts "
    "FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation()",
]
