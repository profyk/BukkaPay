# BukkaPay Owner's Manual

This is the owner's guide to running BukkaPay: what each part does, what to check and when, and what to do when something breaks. It is written for you, the owner, and for anyone you trust to run the company with you. Everything here describes the system as it is built; the server enforces the rules described, not only the screens.

## 1. The pieces

- **Customer app** (app.bukkapay.com and the mobile app): wallets, send and receive, pay merchants, cards, cross-border transfers, currency swaps, help centre.
- **Merchant portal** (merchant.bukkapay.com): businesses take payments with QR codes, checkout links and API keys, see sales and payouts, and talk to support.
- **Pay pages** (pay.bukkapay.com): the public checkout people see when they open a payment link.
- **Website** (bukkapay.com): marketing pages and the legal documents (terms, privacy policy) that you publish from the admin panel.
- **Admin panel** (admin.bukkapay.com): this panel. Everything the company does is done here.
- **API and worker** (Railway): the API answers every app; the worker runs scheduled jobs (section 9).
- **Database** (Supabase Postgres): all data, including the double-entry ledger. Email codes are sent with Supabase Auth and Resend.

## 2. Your position as owner

- You are the **only Super Admin**. The database refuses a second one. Nobody can remove you or change your role.
- The **CEO** sees everything and approves maker-checker requests, but can't create admins or change roles.
- Destructive actions (deleting admins, hard deletes, some money actions) ask for your **PIN** on the server, not only in the browser.
- Turn on **MFA** for your own account and require it of everyone. The People tab in Organisation shows "MFA off" next to anyone without it.

## 3. The company: Organisation

Open **Company → Organisation**.

- **Departments**: ten are created for you: Executive, Finance & Treasury, Compliance & Risk, Customer Support, Merchant & Agent Operations, Country Operations, Technology, Marketing & Growth, Legal, People & Admin. Give each a head and a shared mailbox. A department with people in it can't be deleted; move them first.
- **People**: every staff member's department, job title, manager, phone, start date and the countries they cover. The reporting line can't loop.
- **Org chart**: built from "Reports to".
- **Country coverage**: which staff cover each country. Open countries that only central teams cover are shown in amber.

### Country scope (important)

Each person can be limited to some countries (ISO codes such as KE, UG, TZ). They then see and act on **only** those countries' customers, KYC submissions, merchants, cash agents and help-desk tickets. Opening a record outside their countries returns "This is outside the countries you cover". Leave the field empty for "all countries" (executives, central finance, compliance and technology). You always cover every country. People can't change their own coverage.

### Roles: who can do what

| Role | Use it for | Can't |
|---|---|---|
| CEO | Running the business, approving requests | Create admins or change roles |
| Finance Admin | Fees, FX, reconciliation, adjustment requests | Approve their own requests |
| Treasury Manager | FX, reconciliation, settlement, adjustment requests | Approve their own requests |
| Compliance Officer | KYC/KYB, freezes, sanctions, legal publishing | Move money |
| Risk Analyst | Fraud cases, freezes, wallet restrictions | Move money |
| KYC Analyst | Identity and business verification | Move money |
| Operations Admin | Network setup, users, merchants, website, broadcasts | Approve money |
| Country Manager | Everything operational in their countries | Move money or approve |
| Customer Support | Users, wallets (view), help desk | Change money |
| Merchant Support | Merchants and their tickets | Change money |
| Technical Admin | Network status, webhooks, audit log | Customer data changes |
| People Manager | Departments, staff profiles, coverage | Roles or money |
| Legal Counsel | Legal documents, compliance (read) | Money |
| Data Analyst | Read-only numbers | Change anything |
| Marketing Manager | Website and broadcasts | Customers or money |
| Travel Manager | Travel products and their support | Money |
| Auditor | Read everything | Change anything |

### Hiring someone

1. **Risk & Governance → Admins & Roles → Invite**. Choose the narrowest role that lets them do the job. The invite link is shown on screen and emailed.
2. When they've accepted, go to **Organisation → People → Edit**. Set the department, title, manager and countries.
3. Ask them to turn on MFA on their first day.

### When someone leaves

1. **Admins & Roles**: deactivate them the same day. Their sessions stop working.
2. **Organisation**: if they headed a department, pick a new head.
3. Review their last weeks in the **Audit Log** (filter by their name).

## 4. Money rules nobody can break

- **The ledger is double-entry.** Every movement is a balanced journal entry. Balances are calculated from the ledger, not typed in.
- **No admin can add money to a wallet directly.** Corrections are *adjustment requests* against a **wallet ID**, approved by a *different* admin (maker-checker). Nobody can approve their own request. Each adjustment is booked against a company account, so the books still balance, and it appears in Money Controls and the Audit Log.
- **Money Controls** shows every adjustment, who asked for it, who approved it and the running totals per admin. Look here weekly for anyone whose adjustments are rising.
- **Approvals** holds everything waiting for a second admin.

## 5. Routines

### Every day (about 15 minutes)
- **Dashboard**: anything red or amber.
- **Approvals**: clear the queue. Read the reason on each request; reject anything vague.
- **Reconciliation**: last night's run (02:30 UTC) should be clean. Investigate every mismatch the same day.
- **Help Desk**: no urgent tickets older than a day.
- **KYC Review / Business Verification**: queues moving.

### Every week
- **Monday 06:00 UTC**: the cross-border settlement runs by itself. Check **Cross-Border Settlement** that every corridor settled, and use **Run settlement now** if one was missed.
- **Money Controls**: adjustments by admin, unusual patterns.
- **FX Desk**: swap volume, fee income, and any customers blocked by the anti-arbitrage guard.
- **Audit Log**: skim role changes, freezes and deletions.

### Every month
- **Revenue & Pricing**: income by product, agent commissions. Change fees here (changes go through approval).
- **Safeguarding**: customer money held at custodians equals customer balances in the ledger.
- **Access review**: Organisation → People. Remove access nobody needs; check MFA.
- **Legal**: anything your lawyer has changed, published.

## 6. Countries

Every African country is in **Network → Countries**, closed by default. A country opens for sign-up only when every requirement is met, and the system checks this:

1. Compliance basis recorded (licence or partner licence).
2. A **custodian** holding customer funds (Network → Custodians).
3. Payment **rails / providers** connected (Network → Providers).
4. KYC rules and **limits** set (Fees & Limits).
5. Currency enabled (Network → Currencies).

Then move it to **pilot** (small group), and later **live**. Add a Country Manager and give them that country in Organisation. Cross-border corridors (**Corridors & FX**) need a fresh rate and an approval before they open.

## 7. Customers

- **KYC levels** decide what a customer can do. Cross-border payments need full KYC; withdrawals need at least level 1.
- **Spending limits**: customers set their own per-payment and daily limits per currency in the app (Security settings). Lowering takes effect at once; raising waits 24 hours so a thief with their phone can't lift it. The server enforces these on every payment.
- **Account deletion**: customers close their account in the app. A balance must be withdrawn first. Personal data is removed after the legal retention period (the purge runs nightly at 02:45 UTC). Money records are kept, because the law requires it.
- **Help desk**: customers chat in the app or email support. Tickets go open → in progress → resolved → closed. Reply from the Help Desk page.
- **Freezing**: Users → the customer → Freeze. Use this for suspected fraud and write why.

## 8. Merchants and agents

- Merchants sign up at merchant.bukkapay.com and can't take payments until **Business Verification** approves them.
- Business names and payment links that pretend to be a bank, mobile money operator, tax authority, big tech company or BukkaPay itself, or use phishing wording, are **refused automatically**. This protects customers and stops Google flagging the site as unsafe.
- **Cash agents** let people put cash into and take cash out of wallets. Commissions are in Revenue & Pricing.

## 9. Scheduled jobs (worker)

| When (UTC) | Job |
|---|---|
| Every 30 seconds | Live FX rates refresh |
| Every 10 seconds | Outbox: emails, notifications and webhooks get sent |
| Every few minutes | Expire quotes, claim links, payment requests and cash-out codes; issue cards; release due escrows |
| Hourly | Card maintenance and account fees |
| 02:30 daily | Ledger reconciliation |
| 02:45 daily | Purge closed accounts past retention |
| 03:15 daily | Sanctions re-screening of customers |
| 04:00 daily | Payout reconciliation |
| Monday 06:00 | Weekly cross-border settlement |

If emails stop or FX rates look stale, the **worker** is probably down (section 11).

## 10. Legal and privacy

- **Legal** in the admin panel holds the terms, privacy policy and other documents. Edit, then **Publish**; the website shows the published version.
- Until the company is registered, company details read truthfully as "in the process of registration". When you are registered, enter the legal name, registration number and address in the legal settings, and every document updates.
- Google's branding verification reads the published privacy policy at bukkapay.com/legal/privacy.

## 10a. The board portal (investors)

The board portal at board.bukkapay.com is a separate app for board members and investors. It shows company totals only: customers, active users, payment volume, revenue by month and by product, gross profit, profit and loss, cash, burn and runway, unit economics (take rate, revenue per user, average payment), customers by country, retention by signup month, and your investor updates. It never shows a customer, merchant or staff record.

- **Only you can invite.** Company → Board & Investors → Invite. They set a password from the email, and every sign-in also needs a 6-digit code sent to their email. Sessions end after 12 hours or when the browser closes.
- **Remove access** ends their session at once.
- **Management accounts**: the ledger knows revenue and direct costs, but not salaries, rent or cash in the bank. Each month, enter staff, technology, marketing, compliance and legal, office and other costs, other income, month-end cash, funding received and headcount. Use the same currency every month; the portal reports in it and converts the ledger's currencies at live mid-rates.
- **Investor updates**: write a monthly letter (highlights, lowlights, numbers, asks). Drafts stay hidden until you tick Publish.
- **Access log**: who signed in and what they opened or exported.
- Investors can download a CSV and print a **board pack** (every section on one printout).

**One-time setup (Vercel).** Create a new Vercel project from the same GitHub repository with Root Directory `apps/admin` and the environment variable `APP_TARGET=board`. Add the domain `board.bukkapay.com`. It builds the board portal instead of the admin panel and deploys from `main` like the others. If the API's invitation links should point somewhere else, set `BOARD_WEB_URL` on the Railway API service.

## 11. When something breaks

| What you see | Likely cause | What to do |
|---|---|---|
| Every app says it can't connect; the API returns 404 or "application not found" | Railway service stopped, or the Railway plan has run out of credit | Check the Railway project: plan, credits, service status. Redeploy the API from the backend folder with `railway up`. |
| Emails (codes, receipts) not arriving | Worker down, or the email provider rejected them | Check the worker in Railway. Then check Resend for bounces and the sending domain. |
| FX rates are stale and swaps are refused | Worker down or the rate feed is failing | Restart the worker. Swaps are refused on stale rates on purpose, so nobody trades on an old price. |
| Reconciliation shows mismatches | A provider statement differs from the ledger | Open the item. Never fix it by adjusting a wallet before you know why; ask the provider for the record. |
| A website or app deploy failed | Build error in a commit | GitHub → Actions shows the failing step. Vercel deploys production from `main` only. |
| A database change didn't apply | Migration failed in CI | Database migrations apply automatically from `main` through GitHub Actions. Check the "deploy-backend" run. |
| Google says the site is unsafe | A page (often a payment link someone made) looked like phishing | Google Search Console → Security issues shows the URLs. Disable the link or merchant in the admin panel, then click **Request review**. |
| A staff member can't see a customer | Their country coverage doesn't include that country | Organisation → People → Edit → Countries. |
| "Outside the countries you cover" | Same as above | Same as above. |
| A customer's payment is refused for a limit | Their own spending limit, or their KYC level | Ask them to check Security settings, or review their KYC. |
| A merchant is stuck at sign-up | Missing fields or an unconfirmed email | The form lists what's missing; the email code step can be skipped and confirmed later. |
| A board member can't sign in | Wrong password (locked for 15 minutes after 5 tries), a code older than 10 minutes, or access removed | Ask them to wait and try again, or Re-invite from Board & Investors. |
| The board portal shows no costs, profit or runway | Management accounts not entered for those months | Board & Investors → Management accounts → Enter a month. |

## 12. Emergencies

- **Suspected fraud on one account**: freeze the customer, restrict their wallet, open a compliance case.
- **A staff account is compromised**: deactivate it in Admins & Roles at once, then review the Audit Log for everything it did.
- **Something is moving money wrongly**: pause the affected corridor or provider in Network, so no new payments go through, and investigate with Finance before reopening.
- **Data breach**: contact your lawyer the same day. Most African data-protection laws require reporting to the regulator within a short deadline, often 72 hours.

## 13. Where things live

- Code: the BukkaPay GitHub repository. `backend/` is the API and worker, `apps/` holds the customer, merchant, admin, pay and website apps, and `docs/` holds architecture, ledger, rollout and launch notes.
- This manual: `apps/admin/artifacts/bukkapay-admin/src/content/owner-manual.md`. Update it whenever how you work changes.
