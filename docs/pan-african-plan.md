# BukkaPay — Pan-African platform: audit and build plan

Status as of 2026-11-12. This plan follows the master development prompt
(four products, one backend, one ledger). It lists what exists today, what
is unsafe, and the order of work. It is kept up to date as phases finish.

## Progress

**Status 2026-11-16 (not yet committed).** Phases 2–7 are built. Phases 8–10 are partly done; the open items are listed below.

### Cards: a Visa card on every wallet (2026-11-16)

- The old wallet "cards" were 16-digit numbers the backend generated itself, each with a random CVV. They passed the Luhn check but belonged to no card network, so they could never pay anywhere. Customers were still charged issuance and monthly fees for them. The code that generated them is deleted, along with the Stitch `virtualCardCreate` mutation it called (Stitch doesn't issue cards). The old `/api/cards/{id}/reveal` endpoint is gone too. Migration `0019_card_issuing` makes `wallet_cards.card_number` nullable, and nothing reads it any more. **Decision for the business:** whether to refund the fees already charged for those numbers.
- New `app/cards/`: an issuer-processor adapter (`sandbox`, refused in production; `none` until a Visa BIN sponsor and issuer-processor are contracted), card lifecycle, and real-time authorization.
- Every wallet requests a card when it's created (outbox `card.issue`). A worker sweep (`issue_pending_cards`) also catches existing wallets. Issuers need identity verification, so a card stays `pending_kyc` until the customer reaches KYC level 2, then issues automatically.
- BukkaPay never stores a PAN or CVV. Details are revealed through the issuer behind the PIN, and tap to pay uses Apple, Google or Samsung Pay wallet tokens (Visa Token Service).
- How money moves on the ledger: an authorization holds the wallet's funds in `card:holds`. Clearing captures the hold into `card:payable:<issuer>`. A reversal or expiry (7 days, or 31 for hotels and car hire) releases it. A clearing above the balance becomes `receivable:card_overdraft`: the card pauses, the overdraft is repaid from the next top-up, and then the card resumes. Fees for foreign transactions and ATM withdrawals come from the fee engine, and card spend has its own limit product (`card_spend`).
- Customers get card controls (online, contactless, chip, international, ATM, per-transaction and daily limits, blocked MCCs), plus freeze (no PIN needed), unfreeze, replace and reveal (PIN needed).
- Admin: a Visa Cards page with search, activity, and freeze, unfreeze and cancel with a reason. All actions are audited, and an admin freeze can't be undone by the customer.
- Reconciliation checks that the holds and overdraft accounts match their projections.
- Tests: `tests/test_cards.py` (21 tests).

### Other fixes in this pass

- **Email OTP** goes through Supabase Auth, with Resend as Supabase's SMTP sender. The old `/auth/otp/request` stored a code in Redis and never sent it. A verified code now confirms the email and signs the customer in. Google sign-in only accepts Google's own verified email.
- **Merchant verification tiers.** Registered businesses go through full KYB. Individual sellers (street vendors, tuck shops, individual landlords) are verified through the owner's own ID check (KYC level 2), with no business documents, and their collections are capped by the `merchant_individual` limit (ZA default: 5,000 per payment, 10,000 a day, 25,000 per 30 days). Admins set it per country, and a country without a rule doesn't offer the tier. An individual can upgrade to full KYB and keeps trading under the caps while the review runs. Rent and billing payments used to bypass KYB; they now go through the same gate.
- **Merchant features moved out of the customer app.** The landlord dashboard and billing links are now the merchant app's "Properties & rent" and "Bills" pages. The customer app has a "BukkaPay Business" screen that links there, and rent payment stays in the customer app. Billing links are now real merchant checkout links, so payments settle to the merchant.
- **Fake or broken flows fixed in the customer app:**
  - The tap-pay screen checked the PIN against a local default of "1234" and simulated a payment. It now uses the real phone-wallet token flow, with a sandbox simulator.
  - "Confirm payment" on a money request marked it paid without moving money. It now pays it.
  - Bill split called endpoints that didn't exist. It now sends real money requests.
  - Also removed: the home screen's "Add sample data" button, the fake Google sign-in, the dead demo reset link, `mockData.ts`, the "Issued by Stitch · Mastercard" labels, and the mixed-currency total.
- **Admin demo mode removed.** It showed fake users and transactions, granted every permission in the UI, and silently skipped actions.
- **Scale:**
  - The DB pool is configurable, with server-side statement, lock and idle-in-transaction timeouts, plus a transaction-pooler mode (`DB_PGBOUNCER`).
  - Outbox delivery drains in batches within a time budget, so card requests can't starve settlements.
  - Worker sweeps are bounded.
  - The card tables are indexed for open-hold scans.

### Website, admin-run content, and pipelines (2026-11-16)

- www.bukkapay.com was serving a separate Create React App build that isn't in this repository. It made claims the platform can't back up: PCI DSS compliance, 30+ countries, 5-second settlements, AI fraud detection, a 0.5% flat rate, 99.9% uptime, and launch promises like 0% fees for 90 days. Its stats counters also rendered "0+".
- `apps/website` replaces it. Its content is edited in **Admin → Website**: launch mode, announcement, store links, contact and social links, SEO, hero, features, use cases, pricing and FAQ.
  - Every save is validated, versioned and audited, and pushes a refresh to the site (`/api/revalidate`).
  - The site falls back to honest defaults if the API is down.
- A waitlist (`/public/waitlist`), with an admin list and CSV export, replaces the old site's waitlist. Old URLs redirect.
- Pipelines: `deploy-web.yml` deploys the website and merchant app to Vercel (PR previews, production on `main`, smoke test). CI installs are now lockfile-exact and typecheck every app. Railway runs `alembic upgrade head` before each API deploy.
- Next.js upgraded to 14.2.35, a security release.
- Migration `0020_website_content`. `0019` and `0020` were rehearsed down and up.
- Switching the domain needs Vercel and GitHub secrets: see `docs/deployment.md`.

### Still open

- **Business:** a Visa BIN sponsor and issuer-processor contract (adapter: `app/cards/issuers.py`). For tap to pay: Apple Pay in-app provisioning entitlement and Google Pay push provisioning approval, plus the issuer's native SDK in the Expo app (a development build, not Expo Go).
- Phase 9–10: load tests, backup and restore drill, a migration 0019 rehearsal on a production snapshot, a pilot launch checklist, and an external security review.

### Earlier: phase 2a + 2b + most of 2c (2026-11-12)

- Ledger: `backend/app/ledger/` (posting engine, chart of accounts, idempotency, DB triggers), models in `app/models/ledger.py`, migration `0016_ledger_and_currencies`.
- Every balance change now goes through `posting.post()`: P2P (same-currency and FX), card fees, maintenance fee, Stitch top-up and withdrawal, payment links (wallet and EFT), claim links, rent, travel booking and refund, and merchant pay and withdrawal. The database rejects any other write to `wallet_cards.balance`, `merchants.wallet_balance` or `ledger_accounts.balance`.
- Defects 1–6, 8 and 9 are fixed, along with others found during the work: Stitch verify had no ownership check, `merchant-pay` was unauthenticated and minted merchant balances, payment-link EFT never credited the link owner, claim and rent money could vanish, and payments used whichever card came first regardless of currency.
- `currencies` table replaces the `wallet_currency` enum (this also fixes `main` failing to import).
- Tests: `tests/test_ledger.py` (17 tests). Full suite: 89 passed, 1 pre-existing unrelated failure (`test_otp_request_and_verify_round_trip`).
- Migration 0016 was rehearsed upgrade → downgrade → upgrade on a production-shaped 0015 database with live-like balances.

Still open from 2a–2c: defect 10 (plaintext PAN/CVV); the community-contribution pledge counter (records contributions without moving money); PIN not required for withdrawals, merchant pay, travel or claims; the hard-coded `countries.py` directory; ledger reconciliation reports.

## 1. Repository audit

### What exists

| Area | Stack | State |
|---|---|---|
| `backend/` | FastAPI, SQLAlchemy 2 async, asyncpg, Alembic (15 migrations), Pydantic v2, ARQ + Redis | Substantial, about 11.5k lines. Auth (password, OTP, WebAuthn, transaction PIN), wallets ("wallet_cards"), P2P and FX send, payment links, claim links, merchants with staff and banking, rent, contributions, travel booking, loyalty, chat, KYC, notifications, Stitch top-up and withdrawal, bank-partner webhook scaffold, admin API with sessions and TOTP MFA. About 12 test modules against real Postgres. |
| `apps/customer/` | Expo SDK 54, expo-router, React Query, TS | Large: about 50 screens. Some duplicated `pages/` and `app/(screens)/` trees, and a `mockData.ts`. |
| `apps/admin/` | React + Vite + Tailwind + Radix (Replit pnpm workspace) | Real pages wired to the admin API: users, wallets, KYC, merchants, transactions, corridors, pricing, payment links, audit logs, broadcast, chat, travel. Stray Next.js files (`app/`, `next.config.mjs`) sit next to the Vite app. |
| `apps/merchant/` | Vite + React (about 180 lines) plus a stray Next `app/` | Scaffold only. Built `dist/` is committed. |
| `apps/website/` | Next 14 `app/` (home, plans, legal) plus stray Vite files | Scaffold only. Built `dist/` is committed. |
| CI | GitHub Actions: lint/type/test, security scan, deploy backend, deploy customer web | Present. |

### Critical financial and security defects (fix first)

1. **Customers can set their own balance.** `PATCH /api/cards/{id}/balance` writes any number to the caller's wallet (`wallet_service.update_wallet_card_balance`).
2. **Customers can create arbitrary transactions.** `POST /api/transactions` inserts client-supplied credit or debit rows.
3. **Top-up credits the amount the client claims, not the amount paid.** `stitch_service.verify_topup` and the redirect callback credit `amount` from the request after Stitch reports "completed". The Stitch query already returns the paid quantity but `get_payment_status` discards it. Paying R10 and claiming R10,000 credits R10,000.
4. **Top-ups are credited on a browser redirect.** The return URL handler credits the wallet. Replay protection is a Redis key only, not a database constraint.
5. **No row locking on any debit.** Every balance change is a read-modify-write on `wallet_cards.balance` with no `SELECT … FOR UPDATE`. Two concurrent sends can both pass the balance check, and a write can be lost. About 20 call sites are affected: send, payment links, claims, rent, travel, withdrawal, card fee, maintenance fee.
6. **Admins can overwrite balances.** `PATCH /admin/wallets/{id}/balance` is exposed in the admin UI.
7. **There is no ledger.** Balances are mutable columns. `Transaction` rows are descriptive, not double-entry, and nothing proves that money in equals money out.
8. **No idempotency on payment endpoints.** A retried request repeats the payment.
9. **Withdrawal debits before the disbursement result and has no pending state.** A failed disbursement after the debit loses customer funds unless handled manually.
10. **Card CVV and PAN are stored in plain text** in `wallet_cards`.

### Structural weaknesses

- The currency is a native Postgres enum (`wallet_currency`) and `ledger_policy.SUPPORTED_CURRENCIES` is hard-coded. Countries are a hard-coded Python list that maps unknown African currencies to USD.
- There are no country, custodian, provider, routing, corridor-readiness or fee-engine tables. Fees live in Redis-backed "pricing" config.
- Cross-border send credits the recipient in the same database transaction as the sender debit. There is no settlement step and no custody backing.
- Merchant QR codes are opaque `BKP-…` IDs, which is fine, but dynamic QR payloads are unsigned.
- The admin role model is two roles (`admin` and `super_admin`), with no granular permissions and no maker-checker.

## 2. Target architecture

```
apps/customer (Expo)   apps/merchant (Next)   apps/admin (Vite, kept)   apps/website (Next)
          \                    |                     |                       /
           +------------- api.bukkapay.com  /api/v1 (FastAPI) ---------------+
                                     |
     domain services: identity · wallets · ledger · payments · routing · fx
                      fees · merchants · compliance · reconciliation · webhooks
                                     |
       PostgreSQL (single authoritative DB) · Redis (rate limit, queue, cache)
                                     |
         provider adapters (Stitch, sandbox, bank-partner, PAPSS stub, ...)
```

Key decisions:

- **Ledger first.** Every money movement becomes a balanced journal (`journal_entries` plus `journal_lines`, balanced per currency). `wallet_cards.balance` stays as a cached projection that only the ledger posting service writes, under a row lock, in the same database transaction. Reconciliation checks that the projection equals the sum of journal lines.
- **Keep `wallet_cards` as the wallet entity** and add a ledger account per wallet. Renaming it would ripple through every client for no gain.
- **Existing balances are migrated honestly.** Each non-zero balance gets an opening journal against a per-currency `migration_suspense` account, flagged for reconciliation, because these balances were never ledger-backed.
- **Currencies and countries become tables.** The enum is relaxed to `VARCHAR(3)` plus a foreign key in a later additive migration.
- **Admin stays on Vite.** It already works. Rewriting it in Next.js is churn without user value. The stray Next files get removed. Merchant and website are scaffolds, so they get built properly in Next.js as the prompt asks.
- **Routes move under `/api/v1`** with the existing `/api` paths kept as aliases until the mobile app ships the new base.

## 3. Database schema plan (additive migrations)

| Migration | Tables |
|---|---|
| 0016 ledger core | `ledger_accounts`, `journal_entries`, `journal_lines`, `idempotency_records` |
| 0017 reference data | `currencies`, `countries`, `country_currencies`, `country_settings` |
| 0018 custody and providers | `custodians`, `country_custodians`, `custodian_accounts`, `payment_providers`, `provider_credentials_references`, `provider_transactions`, `provider_webhooks` |
| 0019 routing and FX | `payment_corridors` (supersedes `currency_corridors`), `fx_quotes`, `fx_transactions`, `liquidity_positions`, `settlement_instructions` |
| 0020 fees and limits | `fee_schedules`, `transaction_limits`, `wallet_restrictions` |
| 0021 payments | `transfers` (state machine), `funding_requests`, `withdrawal_requests`, `refunds`, `disputes`, `outbox_events` |
| 0022 RBAC and compliance | `permissions`, `role_permissions`, `admin_user_roles`, `approval_requests` (maker-checker), `kyc_records`, `kyb_records`, `screening_results`, `risk_events`, `compliance_cases` |
| 0023 reconciliation | `reconciliation_runs`, `reconciliation_items` |
| 0024 merchant | `merchant_qr_codes` (signed), `merchant_settlements` |

Rules: posted journal lines are immutable (corrections are reversals, enforced by a trigger), every journal balances per currency (enforced by a deferred constraint trigger), customer wallet accounts may not go negative, and idempotency keys are unique per (scope, key) and store the request hash and response.

## 4. Folder structure (backend additions)

```
backend/app/ledger/        accounts.py, posting.py, chart.py   (posting engine)
backend/app/payments/      transfers.py, funding.py, withdrawals.py, routing.py
backend/app/providers/     base.py, sandbox.py, stitch.py, papss.py (adapter stub)
backend/app/reference/     currencies.py, countries.py (DB-backed)
backend/app/compliance/    limits.py, screening.py (integration points)
backend/app/reconciliation/
```

## 5. Milestones

| Phase | Scope | Exit criteria |
|---|---|---|
| **2a (now)** | Close defects 1–6 and 8. Ledger core plus posting service. Route send, top-up and withdrawal through the ledger with row locks and idempotency. Opening-balance migration. | Concurrency tests show no double-spend. Every journal balances. Existing test suite green. |
| 2b | Route the remaining balance writers (payment links, claims, rent, travel, fees, contributions) through the ledger, and add a DB trigger that blocks direct `balance` writes outside posting. | `grep "\.balance ="` returns only the posting service. |
| 2c | Currencies and countries tables. Drop the hard-coded lists and the enum. | Adding a currency needs no code change. |
| 3 | Custodians, providers, corridors, routing engine, FX quotes with expiry, fee engine, sandbox adapters, cross-border transfer state machine (debit, then settlement, then credit). | A cross-border transfer credits the recipient only after the settlement event. |
| 4 | Merchant platform (Next.js): onboarding/KYB, dashboard, signed QR, links, hosted checkout, settlements, staff RBAC. | End-to-end merchant sale in the sandbox. |
| 5 | Admin: granular RBAC, maker-checker, country/currency/custodian/provider/corridor/fee screens, compliance cases, reconciliation, adjustment workflow replacing balance edit. | Every privileged action is audited. |
| 6 | Website (Next.js): all pages, availability from the API (live, pilot, planned), SEO, forms. | Lighthouse ≥ 90, no false availability claims. |
| 7 | Customer app: multi-wallet dashboard, quote-then-confirm sends, request money, link sharing, funding and withdrawal with pending states, contributions. | All flows hit real endpoints. `mockData` removed. |
| 8–10 | Webhook and outbox hardening, reconciliation engine, security review, load and backup tests, pilot launch configuration. | As in the prompt. |

## 6. Risks and dependencies

- **Regulatory:** each country needs a licensed custodian or e-money partner before real money moves. The code gates activation on readiness flags, but signing those agreements is a business dependency.
- **Live data:** if production already holds customer balances, the opening-balance migration must run against a production snapshot first, and the suspense totals must be reconciled with the Stitch and bank statements.
- **PAPSS:** access requires a sponsoring participant bank, so only an adapter interface and sandbox can be built.
- **Mobile release:** removing legacy endpoints must wait until the app version that stops calling them is adopted. The endpoints removed in 2a are not called by the current app.
- **Machine limits:** the local machine has about 2 GB RAM, so the full test suite and frontend builds run one at a time.
