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
- [ ] **Merge PR #34** (security upgrades), then **PR #35** (Milestone 1) and **PR #36** (website).
- [ ] **Rotate the Supabase database password** (part of it appeared in an error message), then update `DATABASE_URL` on Railway (API + worker) and `Documents\BukkaPay-backups\supabase-db-url.txt`.
- [ ] **Revoke the Supabase access token** used for the config script, and delete `Documents\BukkaPay-backups\supabase-access-token.txt`.
- [ ] **Duffel access token** (test first) → Railway `DUFFEL_ACCESS_TOKEN`; fund the Duffel balance before live bookings.
- [ ] **Apple Sign In:** Apple Developer account, Services ID for `app.` and `merchant.bukkapay.com`.
- [ ] **Company details** in Admin → Legal Documents (legal name, registration number, address, Information Officer) so legal pages lose their placeholders; publish reviewed versions.
- [ ] Check whether any account converted to Business still has money in a personal wallet.

### Milestone 2 — Backend APIs, trade escrow, receipts, webhooks, rails *(PR #37)*
- [x] Trade invoices (itemised, HS codes), Instant Pay, Protected Escrow Pay (fund → confirm / dispute → admin resolve, 14-day auto-release), cross-currency payment through the FX pools.
- [x] Hash-chained AfCFTA Trade & Payment Receipts (JSON + PDF) with public verification.
- [x] `swapCurrency` between own wallets (rate + spread → SYS_REVENUE_FX, price protection).
- [x] Fees routed: merchant fees → SYS_REVENUE_MERCHANT_FEES, withdrawal fees → SYS_REVENUE_CASHOUT, escrow fees → SYS_REVENUE_ESCROW_FEES.
- [x] Pricing (migration 0031): P2P free, merchant payments 1.0%, trade escrow 1.0% (clamped 1.0–1.5%).
- [x] Card issuer webhooks at `/webhooks/card/{auth,settle,reverse}` (signed, exactly-once settle/reverse).
- [x] Partner adapters: mobile money, Yellow Card / PAPSS / ADLA treasury rebalancing, Smile ID KYC — sandbox + live, live refuses until configured.
- [x] Admin endpoints: escrow dispute desk, proof of reserve, custodian balance capture.
- [ ] Required `Idempotency-Key` on the *existing* money endpoints (new trade/swap endpoints already require it) — do with the app updates in Milestone 3 so clients send keys first.
- [ ] Wire Smile ID into the KYC flow and mobile money into add/withdraw money once partners are signed.

### Milestone 3 — Customer & trader app *(PR #38)*
- [x] Home wallet switcher (ZAR/BWP/USD); Scan QR is the bottom-centre tab; Swap and Supplier quick actions.
- [x] Swap screen (live quote, rate + spread, PIN, price protection).
- [x] Pay Supplier hub: invoice from link `/trade/TINV-…`, QR or reference; Instant vs Protected Escrow Pay; auto-FX from any wallet; receipt download/share; My escrows.
- [x] Escrow detail: confirm goods, dispute, timeline, receipts.
- [x] Every new money call sends an Idempotency-Key reused on retry.
- [x] Idempotency on every money route (Redis middleware); both apps send keys automatically on every mutating request *(PR #41)*.
- [ ] Virtual cards hub polish (create, biometric reveal, limits, notifications) — today's card screen already reveals via the issuer and freezes.
- [ ] Add/withdraw via mobile money once a BW operator is signed.

### Milestone 4 — Merchant & wholesaler POS *(PR #39)*
- [x] Trade invoice builder (items, HS codes, origin, ZAR/BWP/USD, instant/escrow/either, incoterm, tax) with WhatsApp share; invoice list and cancel.
- [x] Escrow view for suppliers (held, net after fee, release date, dispute).
- [x] Till alert: banner, chime and spoken "Payment received: R150.00" for every new payment.
- [ ] Auto-FX settlement for merchants accepting a foreign-currency wallet at the QR till (trade invoices already convert).
- [ ] Supplier payouts to other BukkaPay businesses.

### Milestone 5 — Admin & treasury *(PR #40)*
- [x] Safeguarding monitor: owed vs held per currency, surplus/shortfall, coverage, stale custodian figures, record custodian balances.
- [x] Trade escrow desk: counts, held per currency, dispute queue, timeline, release/refund with a recorded decision.
- [x] FX desk: swap rates and spreads per pair (guarded against >10% jumps and audited), FX pool positions and FX revenue; trade_escrow can be managed on Fees & Limits *(PR #47)*.
- [ ] Treasury rebalancing screen on top of `app.integrations.partners.treasury`.
- [x] AfCFTA trade report CSV (one row per invoice line: HS code, origin, parties, countries, escrow outcome), with the export audited *(PR #47)*.

### Product focus & clean-up *(PR #41)*
- [x] **Rental retired.** Rent collection (properties, tenants, rent links) is outside BukkaPay's core of cash replacement plus cross-border trade. The API routes, service, schemas and the customer and merchant screens are removed. Tables and past rent payments are kept, since the ledger is immutable. Anyone who wants to collect rent can use payment links, bills or QR.
- [x] Removed the unreachable gamification screen, the dead "Referral Program" tile and the Replit artifact config.
- [x] Removed 35 unused admin UI components.
- [x] Pay Supplier and Swap now appear in the features hub and search; the scanner opens trade invoice QR codes.

### Admin console & platform hygiene *(PR #47)*
- [x] New sign-in portal and app icon; installable as **BukkaPay Console** (browser install, deliberately not in app stores); fixed the MFA code input.
- [x] Removed 22 unused admin packages; React 19.3.1 across the web apps; GitHub Actions v7.
- [ ] Dependabot: Next 16 (#29), TypeScript 7 (#3) and Expo-pinned packages (#4, #6, #9) were closed. Upgrade them deliberately (Next 16 migration; Expo SDK upgrade), not one at a time.

### Website
- [x] Redesign www.bukkapay.com around the cash-replacement and AfCFTA trade vision: new look, new home, /trade and /travel pages, new default copy *(PR #36 — merge pending)*.
- [ ] After merging #36, reset Admin → Website → Home if an admin had saved older homepage text (saved text overrides the new defaults).

---

## Pull request log

| PR | What | Status |
|---|---|---|
| #32 | Flights with airline APIs, buses retired, no invented card numbers | merged |
| #33 | Five admin roles, Treasury/Stokvels/Enquiries, admin look | merged |
| #34 | Next.js 15.5.28 + React 19, shell-quote/tar patches | open — all checks green |
| #35 | Milestone 1: ledger segregation, SYS_* chart, proof of reserve, trade schema | open — all checks green |
| #37 | Milestone 2: trade escrow, receipts, swaps, card webhooks, partner adapters, pricing | open — base #35 |
| #38 | Milestone 3: customer app | open — base #37 |
| #39 | Milestone 4: merchant trade invoices & till alerts | open — base #38 |
| #40 | Milestone 5: safeguarding monitor & escrow desk | open — base #39 |
| #41 | Idempotency everywhere, rental retired, clean-up | open, based on #40 |
| #36 | Website redesign: cash-free Africa and AfCFTA trade vision | open — green except dependency scan (clears once #34 is in `main`) |
