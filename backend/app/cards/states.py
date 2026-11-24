"""Declared lifecycles for cards, card authorizations and disputes. Every
change goes through `.move()` (app.core.state_machine), which refuses
undeclared transitions and writes an audit row."""

from app.core.state_machine import machine

CARD = machine("card", {
    "pending_kyc": {"requested", "active", "failed", "cancelled"},
    "requested": {"active", "failed", "cancelled"},
    "active": {"frozen", "cancelled"},
    "frozen": {"active", "cancelled"},
}, terminal={"cancelled", "failed"})

# An authorization's hold: approved → captured (cleared), reversed (merchant
# cancelled) or expired (never cleared). Declines are final when created.
AUTHORIZATION = machine("card_authorization", {
    "approved": {"captured", "reversed", "expired"},
}, terminal={"captured", "reversed", "expired", "declined"})

DISPUTE = machine("card_dispute", {
    "opened": {"submitted", "withdrawn", "won", "lost"},
    "submitted": {"won", "lost", "withdrawn"},
}, terminal={"won", "lost", "withdrawn"})
