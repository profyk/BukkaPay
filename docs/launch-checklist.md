# Pilot launch checklist

Work through this before real customers' money moves. Items marked
**(done 2026-11-19)** were completed and checked; everything else is open.

## 1. Email codes (Supabase Auth + Resend)

The API sends and checks one-time email codes through Supabase Auth, and
Supabase delivers them through Resend's SMTP. Project `jvsfdmoseeztjlfibvmm`.

- [x] SMTP: `smtp.resend.com:465`, user `resend`, sender `BukkaPay <noreply@bukkapay.com>` (done 2026-11-19, already in place)
- [x] Codes are 6 digits and expire after 600 s, matching the app's 6-digit field (done 2026-11-19; was 8 digits, so every code was rejected)
- [x] Branded code templates (`{{ .Token }}`, no links) for Confirm sign up, Magic link or OTP, Reset password, Change email, Reauthentication, Invite (done 2026-11-19)
- [x] Site URL `https://app.bukkapay.com`; redirect allow-list `https://app.bukkapay.com/**`, `https://merchant.bukkapay.com/**`, `https://www.bukkapay.com/**`, `bukkapay://**`, `http://localhost:8081/**` (done 2026-11-19)
- [ ] Remove the stale redirect `https://bukkapay-app-52971636-8f04f.web.app/login` once nothing uses the old Firebase app
- [ ] Resend: `bukkapay.com` verified (SPF, DKIM, DMARC) and a test code received in Gmail and Outlook, not in spam
- [ ] Railway: `SUPABASE_URL` and `SUPABASE_ANON_KEY` set on the API service

## 2. Sign in with Google and Apple

The app sends the provider's ID token to `/api/auth/google` or
`/api/auth/apple`; the API verifies the signature, audience and issuer.

- [x] Google Cloud project `bukkapay` with the OAuth consent screen (External) (done 2026-11-19)
- [ ] OAuth clients: Web (origins `https://app.bukkapay.com`, `http://localhost:8081`), Android (`com.bukkapay.app` + signing SHA-1 from `eas credentials`), iOS (`com.bukkapay.app`)
- [ ] Railway `GOOGLE_CLIENT_IDS` = the three client IDs, comma-separated
- [ ] EAS / Vercel env: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- [ ] Consent screen: add the logo, privacy policy and terms URLs, then **Publish app** (until then only listed test users can sign in)
- [ ] Apple Developer: enable "Sign in with Apple" on App ID `com.bukkapay.app`; for web, create a Services ID with domain `app.bukkapay.com` and return URL `https://app.bukkapay.com`
- [ ] Railway `APPLE_CLIENT_IDS` = `com.bukkapay.app,<services id>`; EAS/Vercel `EXPO_PUBLIC_APPLE_SERVICES_ID`
- [ ] New iOS build (Apple sign-in needs the entitlement; Expo Go can't do it)

## 3. Database security (RLS)

Migration `0022_rls` enables row-level security on every public table with
no policies, so Supabase's `anon` and `authenticated` roles (whose key ships in
apps) can read and write nothing. The API connects as the table owner and
bypasses RLS. An event trigger applies it to tables created later.

- [ ] After deploy, in the Supabase SQL editor, this returns no rows:
  `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;`
- [ ] Supabase **Advisors → Security**: no "RLS disabled" findings
- [ ] The API's `DATABASE_URL` user owns the tables (`select tableowner from pg_tables where schemaname='public' group by 1;` returns one role, the one in `DATABASE_URL`). If not, the API would be locked out: stop and fix ownership before deploying 0022.

## 4. Secrets and configuration (Railway API + worker)

- [ ] `ENV=production`, `ADMIN_API_KEY` (32+ random bytes), `CARD_DATA_KEY` (Fernet), `SANDBOX_WEBHOOK_SECRET` changed from the default
- [ ] `ALLOWED_ORIGINS` = the exact app, merchant, admin and website origins
- [ ] `ADMIN_ALLOWED_ORIGINS=https://admin.bukkapay.com` (exact match now; preview URLs must be listed explicitly)
- [ ] `CARD_ISSUER=none` until a BIN sponsor is contracted (`sandbox` is refused in production)
- [ ] Stitch live credentials and webhook secret; `BUKKAPAY_*` settlement account
- [ ] Railway plan has credit (a trial running out took every backend down on 2026-11-16)

## 5. Data and money safety

- [ ] Rehearse migrations 0019–0022 on a copy of the production database (see `deployment.md`), then reconcile: Admin → Reconciliation → run ledger integrity, zero breaks
- [ ] Backups: Supabase daily backups on (Pro plan) or a nightly `pg_dump` to storage; **restore drill**: restore into a scratch project, run the reconciliation, record the time taken
- [ ] Decide on refunding fees charged for the old locally generated "cards" (see `pan-african-plan.md`)

## 6. Access and roles

- [ ] Exactly one `super_admin`; every other staff member on the least-privilege role they need (`ceo`, `finance_admin`, `compliance_officer`, `operations_admin`, `customer_support`, `merchant_support`, `technical_admin`, `auditor`)
- [ ] MFA enrolled for every admin (enforced in production)
- [ ] Remove the legacy `admin` role from anyone who has it

## 7. Load and resilience

- [ ] Load test the API at 5× expected pilot peak (login, balance, send, QR pay) and watch DB connections against the Supabase pool limit (Nano: 60)
- [ ] Worker running (`railway.worker.json`): outbox, settlement, card holds, reconciliation crons
- [ ] Uptime check on `https://api.bukkapay.com/health`, alerts to the on-call phone

## 8. Before opening the doors

- [ ] External security review / penetration test of the API and admin
- [ ] Legal: terms, privacy policy and fee schedule published on the website and linked from the app
- [ ] Support: WhatsApp-style support chat staffed; escalation path for frozen accounts and failed payouts
