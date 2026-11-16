"""Network platform: countries, custodians, providers, corridors, FX quotes,
fee engine, limits, cross-border transfers, webhooks, outbox, audit log,
maker-checker approvals, reconciliation, compliance, merchant QR/API keys,
contribution payouts.

Also:
* users: kyc_level, residence_country, preferred_language, terms_accepted_at
  (existing users backfilled to ZA, level from their KYC/verified state);
* merchants: country, settlement currency, KYB status (existing merchants
  are grandfathered as approved);
* contribution campaigns now move real money through a ledger escrow
  account. Their old `current_amount` was a pledge counter never backed by
  funds, so it is reset to 0 and the old rows are marked `pledge_legacy`;
* new admin and merchant-staff roles.

Seed data comes from a frozen copy of app.reference.seed (below).

Revision ID: 0017_network_platform
Revises: 0016_ledger_and_currencies
Create Date: 2026-11-13
"""

import json

from alembic import op

revision = "0017_network_platform"
down_revision = "0016_ledger_and_currencies"
branch_labels = None
depends_on = None

CREATE_TABLES = [
    """
CREATE TABLE countries (
    code VARCHAR(2) NOT NULL,
    name TEXT NOT NULL,
    region VARCHAR(40) NOT NULL,
    dial_code VARCHAR(8),
    default_currency VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL,
    compliance_approved BOOLEAN NOT NULL,
    custodian_ready BOOLEAN NOT NULL,
    provider_ready BOOLEAN NOT NULL,
    kyc_requirements JSONB NOT NULL,
    regulatory_notes TEXT,
    launched_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (code),
    CONSTRAINT ck_countries_code_iso2 CHECK (code ~ '^[A-Z]{2}$'),
    CONSTRAINT ck_countries_status CHECK (status IN ('planned','pilot','live','suspended')),
    FOREIGN KEY(default_currency) REFERENCES currencies (code) ON DELETE RESTRICT
)
    """,
    """
CREATE TABLE country_currencies (
    country_code VARCHAR(2) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    wallet_enabled BOOLEAN NOT NULL,
    PRIMARY KEY (country_code, currency_code),
    FOREIGN KEY(country_code) REFERENCES countries (code) ON DELETE RESTRICT,
    FOREIGN KEY(currency_code) REFERENCES currencies (code) ON DELETE RESTRICT
)
    """,
    """
CREATE TABLE custodians (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    name TEXT NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    institution_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    integration_status VARCHAR(20) NOT NULL,
    regulatory_status TEXT NOT NULL,
    safeguarding_arrangement TEXT,
    api_config_ref TEXT,
    contact JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_custodians_type CHECK (institution_type IN ('bank','emi','trust','mobile_money','other')),
    CONSTRAINT ck_custodians_status CHECK (status IN ('prospect','onboarding','active','suspended','terminated')),
    FOREIGN KEY(country_code) REFERENCES countries (code) ON DELETE RESTRICT
)
    """,
    """
CREATE INDEX ix_custodians_country_code ON custodians (country_code)
    """,
    """
CREATE TABLE country_custodians (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    custodian_id UUID NOT NULL,
    role VARCHAR(10) NOT NULL,
    status VARCHAR(10) NOT NULL,
    settlement_account_ref TEXT,
    collection_methods JSONB NOT NULL,
    withdrawal_methods JSONB NOT NULL,
    reconciliation_settings JSONB NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_to TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_country_custodians_role CHECK (role IN ('primary','backup')),
    CONSTRAINT ck_country_custodians_status CHECK (status IN ('pending','active','retired')),
    FOREIGN KEY(country_code) REFERENCES countries (code) ON DELETE RESTRICT,
    FOREIGN KEY(currency_code) REFERENCES currencies (code) ON DELETE RESTRICT,
    FOREIGN KEY(custodian_id) REFERENCES custodians (id) ON DELETE RESTRICT
)
    """,
    """
CREATE UNIQUE INDEX uq_country_custodians_active_primary ON country_custodians (country_code, currency_code) WHERE role = 'primary' AND status = 'active'
    """,
    """
CREATE TABLE payment_providers (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    code VARCHAR(40) NOT NULL,
    name TEXT NOT NULL,
    provider_type VARCHAR(20) NOT NULL,
    country_code VARCHAR(2),
    currencies JSONB NOT NULL,
    methods JSONB NOT NULL,
    mode VARCHAR(12) NOT NULL,
    status VARCHAR(12) NOT NULL,
    webhook_status VARCHAR(20) NOT NULL,
    limits JSONB NOT NULL,
    credentials_ref TEXT,
    last_health_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_payment_providers_type CHECK (provider_type IN ('bank','psp','card','mobile_money','network','settlement','fx')),
    CONSTRAINT ck_payment_providers_mode CHECK (mode IN ('sandbox','production')),
    CONSTRAINT ck_payment_providers_status CHECK (status IN ('inactive','active','degraded','suspended')),
    UNIQUE (code),
    FOREIGN KEY(country_code) REFERENCES countries (code) ON DELETE RESTRICT
)
    """,
    """
CREATE TABLE payment_corridors (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    from_country VARCHAR(2) NOT NULL,
    to_country VARCHAR(2) NOT NULL,
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    rail_provider_id UUID,
    fx_provider_id UUID,
    settlement_model VARCHAR(20) NOT NULL,
    status VARCHAR(12) NOT NULL,
    min_amount NUMERIC(20, 2) NOT NULL,
    max_amount NUMERIC(20, 2) NOT NULL,
    rate NUMERIC(20, 8),
    rate_source TEXT NOT NULL,
    rate_updated_at TIMESTAMP WITH TIME ZONE,
    max_rate_age_seconds INTEGER NOT NULL,
    fx_markup_bps INTEGER NOT NULL,
    quote_ttl_seconds INTEGER NOT NULL,
    liquidity_limit NUMERIC(20, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_payment_corridors_route UNIQUE (from_country, to_country, from_currency, to_currency),
    CONSTRAINT ck_payment_corridors_status CHECK (status IN ('draft','pilot','active','suspended')),
    CONSTRAINT ck_payment_corridors_settlement_model CHECK (settlement_model IN ('prefunded','net_settlement','internal_book')),
    FOREIGN KEY(from_country) REFERENCES countries (code) ON DELETE RESTRICT,
    FOREIGN KEY(to_country) REFERENCES countries (code) ON DELETE RESTRICT,
    FOREIGN KEY(from_currency) REFERENCES currencies (code) ON DELETE RESTRICT,
    FOREIGN KEY(to_currency) REFERENCES currencies (code) ON DELETE RESTRICT,
    FOREIGN KEY(rail_provider_id) REFERENCES payment_providers (id) ON DELETE RESTRICT,
    FOREIGN KEY(fx_provider_id) REFERENCES payment_providers (id) ON DELETE RESTRICT
)
    """,
    """
CREATE TABLE fx_quotes (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    user_id UUID NOT NULL,
    corridor_id UUID,
    product VARCHAR(30) NOT NULL,
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    source_amount NUMERIC(20, 2) NOT NULL,
    fee NUMERIC(20, 2) NOT NULL,
    rate NUMERIC(20, 8) NOT NULL,
    destination_amount NUMERIC(20, 2) NOT NULL,
    fee_breakdown JSONB NOT NULL,
    rate_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_fx_quotes_status CHECK (status IN ('open','used','expired')),
    FOREIGN KEY(user_id) REFERENCES users (id),
    FOREIGN KEY(corridor_id) REFERENCES payment_corridors (id) ON DELETE RESTRICT,
    FOREIGN KEY(from_currency) REFERENCES currencies (code) ON DELETE RESTRICT,
    FOREIGN KEY(to_currency) REFERENCES currencies (code) ON DELETE RESTRICT
)
    """,
    """
CREATE INDEX ix_fx_quotes_user_id ON fx_quotes (user_id)
    """,
    """
CREATE TABLE fee_schedules (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    product VARCHAR(30) NOT NULL,
    country_code VARCHAR(2),
    currency VARCHAR(3),
    method VARCHAR(30),
    merchant_category VARCHAR(40),
    customer_type VARCHAR(20),
    corridor_id UUID,
    min_amount NUMERIC(20, 2),
    max_amount NUMERIC(20, 2),
    percentage NUMERIC(7, 4) NOT NULL,
    fixed NUMERIC(20, 2) NOT NULL,
    cap NUMERIC(20, 2),
    priority INTEGER NOT NULL,
    active BOOLEAN NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_to TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_fee_schedules_nonneg CHECK (percentage >= 0 AND fixed >= 0),
    FOREIGN KEY(country_code) REFERENCES countries (code) ON DELETE RESTRICT,
    FOREIGN KEY(currency) REFERENCES currencies (code) ON DELETE RESTRICT,
    FOREIGN KEY(corridor_id) REFERENCES payment_corridors (id) ON DELETE CASCADE
)
    """,
    """
CREATE INDEX ix_fee_schedules_product ON fee_schedules (product)
    """,
    """
CREATE TABLE transaction_limits (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    product VARCHAR(30) NOT NULL,
    country_code VARCHAR(2),
    currency VARCHAR(3),
    kyc_level INTEGER NOT NULL,
    per_transaction_min NUMERIC(20, 2),
    per_transaction_max NUMERIC(20, 2),
    daily_max NUMERIC(20, 2),
    monthly_max NUMERIC(20, 2),
    active BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(country_code) REFERENCES countries (code) ON DELETE RESTRICT,
    FOREIGN KEY(currency) REFERENCES currencies (code) ON DELETE RESTRICT
)
    """,
    """
CREATE INDEX ix_transaction_limits_product ON transaction_limits (product)
    """,
    """
CREATE TABLE transfers (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    reference VARCHAR(40) NOT NULL,
    sender_id UUID NOT NULL,
    recipient_id UUID NOT NULL,
    sender_card_id UUID NOT NULL,
    recipient_card_id UUID NOT NULL,
    corridor_id UUID NOT NULL,
    quote_id UUID,
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    source_amount NUMERIC(20, 2) NOT NULL,
    fee NUMERIC(20, 2) NOT NULL,
    rate NUMERIC(20, 8) NOT NULL,
    destination_amount NUMERIC(20, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    rail VARCHAR(40) NOT NULL,
    rail_reference VARCHAR(200),
    failure_reason TEXT,
    debit_entry_id UUID,
    settlement_entry_id UUID,
    reversal_entry_id UUID,
    purpose_category VARCHAR(40),
    purpose_subcategory TEXT,
    settled_at TIMESTAMP WITH TIME ZONE,
    credited_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_transfers_status CHECK (status IN ('sender_debited','instructed','settled','credited','failed','reversed')),
    UNIQUE (reference),
    FOREIGN KEY(sender_id) REFERENCES users (id),
    FOREIGN KEY(recipient_id) REFERENCES users (id),
    FOREIGN KEY(sender_card_id) REFERENCES wallet_cards (id),
    FOREIGN KEY(recipient_card_id) REFERENCES wallet_cards (id),
    FOREIGN KEY(corridor_id) REFERENCES payment_corridors (id),
    FOREIGN KEY(quote_id) REFERENCES fx_quotes (id),
    FOREIGN KEY(from_currency) REFERENCES currencies (code) ON DELETE RESTRICT,
    FOREIGN KEY(to_currency) REFERENCES currencies (code) ON DELETE RESTRICT,
    FOREIGN KEY(debit_entry_id) REFERENCES journal_entries (id),
    FOREIGN KEY(settlement_entry_id) REFERENCES journal_entries (id),
    FOREIGN KEY(reversal_entry_id) REFERENCES journal_entries (id)
)
    """,
    """
CREATE INDEX ix_transfers_recipient_id ON transfers (recipient_id)
    """,
    """
CREATE INDEX ix_transfers_sender_id ON transfers (sender_id)
    """,
    """
CREATE INDEX ix_transfers_status ON transfers (status)
    """,
    """
CREATE TABLE provider_webhooks (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    provider VARCHAR(40) NOT NULL,
    event_id VARCHAR(200) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    signature_valid BOOLEAN NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(12) NOT NULL,
    attempts INTEGER NOT NULL,
    error TEXT,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    CONSTRAINT uq_provider_webhooks_event UNIQUE (provider, event_id),
    CONSTRAINT ck_provider_webhooks_status CHECK (status IN ('received','processed','ignored','failed','rejected'))
)
    """,
    """
CREATE TABLE outbox_events (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    topic VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(10) NOT NULL,
    attempts INTEGER NOT NULL,
    last_error TEXT,
    available_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    CONSTRAINT ck_outbox_events_status CHECK (status IN ('pending','done','failed'))
)
    """,
    """
CREATE INDEX ix_outbox_events_pending ON outbox_events (status, available_at)
    """,
    """
CREATE TABLE audit_logs (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    actor_type VARCHAR(20) NOT NULL,
    actor_id VARCHAR(64),
    actor_email TEXT,
    action VARCHAR(80) NOT NULL,
    target_type VARCHAR(40),
    target_id VARCHAR(64),
    details JSONB NOT NULL,
    ip VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id)
)
    """,
    """
CREATE INDEX ix_audit_logs_action ON audit_logs (action)
    """,
    """
CREATE INDEX ix_audit_logs_created ON audit_logs (created_at)
    """,
    """
CREATE TABLE approval_requests (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    action VARCHAR(60) NOT NULL,
    payload JSONB NOT NULL,
    reason TEXT NOT NULL,
    evidence JSONB NOT NULL,
    status VARCHAR(12) NOT NULL,
    requested_by UUID,
    decided_by UUID,
    decision_note TEXT,
    decided_at TIMESTAMP WITH TIME ZONE,
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_approval_requests_status CHECK (status IN ('pending','approved','rejected','executed','failed','cancelled')),
    FOREIGN KEY(requested_by) REFERENCES admin_users (id),
    FOREIGN KEY(decided_by) REFERENCES admin_users (id)
)
    """,
    """
CREATE INDEX ix_approval_requests_action ON approval_requests (action)
    """,
    """
CREATE INDEX ix_approval_requests_status ON approval_requests (status)
    """,
    """
CREATE TABLE reconciliation_runs (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    kind VARCHAR(40) NOT NULL,
    provider VARCHAR(40),
    status VARCHAR(12) NOT NULL,
    summary JSONB NOT NULL,
    started_by TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    CONSTRAINT ck_reconciliation_runs_status CHECK (status IN ('running','completed','failed'))
)
    """,
    """
CREATE TABLE reconciliation_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    run_id UUID NOT NULL,
    result VARCHAR(30) NOT NULL,
    reference VARCHAR(200),
    ledger_amount NUMERIC(20, 2),
    provider_amount NUMERIC(20, 2),
    currency VARCHAR(3),
    details JSONB NOT NULL,
    resolution VARCHAR(10) NOT NULL,
    resolution_note TEXT,
    resolved_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_reconciliation_items_result CHECK (result IN ('matched','unmatched_ledger','unmatched_provider','amount_mismatch','duplicate','stale_pending','integrity_error','timing_difference')),
    CONSTRAINT ck_reconciliation_items_resolution CHECK (resolution IN ('open','resolved','ignored')),
    FOREIGN KEY(run_id) REFERENCES reconciliation_runs (id) ON DELETE CASCADE
)
    """,
    """
CREATE INDEX ix_reconciliation_items_run_id ON reconciliation_items (run_id)
    """,
    """
CREATE TABLE compliance_cases (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    user_id UUID,
    merchant_id UUID,
    title TEXT NOT NULL,
    status VARCHAR(24) NOT NULL,
    priority VARCHAR(10) NOT NULL,
    assigned_to UUID,
    notes JSONB NOT NULL,
    evidence JSONB NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_compliance_cases_status CHECK (status IN ('open','investigating','escalated','closed_no_action','closed_action_taken')),
    FOREIGN KEY(user_id) REFERENCES users (id),
    FOREIGN KEY(merchant_id) REFERENCES merchants (id),
    FOREIGN KEY(assigned_to) REFERENCES admin_users (id)
)
    """,
    """
CREATE INDEX ix_compliance_cases_user_id ON compliance_cases (user_id)
    """,
    """
CREATE TABLE risk_events (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    user_id UUID,
    rule VARCHAR(60) NOT NULL,
    severity VARCHAR(10) NOT NULL,
    score INTEGER NOT NULL,
    reference VARCHAR(80),
    details JSONB NOT NULL,
    case_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES users (id),
    FOREIGN KEY(case_id) REFERENCES compliance_cases (id)
)
    """,
    """
CREATE INDEX ix_risk_events_user_id ON risk_events (user_id)
    """,
    """
CREATE TABLE screening_results (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    user_id UUID,
    merchant_id UUID,
    screening_type VARCHAR(20) NOT NULL,
    provider VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL,
    details JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES users (id),
    FOREIGN KEY(merchant_id) REFERENCES merchants (id)
)
    """,
    """
CREATE INDEX ix_screening_results_user_id ON screening_results (user_id)
    """,
    """
CREATE TABLE merchant_qr_codes (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    merchant_id UUID NOT NULL,
    kind VARCHAR(10) NOT NULL,
    label TEXT,
    amount NUMERIC(20, 2),
    currency VARCHAR(3) NOT NULL,
    reference VARCHAR(80),
    status VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_merchant_qr_codes_kind CHECK (kind IN ('static','dynamic')),
    CONSTRAINT ck_merchant_qr_codes_status CHECK (status IN ('active','paid','expired','cancelled')),
    FOREIGN KEY(merchant_id) REFERENCES merchants (id) ON DELETE CASCADE,
    FOREIGN KEY(currency) REFERENCES currencies (code) ON DELETE RESTRICT
)
    """,
    """
CREATE INDEX ix_merchant_qr_codes_merchant_id ON merchant_qr_codes (merchant_id)
    """,
    """
CREATE TABLE merchant_api_keys (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    merchant_id UUID NOT NULL,
    prefix VARCHAR(16) NOT NULL,
    key_hash VARCHAR(128) NOT NULL,
    label TEXT,
    revoked_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(merchant_id) REFERENCES merchants (id) ON DELETE CASCADE,
    UNIQUE (prefix)
)
    """,
    """
CREATE INDEX ix_merchant_api_keys_merchant_id ON merchant_api_keys (merchant_id)
    """,
    """
CREATE TABLE merchant_webhook_endpoints (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    merchant_id UUID NOT NULL,
    url TEXT NOT NULL,
    secret VARCHAR(80) NOT NULL,
    events JSONB NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
)
    """,
    """
CREATE INDEX ix_merchant_webhook_endpoints_merchant_id ON merchant_webhook_endpoints (merchant_id)
    """,
    """
CREATE TABLE contribution_payouts (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    group_id UUID NOT NULL,
    amount NUMERIC(20, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    destination_card_id UUID NOT NULL,
    journal_entry_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(group_id) REFERENCES contribution_groups (id) ON DELETE RESTRICT,
    FOREIGN KEY(currency) REFERENCES currencies (code) ON DELETE RESTRICT,
    FOREIGN KEY(destination_card_id) REFERENCES wallet_cards (id),
    FOREIGN KEY(journal_entry_id) REFERENCES journal_entries (id)
)
    """,
    """
CREATE INDEX ix_contribution_payouts_group_id ON contribution_payouts (group_id)
    """
]

class seed:  # noqa: N801 — frozen copy of app.reference.seed at the time of this migration
    EXTRA_CURRENCIES = [('DZD', 'Algerian Dinar', 'DA', 2),
     ('AOA', 'Angolan Kwanza', 'Kz', 2),
     ('XOF', 'West African CFA Franc', 'CFA', 0),
     ('XAF', 'Central African CFA Franc', 'FCFA', 0),
     ('BIF', 'Burundian Franc', 'FBu', 0),
     ('CVE', 'Cape Verdean Escudo', 'Esc', 2),
     ('KMF', 'Comorian Franc', 'CF', 0),
     ('CDF', 'Congolese Franc', 'FC', 2),
     ('DJF', 'Djiboutian Franc', 'Fdj', 0),
     ('ERN', 'Eritrean Nakfa', 'Nfk', 2),
     ('SZL', 'Swazi Lilangeni', 'E', 2),
     ('ETB', 'Ethiopian Birr', 'Br', 2),
     ('GMD', 'Gambian Dalasi', 'D', 2),
     ('GNF', 'Guinean Franc', 'FG', 0),
     ('LSL', 'Lesotho Loti', 'L', 2),
     ('LRD', 'Liberian Dollar', 'L$', 2),
     ('LYD', 'Libyan Dinar', 'LD', 3),
     ('MGA', 'Malagasy Ariary', 'Ar', 2),
     ('MWK', 'Malawian Kwacha', 'MK', 2),
     ('MRU', 'Mauritanian Ouguiya', 'UM', 2),
     ('MUR', 'Mauritian Rupee', 'Rs', 2),
     ('MAD', 'Moroccan Dirham', 'DH', 2),
     ('MZN', 'Mozambican Metical', 'MT', 2),
     ('NAD', 'Namibian Dollar', 'N$', 2),
     ('RWF', 'Rwandan Franc', 'FRw', 0),
     ('STN', 'São Tomé and Príncipe Dobra', 'Db', 2),
     ('SCR', 'Seychellois Rupee', 'SR', 2),
     ('SLE', 'Sierra Leonean Leone', 'Le', 2),
     ('SOS', 'Somali Shilling', 'Sh', 2),
     ('SSP', 'South Sudanese Pound', 'SSP', 2),
     ('SDG', 'Sudanese Pound', 'LS', 2),
     ('TZS', 'Tanzanian Shilling', 'TSh', 2),
     ('TND', 'Tunisian Dinar', 'DT', 3),
     ('UGX', 'Ugandan Shilling', 'USh', 0),
     ('CAD', 'Canadian Dollar', 'C$', 2),
     ('BRL', 'Brazilian Real', 'R$', 2),
     ('MXN', 'Mexican Peso', 'Mex$', 2),
     ('CHF', 'Swiss Franc', 'Fr', 2),
     ('NOK', 'Norwegian Krone', 'kr', 2),
     ('PLN', 'Polish Złoty', 'zł', 2),
     ('TRY', 'Turkish Lira', '₺', 2),
     ('AED', 'UAE Dirham', 'AED', 2),
     ('SAR', 'Saudi Riyal', 'SR', 2),
     ('QAR', 'Qatari Riyal', 'QR', 2),
     ('KWD', 'Kuwaiti Dinar', 'KD', 3),
     ('ILS', 'Israeli New Shekel', '₪', 2),
     ('INR', 'Indian Rupee', '₹', 2),
     ('CNY', 'Chinese Yuan', '¥', 2),
     ('PKR', 'Pakistani Rupee', 'Rs', 2),
     ('PHP', 'Philippine Peso', '₱', 2),
     ('MYR', 'Malaysian Ringgit', 'RM', 2),
     ('SGD', 'Singapore Dollar', 'S$', 2),
     ('JPY', 'Japanese Yen', '¥', 0),
     ('KRW', 'South Korean Won', '₩', 0),
     ('IDR', 'Indonesian Rupiah', 'Rp', 2),
     ('VND', 'Vietnamese Đồng', '₫', 0),
     ('THB', 'Thai Baht', '฿', 2),
     ('BDT', 'Bangladeshi Taka', '৳', 2),
     ('LKR', 'Sri Lankan Rupee', 'Rs', 2),
     ('AUD', 'Australian Dollar', 'A$', 2),
     ('NZD', 'New Zealand Dollar', 'NZ$', 2)]
    COUNTRIES = [('DZ', 'Algeria', 'Africa', '+213', 'DZD'),
     ('AO', 'Angola', 'Africa', '+244', 'AOA'),
     ('BJ', 'Benin', 'Africa', '+229', 'XOF'),
     ('BW', 'Botswana', 'Africa', '+267', 'BWP'),
     ('BF', 'Burkina Faso', 'Africa', '+226', 'XOF'),
     ('BI', 'Burundi', 'Africa', '+257', 'BIF'),
     ('CV', 'Cabo Verde', 'Africa', '+238', 'CVE'),
     ('CM', 'Cameroon', 'Africa', '+237', 'XAF'),
     ('CF', 'Central African Republic', 'Africa', '+236', 'XAF'),
     ('TD', 'Chad', 'Africa', '+235', 'XAF'),
     ('KM', 'Comoros', 'Africa', '+269', 'KMF'),
     ('CG', 'Congo, Republic of', 'Africa', '+242', 'XAF'),
     ('CD', 'Congo, DR', 'Africa', '+243', 'CDF'),
     ('DJ', 'Djibouti', 'Africa', '+253', 'DJF'),
     ('EG', 'Egypt', 'Africa', '+20', 'EGP'),
     ('GQ', 'Equatorial Guinea', 'Africa', '+240', 'XAF'),
     ('ER', 'Eritrea', 'Africa', '+291', 'ERN'),
     ('SZ', 'Eswatini', 'Africa', '+268', 'SZL'),
     ('ET', 'Ethiopia', 'Africa', '+251', 'ETB'),
     ('GA', 'Gabon', 'Africa', '+241', 'XAF'),
     ('GM', 'Gambia', 'Africa', '+220', 'GMD'),
     ('GH', 'Ghana', 'Africa', '+233', 'GHS'),
     ('GN', 'Guinea', 'Africa', '+224', 'GNF'),
     ('GW', 'Guinea-Bissau', 'Africa', '+245', 'XOF'),
     ('CI', "Côte d'Ivoire", 'Africa', '+225', 'XOF'),
     ('KE', 'Kenya', 'Africa', '+254', 'KES'),
     ('LS', 'Lesotho', 'Africa', '+266', 'LSL'),
     ('LR', 'Liberia', 'Africa', '+231', 'LRD'),
     ('LY', 'Libya', 'Africa', '+218', 'LYD'),
     ('MG', 'Madagascar', 'Africa', '+261', 'MGA'),
     ('MW', 'Malawi', 'Africa', '+265', 'MWK'),
     ('ML', 'Mali', 'Africa', '+223', 'XOF'),
     ('MR', 'Mauritania', 'Africa', '+222', 'MRU'),
     ('MU', 'Mauritius', 'Africa', '+230', 'MUR'),
     ('MA', 'Morocco', 'Africa', '+212', 'MAD'),
     ('MZ', 'Mozambique', 'Africa', '+258', 'MZN'),
     ('NA', 'Namibia', 'Africa', '+264', 'NAD'),
     ('NE', 'Niger', 'Africa', '+227', 'XOF'),
     ('NG', 'Nigeria', 'Africa', '+234', 'NGN'),
     ('RW', 'Rwanda', 'Africa', '+250', 'RWF'),
     ('ST', 'São Tomé and Príncipe', 'Africa', '+239', 'STN'),
     ('SN', 'Senegal', 'Africa', '+221', 'XOF'),
     ('SC', 'Seychelles', 'Africa', '+248', 'SCR'),
     ('SL', 'Sierra Leone', 'Africa', '+232', 'SLE'),
     ('SO', 'Somalia', 'Africa', '+252', 'SOS'),
     ('ZA', 'South Africa', 'Africa', '+27', 'ZAR'),
     ('SS', 'South Sudan', 'Africa', '+211', 'SSP'),
     ('SD', 'Sudan', 'Africa', '+249', 'SDG'),
     ('TZ', 'Tanzania', 'Africa', '+255', 'TZS'),
     ('TG', 'Togo', 'Africa', '+228', 'XOF'),
     ('TN', 'Tunisia', 'Africa', '+216', 'TND'),
     ('UG', 'Uganda', 'Africa', '+256', 'UGX'),
     ('ZM', 'Zambia', 'Africa', '+260', 'ZMW'),
     ('ZW', 'Zimbabwe', 'Africa', '+263', 'ZWG'),
     ('US', 'United States', 'Americas', '+1', 'USD'),
     ('CA', 'Canada', 'Americas', '+1', 'CAD'),
     ('BR', 'Brazil', 'Americas', '+55', 'BRL'),
     ('MX', 'Mexico', 'Americas', '+52', 'MXN'),
     ('GB', 'United Kingdom', 'Europe', '+44', 'GBP'),
     ('DE', 'Germany', 'Europe', '+49', 'EUR'),
     ('FR', 'France', 'Europe', '+33', 'EUR'),
     ('NL', 'Netherlands', 'Europe', '+31', 'EUR'),
     ('IT', 'Italy', 'Europe', '+39', 'EUR'),
     ('ES', 'Spain', 'Europe', '+34', 'EUR'),
     ('PT', 'Portugal', 'Europe', '+351', 'EUR'),
     ('IE', 'Ireland', 'Europe', '+353', 'EUR'),
     ('BE', 'Belgium', 'Europe', '+32', 'EUR'),
     ('AT', 'Austria', 'Europe', '+43', 'EUR'),
     ('GR', 'Greece', 'Europe', '+30', 'EUR'),
     ('FI', 'Finland', 'Europe', '+358', 'EUR'),
     ('CH', 'Switzerland', 'Europe', '+41', 'CHF'),
     ('NO', 'Norway', 'Europe', '+47', 'NOK'),
     ('PL', 'Poland', 'Europe', '+48', 'PLN'),
     ('TR', 'Turkey', 'Europe', '+90', 'TRY'),
     ('AE', 'United Arab Emirates', 'Middle East', '+971', 'AED'),
     ('SA', 'Saudi Arabia', 'Middle East', '+966', 'SAR'),
     ('QA', 'Qatar', 'Middle East', '+974', 'QAR'),
     ('KW', 'Kuwait', 'Middle East', '+965', 'KWD'),
     ('IL', 'Israel', 'Middle East', '+972', 'ILS'),
     ('IN', 'India', 'Asia', '+91', 'INR'),
     ('CN', 'China', 'Asia', '+86', 'CNY'),
     ('PK', 'Pakistan', 'Asia', '+92', 'PKR'),
     ('PH', 'Philippines', 'Asia', '+63', 'PHP'),
     ('MY', 'Malaysia', 'Asia', '+60', 'MYR'),
     ('SG', 'Singapore', 'Asia', '+65', 'SGD'),
     ('JP', 'Japan', 'Asia', '+81', 'JPY'),
     ('KR', 'South Korea', 'Asia', '+82', 'KRW'),
     ('ID', 'Indonesia', 'Asia', '+62', 'IDR'),
     ('VN', 'Vietnam', 'Asia', '+84', 'VND'),
     ('TH', 'Thailand', 'Asia', '+66', 'THB'),
     ('BD', 'Bangladesh', 'Asia', '+880', 'BDT'),
     ('LK', 'Sri Lanka', 'Asia', '+94', 'LKR'),
     ('AU', 'Australia', 'Oceania', '+61', 'AUD'),
     ('NZ', 'New Zealand', 'Oceania', '+64', 'NZD')]
    PILOT_COUNTRIES = {'ZA'}
    PROVIDERS = [{'code': 'stitch',
      'name': 'Stitch (instant EFT & payouts)',
      'provider_type': 'psp',
      'country_code': 'ZA',
      'currencies': ['ZAR'],
      'methods': ['eft_payin', 'bank_payout'],
      'mode': 'production',
      'status': 'active',
      'credentials_ref': 'STITCH_CLIENT_ID/STITCH_CLIENT_SECRET'},
     {'code': 'sandbox',
      'name': 'BukkaPay Sandbox Rail (simulated, no real money)',
      'provider_type': 'network',
      'country_code': None,
      'currencies': [],
      'methods': ['cross_border'],
      'mode': 'sandbox',
      'status': 'active',
      'credentials_ref': 'SANDBOX_WEBHOOK_SECRET'},
     {'code': 'papss',
      'name': 'PAPSS (Pan-African Payment and Settlement System)',
      'provider_type': 'network',
      'country_code': None,
      'currencies': [],
      'methods': ['cross_border'],
      'mode': 'sandbox',
      'status': 'inactive',
      'credentials_ref': None}]
    DRAFT_CORRIDORS = [('ZW', 'ZA', 'ZWG', 'ZAR'),
     ('ZA', 'ZW', 'ZAR', 'ZWG'),
     ('NG', 'KE', 'NGN', 'KES'),
     ('KE', 'NG', 'KES', 'NGN')]
    FEES = [('p2p', '0.5', '1.00', 'ZAR', 'ZA'),
     ('p2p', '0.5', '0', None, None),
     ('cross_border', '1.0', '0', None, None),
     ('payment_link', '1.5', '0', None, None),
     ('merchant_payment', '1.5', '0', None, None),
     ('withdrawal', '0', '8.50', 'ZAR', 'ZA'),
     ('card_issuance', '0', '50.00', 'ZAR', 'ZA'),
     ('card_maintenance', '0', '15.00', 'ZAR', 'ZA')]
    LIMITS = [('p2p', 0, '10', '1000', '3000', '10000'),
     ('p2p', 1, '10', '5000', '10000', '25000'),
     ('p2p', 2, '10', '50000', '100000', '500000'),
     ('withdrawal', 0, '50', '0', '0', '0'),
     ('withdrawal', 1, '50', '5000', '10000', '25000'),
     ('withdrawal', 2, '50', '25000', '50000', '250000'),
     ('funding', 0, '10', '1000', '3000', '10000'),
     ('funding', 1, '10', '10000', '20000', '50000'),
     ('funding', 2, '10', '100000', '200000', '1000000'),
     ('cross_border', 0, '10', '0', '0', '0'),
     ('cross_border', 1, '10', '0', '0', '0'),
     ('cross_border', 2, '10', '20000', '50000', '200000')]


# Frozen copy of the app.ledger.ddl trigger added in this revision.
CONTRIBUTION_GUARD = """CREATE TRIGGER trg_contribution_groups_balance_guard BEFORE UPDATE OF current_amount ON contribution_groups
       FOR EACH ROW WHEN (OLD.current_amount IS DISTINCT FROM NEW.current_amount)
       EXECUTE FUNCTION ledger_guard_balance('current_amount')"""

NEW_ADMIN_ROLES = ["ceo", "finance_admin", "compliance_officer", "operations_admin", "customer_support",
                   "merchant_support", "technical_admin", "auditor"]
NEW_STAFF_ROLES = ["admin", "finance", "viewer"]


def _q(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, dict)):
        return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"
    return "'" + str(value).replace("'", "''") + "'"


def upgrade() -> None:
    for code, name, symbol, decimals in seed.EXTRA_CURRENCIES:
        op.execute(
            "INSERT INTO currencies (code, name, symbol, decimals, status, wallet_enabled) VALUES "
            f"({_q(code)}, {_q(name)}, {_q(symbol)}, {decimals}, 'active', false) ON CONFLICT (code) DO NOTHING"
        )

    for stmt in CREATE_TABLES:
        op.execute(stmt)

    # ── countries ──
    for code, name, region, dial, currency in seed.COUNTRIES:
        pilot = code in seed.PILOT_COUNTRIES
        notes = ("Grandfathered pilot: BukkaPay already operated here before the network platform. "
                 "Record the custodian and compliance sign-off before marking live.") if pilot else None
        op.execute(
            "INSERT INTO countries (code, name, region, dial_code, default_currency, status, compliance_approved, "
            "custodian_ready, provider_ready, kyc_requirements, regulatory_notes) VALUES "
            f"({_q(code)}, {_q(name)}, {_q(region)}, {_q(dial)}, {_q(currency)}, "
            f"{_q('pilot' if pilot else 'planned')}, false, false, {_q(pilot)}, "
            f"{_q({'wallet': 1, 'cross_border': 2})}, {_q(notes)})"
        )
        op.execute(
            "INSERT INTO country_currencies (country_code, currency_code, wallet_enabled) VALUES "
            f"({_q(code)}, {_q(currency)}, {_q(pilot)})"
        )

    # ── providers & draft corridors ──
    for p in seed.PROVIDERS:
        op.execute(
            "INSERT INTO payment_providers (code, name, provider_type, country_code, currencies, methods, mode, "
            "status, webhook_status, limits, credentials_ref) VALUES "
            f"({_q(p['code'])}, {_q(p['name'])}, {_q(p['provider_type'])}, {_q(p['country_code'])}, "
            f"{_q(p['currencies'])}, {_q(p['methods'])}, {_q(p['mode'])}, {_q(p['status'])}, 'not_configured', "
            f"'{{}}'::jsonb, {_q(p['credentials_ref'])})"
        )
    for fc, tc, fcur, tcur in seed.DRAFT_CORRIDORS:
        op.execute(
            "INSERT INTO payment_corridors (from_country, to_country, from_currency, to_currency, rail_provider_id, "
            "settlement_model, status, min_amount, max_amount, rate_source, max_rate_age_seconds, fx_markup_bps, "
            "quote_ttl_seconds) VALUES "
            f"({_q(fc)}, {_q(tc)}, {_q(fcur)}, {_q(tcur)}, (SELECT id FROM payment_providers WHERE code = 'sandbox'), "
            "'prefunded', 'draft', 10, 50000, 'manual', 3600, 0, 60)"
        )

    # ── fees & limits ──
    for product, pct, fixed, currency, country in seed.FEES:
        op.execute(
            "INSERT INTO fee_schedules (product, percentage, fixed, currency, country_code, priority, active) "
            f"VALUES ({_q(product)}, {pct}, {fixed}, {_q(currency)}, {_q(country)}, 0, true)"
        )
    for product, level, mn, mx, daily, monthly in seed.LIMITS:
        op.execute(
            "INSERT INTO transaction_limits (product, country_code, currency, kyc_level, per_transaction_min, "
            "per_transaction_max, daily_max, monthly_max, active) VALUES "
            f"({_q(product)}, 'ZA', 'ZAR', {level}, {mn}, {mx or 'NULL'}, {daily or 'NULL'}, "
            f"{monthly or 'NULL'}, true)"
        )

    # ── users ──
    op.execute("ALTER TABLE users ADD COLUMN kyc_level integer NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE users ADD COLUMN residence_country varchar(2) REFERENCES countries(code) ON DELETE RESTRICT")
    op.execute("ALTER TABLE users ADD COLUMN preferred_language varchar(8) NOT NULL DEFAULT 'en'")
    op.execute("ALTER TABLE users ADD COLUMN terms_accepted_at timestamptz")
    op.execute("UPDATE users SET residence_country = 'ZA'")
    op.execute("""
        UPDATE users SET kyc_level = CASE
            WHEN kyc_status = 'approved' THEN 2 WHEN verified THEN 1 ELSE 0 END
    """)

    # ── merchants ──
    op.execute("ALTER TABLE merchants ADD COLUMN country_code varchar(2) NOT NULL DEFAULT 'ZA' REFERENCES countries(code)")
    op.execute("ALTER TABLE merchants ADD COLUMN settlement_currency varchar(3) NOT NULL DEFAULT 'ZAR' "
               "REFERENCES currencies(code)")
    op.execute("ALTER TABLE merchants ADD COLUMN kyb_status text NOT NULL DEFAULT 'not_submitted'")
    op.execute("ALTER TABLE merchants ADD COLUMN kyb_submitted_at timestamptz")
    op.execute("ALTER TABLE merchants ADD COLUMN kyb_reviewed_at timestamptz")
    op.execute("ALTER TABLE merchants ADD COLUMN kyb_rejection_reason text")
    op.execute("ALTER TABLE merchants ADD COLUMN kyb_details jsonb")
    op.execute("ALTER TABLE merchants ADD CONSTRAINT ck_merchants_kyb_status "
               "CHECK (kyb_status IN ('not_submitted','pending','approved','rejected'))")
    op.execute("UPDATE merchants SET kyb_status = 'approved', kyb_reviewed_at = now()")

    # ── request money ──
    op.execute("ALTER TABLE payment_requests ADD COLUMN description text")
    op.execute("ALTER TABLE payment_requests ADD COLUMN payer_user_id uuid REFERENCES users(id) ON DELETE SET NULL")
    op.execute("CREATE INDEX ix_payment_requests_payer_user_id ON payment_requests (payer_user_id)")
    op.execute("ALTER TABLE payment_requests ADD COLUMN paid_by_user_id uuid REFERENCES users(id)")
    op.execute("ALTER TABLE payment_requests ADD COLUMN paid_at timestamptz")
    op.execute("ALTER TABLE payment_requests ADD COLUMN transfer_reference text")

    # ── merchant checkout links ──
    op.execute("ALTER TABLE payment_links ADD COLUMN merchant_id uuid REFERENCES merchants(id) ON DELETE RESTRICT")
    op.execute("CREATE INDEX ix_payment_links_merchant_id ON payment_links (merchant_id)")
    op.execute("ALTER TABLE payment_links ADD COLUMN expires_at timestamptz")

    # ── contributions become real money ──
    # Legacy Supabase-era triggers that bumped current_amount on insert would
    # now (correctly) be blocked by the balance guard; remove them.
    op.execute("DROP TRIGGER IF EXISTS trigger_update_contribution_total ON contributions")
    op.execute("DROP TRIGGER IF EXISTS trigger_update_stokvel_total ON contributions")
    op.execute("ALTER TABLE funding_requests ADD COLUMN contribution_group_id uuid "
               "REFERENCES contribution_groups(id) ON DELETE RESTRICT")
    op.execute("ALTER TABLE funding_requests DROP CONSTRAINT ck_funding_requests_target")
    op.execute("""ALTER TABLE funding_requests ADD CONSTRAINT ck_funding_requests_target CHECK (
        (purpose = 'wallet_topup' AND wallet_card_id IS NOT NULL AND user_id IS NOT NULL)
        OR (purpose = 'payment_link' AND payment_link_id IS NOT NULL)
        OR (purpose = 'contribution' AND contribution_group_id IS NOT NULL))""")
    op.execute("ALTER TABLE ledger_accounts ADD COLUMN contribution_group_id uuid UNIQUE "
               "REFERENCES contribution_groups(id) ON DELETE RESTRICT")
    op.execute("ALTER TABLE contribution_groups ADD COLUMN paid_out_amount numeric(14,2) NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE contributions ADD COLUMN status text NOT NULL DEFAULT 'paid'")
    op.execute("ALTER TABLE contributions ADD COLUMN journal_entry_id uuid REFERENCES journal_entries(id)")
    op.execute("UPDATE contributions SET status = 'pledge_legacy'")
    op.execute("UPDATE contribution_groups SET current_amount = 0")
    op.execute(CONTRIBUTION_GUARD)

    # ── roles ──
    for role in NEW_ADMIN_ROLES:
        op.execute(f"ALTER TYPE admin_role ADD VALUE IF NOT EXISTS '{role}'")
    for role in NEW_STAFF_ROLES:
        op.execute(f"ALTER TYPE merchant_staff_role ADD VALUE IF NOT EXISTS '{role}'")


def downgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM transfers) OR EXISTS (SELECT 1 FROM contribution_payouts)
               OR EXISTS (SELECT 1 FROM contributions WHERE status = 'paid') THEN
                RAISE EXCEPTION 'refusing to downgrade: network money records exist';
            END IF;
        END $$
    """)
    op.execute("DROP TRIGGER IF EXISTS trg_contribution_groups_balance_guard ON contribution_groups")
    op.execute("ALTER TABLE payment_links DROP COLUMN IF EXISTS expires_at")
    for col in ("transfer_reference", "paid_at", "paid_by_user_id", "payer_user_id", "description"):
        op.execute(f"ALTER TABLE payment_requests DROP COLUMN IF EXISTS {col}")
    op.execute("ALTER TABLE payment_links DROP COLUMN IF EXISTS merchant_id")
    op.execute("ALTER TABLE funding_requests DROP CONSTRAINT IF EXISTS ck_funding_requests_target")
    op.execute("""ALTER TABLE funding_requests ADD CONSTRAINT ck_funding_requests_target CHECK (
        (purpose = 'wallet_topup' AND wallet_card_id IS NOT NULL AND user_id IS NOT NULL)
        OR (purpose = 'payment_link' AND payment_link_id IS NOT NULL))""")
    op.execute("ALTER TABLE funding_requests DROP COLUMN IF EXISTS contribution_group_id")
    op.execute("ALTER TABLE contributions DROP COLUMN IF EXISTS journal_entry_id")
    op.execute("ALTER TABLE contributions DROP COLUMN IF EXISTS status")
    op.execute("ALTER TABLE contribution_groups DROP COLUMN IF EXISTS paid_out_amount")
    op.execute("ALTER TABLE ledger_accounts DROP COLUMN IF EXISTS contribution_group_id")
    for col in ("kyb_details", "kyb_rejection_reason", "kyb_reviewed_at", "kyb_submitted_at", "kyb_status",
                "settlement_currency", "country_code"):
        op.execute(f"ALTER TABLE merchants DROP COLUMN IF EXISTS {col}")
    for col in ("terms_accepted_at", "preferred_language", "residence_country", "kyc_level"):
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {col}")
    for name in reversed([
        "countries", "country_currencies", "custodians", "country_custodians", "payment_providers",
        "payment_corridors", "fx_quotes", "fee_schedules", "transaction_limits", "transfers",
        "provider_webhooks", "outbox_events", "audit_logs", "approval_requests", "reconciliation_runs",
        "reconciliation_items", "compliance_cases", "risk_events", "screening_results", "merchant_qr_codes",
        "merchant_api_keys", "merchant_webhook_endpoints", "contribution_payouts",
    ]):
        op.execute(f"DROP TABLE IF EXISTS {name} CASCADE")
    # Enum values added to admin_role / merchant_staff_role can't be dropped
    # in Postgres; they are harmless if unused.
