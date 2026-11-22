# BukkaPay — status, done & to do

Last updated: 2026-11-22. Living document: update it with every pull request.

**Vision:** a pan-African cash-replacement and AfCFTA cross-border trade
super-app — ZAR, BWP and USD first — keeping everyday money and SME trade
inside a zero-cost closed-loop double-entry ledger, connected to regulated
rails (PayShap, PAPSS, mobile money, virtual cards) at the edges.

Related: [ledger & trade architecture](ledger-architecture.md) ·
[architecture](architecture.md) · [deployment](deployment.md) ·
[launch checklist](launch-checklist.md) · [legal review notes](legal-review-notes.md)

## Where things run

| Piece | Where | Deploys |
|---|---|---|
| API + worker (FastAPI, Python 3.12) | Railway, `api.bukkapay.com` | GitHub Actions "Deploy backend to Railway" on `main` (or `railway up`); migrations run on start |
| Database | Supabase PostgreSQL (pooler 6543), RLS on every table | Alembic migrations with the API |
| Customer app (Expo) | `app.bukkapay.com` + iOS/Android | Vercel on `main` |
| Merchant dashboard (Next.js 15) | `merchant.bukkapay.com` | Vercel on `main` |
| Admin panel (Vite/React) | `admin.bukkapay.com` | Vercel on `main` |
| Website (Next.js 15) | `www.bukkapay.com` | Vercel on `main` |

Every pull request runs CI: backend lint + full test suite on Postgres, the
four app typecheck/builds, dependency scan (fails on critical, fixable CVEs)
and secret detection.

---

## Done

### Accounts, sign-in and separation
- [x] **Personal vs Business accounts** (migration 0027): personal = BukkaPay app, business = merchant dashboard; one gate on every signed-in request; wrong-app sign-in is refused with a pointer to the right site.
- [x] **Admins are separate people:** an admin email can't be a customer/business account and vice versa (API + database triggers).
- [x] **Google sign-in** live on the customer app and merchant dashboard (one Google web client, shared with Supabase). Sign-up asks for username, phone and country.
- [x] **Merchant dashboard sign-up** (email, Google, Apple) creating Business accounts.
- [x] **Email codes only confirm a sign-up** (pop-up after sign-up or on the next sign-in of an unconfirmed account); never a way to sign in to a verified account. "Email me a sign-in code" removed.
- [x] **Branded emails everywhere:** the API's sender wraps every email in the BukkaPay layout; invite and password-reset redesigned; all six Supabase auth templates branded; Supabase redirect allow-list fixed (old Firebase URL removed).

### Admin & security
- [x] **Sole super admin** = the owner (profykersha18@gmail.com), enforced by DB trigger + unique index (0024): no one else can be made super admin; the owner can't be demoted, suspended, renamed or deleted.
- [x] **Admin invites:** emailed one-time link; the invitee sets a password and enrols an authenticator app (MFA) before the account exists; resend/cancel in the panel. Owner recovery invite via master key only.
- [x] **MFA fixed:** authenticator codes now match real apps (RFC 6238 test vectors); the code is asked for in a pop-up only after the password is accepted; admin MFA columns added in production (0026).
- [x] **Master key locked down:** in production it can only send the owner's recovery invite; first-time setup is closed.
- [x] **Only the owner appoints a CEO.** Admin sign-out ends the session on the server.
- [x] **Five more admin roles** (0029): Risk Analyst, KYC Analyst, Treasury Manager, Marketing Manager, Travel Manager — least privilege; only the owner's role manages admins.
- [x] **Endpoint hardening:** claim-link payouts need the PIN inside the locked transaction and PIN attempts are really counted; cash pickup confirmation is staff-only; payment-link payer lists owner-only; rate limits on admin login/setup, password reset, passkey sign-in, claim links, tenant lookup.
- [x] **Dependencies:** Next.js 14 → 15.5.28 + React 19 (merchant, website); shell-quote and tar patched (customer). Dependency scan clean. *(PR #34 — merge pending)*

### Admin panel
- [x] New pages: **Treasury** (platform wallet + every ledger account with postings), **Stokvels & contributions**, **Website enquiries** inbox.
- [x] **BukkaPay look:** purple theme, ink sidebar with logo tile and "Admin Console", avatar + role name.
- [x] Travel menu renamed to Airlines / Flight Routes.

### Travel & cards
- [x] **Flights platform:** one provider interface — BukkaPay inventory + **Duffel** (300+ airlines, on when `DUFFEL_ACCESS_TOKEN` is set). Airport search, merged fares, seat locking, airline-grade passenger checks (passport for international), PIN, ledger-backed booking/refund, booking reference; new customer flight screens.
- [x] **Buses retired** (0028): no new bus listings, existing ones switched off, history kept.
- [x] **Cards:** the app never invents or pads card numbers; wallets without an issued card show the issuer status.

### Ledger (Milestone 1) *(PR #35 — merge pending)*
- [x] **Strict segregation:** `ledger_accounts.category` = customer / merchant / system, tied to the code by check constraints.
- [x] **SYS_* chart of accounts** per currency (ZAR/USD/BWP): SAFEGUARD, FX_POOL, TRADE_ESCROW, REVENUE_FX / MERCHANT_FEES / ESCROW_FEES / CASHOUT / INTERCHANGE, FLIGHT_SETTLEMENT, CARD_HOLD_ESCROW.
- [x] **Proof of reserve:** custodian balance snapshots vs customer + merchant + escrow liabilities, per currency.
- [x] **AfCFTA trade schema:** trade invoices + items, escrow contracts, append-only escrow events, hash-chained trade receipts.
- [x] **Design doc:** [ledger-architecture.md](ledger-architecture.md).

### Workflows
- [x] CI and deploy workflows all repaired (Trivy version, pinned ruff rules, admin TypeScript, Railway service names, scan permissions); customer web deploy is manual-only (Vercel builds production).

---

## To do

### Needs the owner
- [ ] **Merge PR #34** (security upgrades) and **PR #35** (Milestone 1).
- [ ] **Rotate the Supabase database password** (part of it appeared in an error message), then update `DATABASE_URL` on Railway (API + worker) and `Documents\BukkaPay-backups\supabase-db-url.txt`.
- [ ] **Revoke the Supabase access token** used for the config script, and delete `Documents\BukkaPay-backups\supabase-access-token.txt`.
- [ ] **Duffel access token** (test first) → Railway `DUFFEL_ACCESS_TOKEN`; fund the Duffel balance before live bookings.
- [ ] **Apple Sign In:** Apple Developer account, Services ID for `app.` and `merchant.bukkapay.com`.
- [ ] **Company details** in Admin → Legal Documents (legal name, registration number, address, Information Officer) so legal pages lose their placeholders; publish reviewed versions.
- [ ] Check whether any account converted to Business still has money in a personal wallet.

### Milestone 2 — Backend APIs, trade escrow, receipts, webhooks, rails
- [ ] Required `Idempotency-Key` on every money mutation (P2P, QR pay, swaps, flights, cash-out, claims, payment links, merchant payouts, escrow).
- [ ] Route every fee to its `SYS_REVENUE_*` account.
- [ ] `swapCurrency` (own wallets, live rate + configurable spread); merchant auto-FX settlement.
- [ ] Merchant fee tiers 0.5–1.0% (configurable).
- [ ] Trade: issue/pay invoices, `createTradeEscrow`, `releaseTradeEscrow` (1.0–1.5% fee), refunds, disputes, auto-release.
- [ ] Trade receipt generator: canonical JSON + PDF, SHA-256 hash chain, verification endpoint.
- [ ] Card issuer webhooks at `/webhooks/card/{auth,settle,reverse}` (<100 ms auth holds) for Onafriq / EFT Corporation.
- [ ] Rail adapters: Stitch/PayShap (exists), Botswana mobile money, Yellow Card / PAPSS / ADLA rebalancing, Smile ID KYC.

### Milestone 3 — Customer & trader app
- [ ] Home wallet switcher (ZAR/USD/BWP), live FX converter, unified feed.
- [ ] Bottom-centre Scan QR, My QR, @username / phone pay.
- [ ] Pay Supplier hub: search verified merchants, Instant vs Protected Escrow pay, download/share PDF receipt.
- [ ] Virtual cards hub (create, reveal behind biometrics, freeze, limits, notifications).
- [ ] Add/withdraw money (PayShap, mobile money).

### Milestone 4 — Merchant & wholesaler POS
- [ ] Static/dynamic QR till with audio "Payment received".
- [ ] Trade invoice builder (items, HS codes) + WhatsApp share link/QR, instant or escrow.
- [ ] Multi-currency acceptance with auto-FX into settlement currency.
- [ ] Daily totals, fee breakdown, cashier logins (accept-only), supplier/bank payouts.

### Milestone 5 — Admin & treasury
- [ ] Safeguarding / proof-of-reserve monitor (owed vs held per currency, staleness alerts), custodian balance capture.
- [ ] Fee & FX engine controls (spreads, QR fee %, escrow fee %, cash-out fees, tier limits).
- [ ] Trade escrow dispute desk; AML desk; Smile ID review; regulatory / AfCFTA trade report export.
- [ ] Treasury rebalancing: trigger and track cross-border pool settlements.
- [ ] Review settings, dashboard and remaining admin pages end to end.

### Website
- [ ] Redesign www.bukkapay.com around the cash-replacement and AfCFTA trade vision *(in progress)*.

---

## Pull request log

| PR | What | Status |
|---|---|---|
| #32 | Flights with airline APIs, buses retired, no invented card numbers | merged |
| #33 | Five admin roles, Treasury/Stokvels/Enquiries, admin look | merged |
| #34 | Next.js 15.5.28 + React 19, shell-quote/tar patches | open — awaiting merge |
| #35 | Milestone 1: ledger segregation, SYS_* chart, proof of reserve, trade schema | open — awaiting merge |
