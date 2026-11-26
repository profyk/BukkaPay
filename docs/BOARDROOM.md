# BukkaPay Boardroom

Investor relations, financial intelligence and corporate governance for BukkaPay's directors, investors and shareholders.
Domain: `board.bukkapay.com` (already configured in `BOARD_WEB_URL`; confirm DNS before go-live).

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Frontend | `apps/admin/artifacts/bukkapay-admin/src/board/` (built with `APP_TARGET=board`, entry `board/index.html`) | Its own Vercel project, domain and origin. Shares the admin workspace's UI kit and Tailwind, but none of its pages or API client. React + TypeScript + Tailwind + Recharts. |
| API | `backend/app/api/board.py` (auth, sessions) and `backend/app/api/boardroom.py` (everything else), under `/api/board/*` | Existing FastAPI service on Railway. |
| Logic | `backend/app/board/` | `permissions.py` (roles, deny by default), `analytics.py` (ledger aggregates), `governance.py` (votes, statements, reports, documents, insights), `money.py` (decimal money and historical FX), `audit.py`, `notify.py`, `service.py` (auth, overview). |
| Data | Supabase Postgres, migration `0045_boardroom` | 26 new tables, new columns on the 0044 board tables, triggers in `app/db/board_guard.py`, RLS on every table. |
| Files | Existing private Supabase bucket `documents`, prefix `boardroom/` | 2-minute signed URLs; storage paths never leave the API. |
| Email | Existing Resend integration | Invitations, sign-in codes for legacy members, password resets, notifications. Emails never contain figures. |

**Why not a separate Next.js app.** The brief suggested `apps/boardroom` on Next.js. A board portal already existed here as a separate Vite build with its own deployment and sign-in boundary. Rebuilding it in a second framework would have duplicated the UI kit and the deployment for no gain in isolation. The boundary that matters is enforced on the server: separate accounts, separate session tables, separate routes and a separate origin.

**Separation from the operational admin panel.** Boardroom members live in `board_members`, not `admin_users`, and sessions live in `board_sessions`. `admin_auth` never accepts a Boardroom token, and the Boardroom routes never accept an admin token. The owner gets into the Boardroom only through a 60-second single-use pass issued by the admin panel, which already required their password and authenticator.

## Roles and permissions (deny by default)

A member's permissions are their role's set, plus personal grants, minus personal denies. The role is always read from the database. Every route declares `require("<permission>")`.

| Role | Reads | Manages |
|---|---|---|
| Company Super Administrator (owner only) | everything | everything |
| Chair | director set + audit trail | meetings, resolutions, documents, approves budget changes |
| Executive Director | director set | announcements, milestones, risks, custodian statements, proposes budgets and records spending, documents |
| Non-Executive Director | dashboard, reports, adoption, analytics, revenue, financial statements, cross-border, POS, FX, custodians, countries, investors, use of funds, milestones, risks, governance, resolutions (and voting), documents, announcements, insights | none |
| Investor | dashboard, reports, adoption, analytics, fundraising, own investment, documents, announcements | none |
| Shareholder | investor set + resolutions (and voting as a shareholder) | none |
| Financial Observer | nothing until granted item by item | none |

Owner-only, never grantable: `users.manage`, `reports.publish`, `investors.manage`, `financials.manage`. Investors and shareholders can't be granted `investors.view` (other investors' records).

## Authentication

- Invitation only, valid 7 days and usable once. Accepting it sets a password (12+ characters, not letters only) **and** enrols an authenticator app (TOTP). The TOTP secret is encrypted with `CARD_DATA_KEY` (`EncryptedText`).
- Sign-in is password, then an authenticator code. Each code is accepted once (replay-protected in Redis). After 5 failures the account locks for 15 minutes; failures are logged.
- Members who joined before authenticators were required get one emailed code, then must enrol before any data endpoint answers (403 until `mfaReady`).
- Password reset needs the emailed link **and** an authenticator code, then ends all sessions.
- Sessions last 12 hours and end after 30 minutes idle. They're kept in sessionStorage, sent as a bearer header (never a cookie, so there is no CSRF exposure), and can be revoked by the member or the owner. Suspension and revocation end every session at once.

## Financial integrity rules (as implemented)

- Money is `Decimal` end to end and leaves the API as strings at the currency's own precision (`app.core.money.EXPONENT`).
- Per-currency figures are never added across currencies. A converted total is only shown with its methodology: original amount and currency, rate, rate date, source and reporting currency (`RateBook.convert_line`, `methodology()`).
- **Historical rates:** `board_fx_rates` stores a daily mid-rate snapshot from the FX feed (the worker's refresh, plus on demand). Each month converts at the last snapshot on or before its final day. A currency with no rate for a period is listed as unconverted, never guessed. *The pre-existing board portal converted past months at today's rate; this is fixed.*
- Revenue = credits to ledger `revenue` accounts. Transaction volume is computed and shown separately and is never called revenue. Customer and merchant balances are liabilities. P2P transfers are counted once (money leaving the sender's wallet). Opening balances, sandbox, test funding and manual adjustments are excluded from activity.
- Revenue stream status (operational, in development, planned, disabled) is set by the owner. A non-operational stream shows no amount unless the ledger actually booked revenue to it.
- Financial statements: revenue and direct costs come from the ledger; operating expenses, balance sheet and cash flow come from the monthly management accounts. Missing months are labelled `incomplete`, and with no accounts at all the statements say `unavailable`. A balance sheet is never built from wallet transactions. Client money is shown separately, off balance sheet.
- Published reports are frozen (snapshot + methodology + SHA-256). The database refuses edits and deletes; a correction is a new version that supersedes the old one.
- Custodian balances are labelled by source (live integration, manual statement, management-reported). "Reconciled" requires evidence (a document or a live feed) and an exact match with the ledger.
- Share ownership is computed from register lines copied from the legal register; nothing issues shares.

## Database: migration `0045_boardroom`

New tables: `boardroom_audit_logs` (append-only), `board_fx_rates`, `board_reporting_periods`, `board_report_publications` (immutable once published), `board_budgets`, `board_kpi_targets`, `board_revenue_streams` (11 seeded rows), `investor_profiles`, `funding_rounds`, `investor_investments`, `shareholder_records`, `capital_allocations`, `capital_allocation_changes`, `capital_expenditures`, `business_milestones`, `company_risks`, `custodian_reconciliations`, `board_documents`, `board_meetings`, `board_meeting_attendees`, `board_agenda_items`, `board_minutes` (frozen once published), `board_resolutions` (frozen once concluded), `board_resolution_eligibility`, `board_resolution_votes` (append-only), `board_notifications`.

New columns with server defaults: `board_members` (role, grants, denies, MFA, reset token, suspension, appointment, phone), `board_sessions` (last seen, user agent), `board_access_log.details`, `board_financials` (extra expense lines, below-EBITDA lines, balance sheet, cash flow, accounts status), `board_updates` (category, audience, attachments). Existing members default to role `investor`.

The migration is additive and ends with `rls.ENABLE`. It was rehearsed on a copy of the 0044 schema holding existing rows: upgrade, downgrade, re-upgrade, and `alembic check` (no drift). It applies on deploy through the normal `alembic upgrade head` pre-deploy step.

## API

All under `/api/board`. Auth: `auth/accept/start`, `auth/accept`, `auth/login`, `auth/verify`, `auth/owner`, `auth/me`, `auth/mfa/setup`, `auth/mfa/confirm`, `auth/forgot`, `auth/reset`, `auth/password`, `auth/sessions`, `auth/sessions/{id}/revoke`, `auth/logout`.
Analytics: `dashboard`, `overview`, `adoption`, `currencies`, `wallets`, `revenue`, `financials`, `financials.csv`, `cross-border`, `pos`, `fx`, `custodians`, `custodians/reconciliations`, `countries`, `health`, `insights`, `export.csv`.
Capital: `investments/me`, `fundraising`, `investors`, `rounds`, `investors/{id}/investments`, `investments/{id}`, `investors/{id}/shareholdings`, `shareholdings/{id}`, `use-of-funds`, `use-of-funds/changes`, `use-of-funds/changes/{id}/decide`, `use-of-funds/expenditures`.
Governance: `milestones`, `risks`, `meetings` (+ `/status`, `/agenda`, `/attendance`, `/minutes`), `resolutions` (+ `/open`, `/vote`, `/conclude`, `/cancel`), `documents` (+ `/download`, `/archive`), `announcements`, `notifications`, `notifications/read`, `reports` (+ `/{id}`, `/pdf`, `/approve`, `/publish`, `/correct`, `/withdraw`).
Administration: `users` (+ invite, patch, suspend, reactivate, revoke, sessions/revoke, mfa/reset, resend, history), `audit`, `settings/accounts`, `settings/periods`, `settings/budgets`, `settings/targets`, `settings/revenue-streams`.

## Environment variables (names only)

Already set for the API: `BOARD_WEB_URL` (defaults to `https://board.bukkapay.com`), `RESEND_API_KEY` and its sender settings, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CARD_DATA_KEY`, `DATABASE_URL`, `REDIS_URL`, `FX_FEED_URL` (optional).
New and optional, off unless set: `BOARDROOM_AI_PROVIDER` (only `anthropic` is supported), `BOARDROOM_AI_API_KEY`, `BOARDROOM_AI_MODEL`. AI summaries only ever receive company aggregates.
Vercel (board project): `APP_TARGET=board`, root directory `apps/admin`.
CORS: `https://board.bukkapay.com` must be in `ALLOWED_ORIGINS` if the board app calls the API cross-origin (the same pattern as the other apps).

## Deployment

1. Merge to `main`. CI deploys the API to Railway, and the pre-deploy step runs `alembic upgrade head` (applies 0045).
2. Vercel: the board project (root `apps/admin`, `APP_TARGET=board`) builds from `main`. If it doesn't exist yet, create it and add `board.bukkapay.com` (DNS in Vercel).
3. Check: `GET /healthz`; then open the Boardroom from Admin → Board & Investors → Open board portal.
4. Existing board members: on their next sign-in they get one emailed code, then must set up an authenticator.

**Rollback.** Redeploy the previous Vercel build and Railway release. The migration is additive and older code ignores the new tables and columns, so it can stay. If it must be removed, `alembic downgrade 0044_board_portal` drops the Boardroom tables (and their data).

**Monitoring.** Watch for 401/403 spikes on `/api/board/auth/*` (credential stuffing), `sign_in_failed` in the access log, `board_fx_snapshot_failed` in the worker logs, and custodian alerts on the Custodians page.

## Tests

`backend/tests/test_boardroom.py` (18 tests) and `backend/tests/test_board.py` (2 tests) cover: deny by default, role boundaries, no access to the admin or customer APIs, MFA enrolment and legacy enforcement, single-use TOTP, lockout logging, password reset with MFA, suspension and session revocation, investor isolation, revenue vs volume, decimal strings, historical FX, statements labelled incomplete or unavailable, period locks, frozen reports and corrections (database triggers), board and weighted shareholder voting (forged and double votes, eligibility, quorum, thresholds), documents (audience, content sniffing, versions, signed links), meetings and minutes, use-of-funds approval, custodian evidence rules, an append-only audit trail with no secrets, and aggregate-only analytics.

## Not yet available, and what's needed

- **App installs:** not tracked; needs App Store / Play Console data.
- **Platform availability:** no uptime monitor is connected.
- **POS terminals:** BukkaPay cards run on the networks' terminals, so terminal counts aren't available. Card figures are sandbox until a production issuer is active.
- **Operating expenses and profit by country:** management accounts are company-wide.
- **FX conversion success rate:** refused quotes aren't recorded.
- **Custodian live balances:** no custodian has a production integration; statements are entered manually.
- **AI insights:** off until a provider key is configured.
