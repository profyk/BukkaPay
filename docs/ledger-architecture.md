# BukkaPay ledger architecture (Milestone 1)

How BukkaPay keeps money correct: one PostgreSQL double-entry ledger for every
currency, every customer, merchant and BukkaPay's own books. This document is
the reference for Milestones 2–5 (APIs and rails, customer app, merchant POS,
admin and treasury).

## Stack

| Layer | Today |
|---|---|
| API | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic — `backend/` on Railway (`api.bukkapay.com`) + an arq worker |
| Database | PostgreSQL on Supabase (transaction pooler), row-level security on every table, Redis for sessions/rate limits |
| Customer app | Expo / React Native (iOS, Android, web at `app.bukkapay.com`) — `apps/customer` |
| Merchant app | Next.js 15 + React 19 at `merchant.bukkapay.com` — `apps/merchant` |
| Admin & treasury | Vite + React at `admin.bukkapay.com` — `apps/admin` |
| Website | Next.js 15 at `www.bukkapay.com` — `apps/website` |

## The non-negotiables, and where they are enforced

| Rule | Enforced by |
|---|---|
| Never mutate a balance directly | DB triggers refuse any change to `ledger_accounts.balance`, `wallet_cards.balance`, `merchants.wallet_balance`, `contribution_groups.current_amount` unless the posting engine flagged the transaction (`app/ledger/ddl.py`). |
| Every event is a balanced journal | `posting.post()` checks debits = credits **per currency**; a deferred constraint trigger re-checks every entry at COMMIT. |
| Immutable history | `journal_entries` / `journal_lines` are append-only (triggers); corrections are `posting.reverse()` mirror entries. |
| Exact money | `NUMERIC(20,2)` for every amount (ZAR, USD and BWP all have 2 minor digits); FX rates `NUMERIC(12,6)`; amounts must already be rounded to cents before posting. No floats anywhere. |
| No race conditions | `post()` locks every touched account (and its wallet / merchant / campaign projection) with `SELECT … FOR UPDATE` in id order, so concurrent postings serialise without deadlocks. Non-negative accounts can't go below zero. |
| Idempotency | `app/ledger/idempotency.py` (unique `(scope, key)`, payload hash). **Gap — see below.** Card authorisations dedupe on `(issuer, issuer_authorization_id)`. |
| Account segregation | `ledger_accounts.category` = `customer` / `merchant` / `system`, tied to the account code by check constraints (migration 0030). |

## Chart of accounts

Every account holds one currency. Customer and merchant accounts are created
per wallet / merchant; system accounts exist once per currency.

| Category | Code | Type | What it is |
|---|---|---|---|
| customer | `wallet:<card_id>` | liability | A customer's wallet balance (owed to the customer) |
| merchant | `merchant:<merchant_id>:<CCY>` | liability | A merchant's balance |
| system | see `SYS_*` below and `app/ledger/accounts.py` | — | BukkaPay's own books |

### SYS_* accounts (`app/ledger/chart.py`), one per currency (`_ZAR`, `_USD`, `_BWP`)

| System code | Ledger code | Type | Purpose |
|---|---|---|---|
| `SYS_SAFEGUARD_<CCY>` | `safeguard:<CCY>` | asset | Customer + merchant money held 1:1 at the safeguarding bank/custodian |
| `SYS_FX_POOL_<CCY>` | `fx:position:<CCY>` | asset | Currency bought/sold on swaps and cross-border transfers |
| `SYS_REVENUE_FX_<CCY>` | `revenue:fx:<CCY>` | revenue | FX spread |
| `SYS_REVENUE_MERCHANT_FEES_<CCY>` | `revenue:merchant_fees:<CCY>` | revenue | QR / checkout merchant fees |
| `SYS_REVENUE_CASHOUT_<CCY>` | `revenue:cashout:<CCY>` | revenue | Flat withdrawal fees |
| `SYS_REVENUE_INTERCHANGE_<CCY>` | `revenue:interchange:<CCY>` | revenue | Card interchange |
| `SYS_FLIGHT_SETTLEMENT_<CCY>` | `payable:travel_operators:<CCY>` | liability | Ticket money owed to airlines |
| `SYS_CARD_HOLD_ESCROW_<CCY>` | `card:holds:<CCY>` | liability | Approved card authorisations not yet cleared |

Other system accounts already in use: `clearing:<provider>:<CCY>` (money at a
PSP), `payouts:pending:<CCY>`, `escrow:claims:<CCY>`, `campaign:<id>`,
`transit:outbound:<CCY>`, `card:payable:<issuer>:<CCY>`,
`receivable:card_overdraft:<CCY>`, `adjustments:<CCY>`, `suspense:migration:<CCY>`,
and the legacy `revenue:fees:<CCY>` (all fees before the revenue split).

## Posting recipes

Debits on the left, credits on the right; liability balances grow with credits.

| Operation | Debit | Credit | Notes |
|---|---|---|---|
| `transferP2P` (0%) | sender `wallet` | recipient `wallet` | same currency only |
| `payMerchantQR` (fee f%) | payer `wallet` (amount) | `merchant` (amount − fee) + `SYS_REVENUE_MERCHANT_FEES` (fee) | fee 0.5–1.0% from `fee_schedules` |
| `swapCurrency` A→B at rate r, spread s | `wallet` A (amount) | `SYS_FX_POOL_A` (amount) | then `SYS_FX_POOL_B` debit (converted) → `wallet` B credit (converted − spread) + `SYS_REVENUE_FX_B` (spread). Each currency balances on its own. |
| `payForFlight` | `wallet` | `SYS_FLIGHT_SETTLEMENT` | airline confirms first; refund reverses what the airline refunds |
| `processCashOut` (flat fee) | `wallet` (amount + fee) | `payouts:pending` (amount) + `SYS_REVENUE_CASHOUT` (fee) | payout confirmed → `payouts:pending` → `clearing:<rail>` |
| Cash-in (top-up) | `clearing:<rail>` | `wallet` | rail settlement then moves clearing → `SYS_SAFEGUARD` |
| Card auth (hold) | `wallet` | `SYS_CARD_HOLD_ESCROW` | <100 ms; dedupe on issuer auth id |
| Card settle | `SYS_CARD_HOLD_ESCROW` | `card:payable:<issuer>` (+ `SYS_REVENUE_INTERCHANGE` when the issuer shares it) | |
| Card reverse | `SYS_CARD_HOLD_ESCROW` | `wallet` | |

## Proof of reserve (`app/ledger/reserves.py`)

Per currency, **never added across currencies**:

- **Owed** = sum of liability balances held for customers and merchants:
  `wallet:*`, `merchant:*`, `campaign:*`, `escrow:*`, `card:holds:*`,
  `payouts:pending:*`, `transit:outbound:*`.
- **Held** = the latest `custodian_balance_snapshots` balance for each
  safeguarding custodian (from its statement or API), summed.
- Covered when **Held ≥ Owed**; the admin monitor (Milestone 5) shows owed,
  held, surplus/shortfall, coverage ratio and how old the custodian figure is.

## Migration plan

| Migration | What | Status |
|---|---|---|
| 0016–0027 | Ledger, triggers, currencies, network, RLS, accounts, account types | live |
| 0028–0029 | Flights only (buses retired); five more admin roles | live |
| **0030** | `category` + `system_code` on `ledger_accounts` with check constraints; SYS_* accounts for ZAR/USD/BWP; `custodian_balance_snapshots` | this milestone |
| 0031 (M2) | Required `Idempotency-Key` on every money mutation (P2P, QR pay, swaps, flights, cash-out, claims, payment links, merchant payouts); revenue split at every fee call site; own-wallet currency swap; merchant fee tiers 0.5–1.0% | next |

## Gaps closed next (Milestone 2)

1. **Idempotency on every money mutation.** Today only P2P and cross-border
   transfers accept `Idempotency-Key`, and it's optional. Plan: accept it
   everywhere now, have the apps send it, then make it required.
2. **Revenue split.** Fees still land in `revenue:fees:<CCY>`; route each to
   its `SYS_REVENUE_*` account (history stays where it is).
3. **`swapCurrency`** for a customer's own wallets (live rate + configurable
   spread), and auto-conversion for merchants accepting foreign currency.
4. **Merchant fee** is 1.5% today; move to configurable 0.5–1.0% tiers.
5. **Rail adapters:** Stitch/PayShap (exists), mobile money (BW), Yellow Card
   rebalancing, Smile ID KYC, card issuer webhooks named
   `/webhooks/card/{auth,settle,reverse}` (today `/api/card-issuer/{issuer}/authorize|events`).
