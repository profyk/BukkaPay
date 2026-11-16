"""Visa cards on every wallet, via a licensed issuer-processor; and the
individual-seller merchant tier.

* issued_cards, card_wallet_tokens (Apple/Google/Samsung Pay tap-to-pay),
  card_authorizations (real-time holds) and card_clearings.
* wallet_cards.card_number becomes nullable. Those numbers were generated
  locally, not issued by any card network, so they never worked at a
  merchant. Nothing writes or returns them any more; the columns are kept
  (encrypted) until a later migration drops them.

* merchants.verification_tier: "business" (full KYB, existing merchants)
  or "individual" (street vendors, tuck shops, individual landlords
  verified through the owner's own ID instead of business documents),
  capped by a new "merchant_individual" transaction limit (ZA/ZAR default
  seeded below; admins set it per country).

No backfill here: the worker's issue_pending_cards sweep issues a card for
every existing wallet whose owner has passed KYC, in bounded batches.

Revision ID: 0019_card_issuing
Revises: 0018_enquiries
Create Date: 2026-11-16
"""

from alembic import op

revision = "0019_card_issuing"
down_revision = "0018_enquiries"
branch_labels = None
depends_on = None

CREATE = [
    """
CREATE TABLE issued_cards (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	wallet_card_id UUID NOT NULL,
	user_id UUID NOT NULL,
	issuer VARCHAR(40) NOT NULL,
	issuer_card_id VARCHAR(120),
	network VARCHAR(10) NOT NULL,
	form VARCHAR(10) NOT NULL,
	status VARCHAR(12) NOT NULL,
	billing_currency VARCHAR(3) NOT NULL,
	last4 VARCHAR(4),
	exp_month INTEGER,
	exp_year INTEGER,
	cardholder_name TEXT NOT NULL,
	controls JSONB NOT NULL,
	failure_reason TEXT,
	frozen_reason VARCHAR(12),
	overdraft_outstanding NUMERIC(20, 2) NOT NULL,
	cancelled_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_issued_cards_status CHECK (status IN ('pending_kyc','requested','active','frozen','cancelled','failed')),
	CONSTRAINT ck_issued_cards_network CHECK (network IN ('visa')),
	CONSTRAINT ck_issued_cards_form CHECK (form IN ('virtual','physical')),
	CONSTRAINT uq_issued_cards_issuer_card UNIQUE (issuer, issuer_card_id),
	FOREIGN KEY(wallet_card_id) REFERENCES wallet_cards (id) ON DELETE RESTRICT,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE RESTRICT,
	FOREIGN KEY(billing_currency) REFERENCES currencies (code) ON DELETE RESTRICT
)
    """,
    """
CREATE INDEX ix_issued_cards_user_id ON issued_cards (user_id)
    """,
    """
CREATE INDEX ix_issued_cards_wallet_card_id ON issued_cards (wallet_card_id)
    """,
    """
CREATE UNIQUE INDEX uq_issued_cards_one_live_per_wallet ON issued_cards (wallet_card_id) WHERE status NOT IN ('cancelled','failed')
    """,
    """
CREATE TABLE card_wallet_tokens (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	issued_card_id UUID NOT NULL,
	issuer VARCHAR(40) NOT NULL,
	issuer_token_id VARCHAR(120) NOT NULL,
	wallet VARCHAR(12) NOT NULL,
	status VARCHAR(10) NOT NULL,
	device_name TEXT,
	token_last4 VARCHAR(4),
	deleted_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_card_wallet_tokens_wallet CHECK (wallet IN ('apple_pay','google_pay','samsung_pay')),
	CONSTRAINT ck_card_wallet_tokens_status CHECK (status IN ('requested','active','suspended','deleted')),
	CONSTRAINT uq_card_wallet_tokens_issuer_token UNIQUE (issuer, issuer_token_id),
	FOREIGN KEY(issued_card_id) REFERENCES issued_cards (id) ON DELETE RESTRICT
)
    """,
    """
CREATE INDEX ix_card_wallet_tokens_issued_card_id ON card_wallet_tokens (issued_card_id)
    """,
    """
CREATE TABLE card_authorizations (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	issued_card_id UUID NOT NULL,
	issuer VARCHAR(40) NOT NULL,
	issuer_authorization_id VARCHAR(120) NOT NULL,
	status VARCHAR(10) NOT NULL,
	currency VARCHAR(3) NOT NULL,
	amount NUMERIC(20, 2) NOT NULL,
	fee NUMERIC(20, 2) NOT NULL,
	held_amount NUMERIC(20, 2) NOT NULL,
	captured_amount NUMERIC(20, 2) NOT NULL,
	merchant_amount NUMERIC(20, 2),
	merchant_currency VARCHAR(3),
	merchant_name TEXT,
	merchant_mcc VARCHAR(4),
	merchant_country VARCHAR(2),
	channel VARCHAR(14) NOT NULL,
	wallet_token_id UUID,
	decline_reason VARCHAR(40),
	fee_breakdown JSONB,
	hold_entry_id UUID,
	hold_expires_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_card_auth_status CHECK (status IN ('approved','declined','reversed','captured','expired')),
	CONSTRAINT uq_card_auth_issuer_id UNIQUE (issuer, issuer_authorization_id),
	FOREIGN KEY(issued_card_id) REFERENCES issued_cards (id) ON DELETE RESTRICT,
	FOREIGN KEY(wallet_token_id) REFERENCES card_wallet_tokens (id) ON DELETE SET NULL,
	FOREIGN KEY(hold_entry_id) REFERENCES journal_entries (id) ON DELETE RESTRICT
)
    """,
    """
CREATE INDEX ix_card_auth_open_holds ON card_authorizations (status, created_at)
    """,
    """
CREATE INDEX ix_card_authorizations_issued_card_id ON card_authorizations (issued_card_id)
    """,
    """
CREATE TABLE card_clearings (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	issued_card_id UUID NOT NULL,
	authorization_id UUID,
	issuer VARCHAR(40) NOT NULL,
	issuer_transaction_id VARCHAR(120) NOT NULL,
	kind VARCHAR(8) NOT NULL,
	currency VARCHAR(3) NOT NULL,
	amount NUMERIC(20, 2) NOT NULL,
	fee NUMERIC(20, 2) NOT NULL,
	shortfall NUMERIC(20, 2) NOT NULL,
	merchant_name TEXT,
	journal_entry_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_card_clearings_kind CHECK (kind IN ('capture','refund')),
	CONSTRAINT uq_card_clearings_issuer_txn UNIQUE (issuer, issuer_transaction_id),
	FOREIGN KEY(issued_card_id) REFERENCES issued_cards (id) ON DELETE RESTRICT,
	FOREIGN KEY(authorization_id) REFERENCES card_authorizations (id) ON DELETE RESTRICT,
	FOREIGN KEY(journal_entry_id) REFERENCES journal_entries (id) ON DELETE RESTRICT
)
    """,
    """
CREATE INDEX ix_card_clearings_authorization_id ON card_clearings (authorization_id)
    """,
    """
CREATE INDEX ix_card_clearings_issued_card_id ON card_clearings (issued_card_id)
    """,
]


def upgrade() -> None:
    for stmt in CREATE:
        op.execute(stmt)
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN card_number DROP NOT NULL")
    op.execute("ALTER TABLE merchants ADD COLUMN verification_tier varchar(12) NOT NULL DEFAULT 'business'")
    op.execute("""
        INSERT INTO transaction_limits (product, country_code, currency, kyc_level, per_transaction_min,
                                        per_transaction_max, daily_max, monthly_max, active)
        SELECT 'merchant_individual', 'ZA', 'ZAR', 2, 1, 5000, 10000, 25000, true
        WHERE EXISTS (SELECT 1 FROM countries WHERE code = 'ZA')
          AND EXISTS (SELECT 1 FROM currencies WHERE code = 'ZAR')
    """)


def downgrade() -> None:
    # Only safe before any card has been issued; cards and their ledger
    # history are money records and must not be dropped once used.
    op.execute("DELETE FROM transaction_limits WHERE product = 'merchant_individual'")
    op.execute("ALTER TABLE merchants DROP COLUMN IF EXISTS verification_tier")
    for table in ("card_clearings", "card_authorizations", "card_wallet_tokens", "issued_cards"):
        op.execute(f"DROP TABLE IF EXISTS {table}")
