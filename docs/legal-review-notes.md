# Legal documents — notes for counsel

The BukkaPay legal documents were drafted as **templates** on 2026-11-19 and
have **not been reviewed by a lawyer**. The website shows each one with a
"draft — awaiting legal review" notice until it is published from the admin
panel with review status *Approved by counsel*.

## How the pipeline works

1. **Admin panel → Legal Documents** lists every document. Edit the text
   (Markdown: `##` headings, `-` lists, `**bold**`, `[link](/legal/terms)`)
   with a live preview, then **Save draft**. Drafts are never public.
2. **Publish…** creates a numbered, permanent version with an effective date,
   a review status (Not reviewed / In legal review / Approved by counsel), the
   reviewer's name and a change note. The website updates within seconds and
   lists earlier versions under "Version history".
3. **Company details** (tab on the same page) fills the `{{placeholders}}` in
   every document — legal name, registration number, address, Information
   Officer, emails, governing law, partner institutions, card issuer. Blank
   fields show on the website as `[Company legal name]` etc.

Permissions: `legal.manage` (draft; compliance officer, operations admin) and
`legal.publish` (publish; super admin and compliance officer). Every change
is in the audit log; published versions cannot be edited or deleted, even
directly in the database.

Source templates: `backend/app/legal/templates/*.md`. Once a document is
saved in the admin panel, the database copy is the source of truth.

## Please confirm or complete

**All documents**
- Legal entity name, registration number, registered address, governing law
  and which entity contracts with customers in each country.
- Names of the licensed Partner Institutions holding customer funds and the
  card issuer, and whether their terms must be incorporated or linked.
- Consumer protection requirements per country (South Africa CPA / ECTA,
  Nigeria FCCPA, Kenya CPA) and any required plain-language wording.

**Terms and Conditions** — notice periods for changes (30 days used), the
liability cap, the unauthorised-payment refund timing, inactivity/dormancy
rules, and whether a cooling-off right applies.

**Privacy Policy** — lawful bases, retention periods (5 years used for KYC
and transaction records; check FICA and local equivalents), the list of
processors (Supabase, Railway, Vercel, Resend, verification/screening
providers), cross-border transfer safeguards, and regulator registration
(e.g. Information Officer registration with the South African Information
Regulator).

**Data Breach Policy** — notification deadlines per country (POPIA s22,
Nigeria NDPA 72h, Kenya DPA 72h, GDPR 72h), card-scheme/PCI notification
duties via the issuer-processor, and the internal 1-hour / 24-hour targets.

**AML/CFT Policy** — accountable-institution status under FICA (or the
partner's), reporting obligations, and record-keeping periods.

**Merchant Terms** — reserves, set-off, chargeback liability, surcharging
rules, and informal-seller limits.

**Virtual Visa Card Terms** — issuer name, BIN sponsor arrangement, dispute
timelines (120 days used), fees, and the issuer's own cardholder agreement.

**Complaints Policy** — acknowledgement / resolution times (2 / 15 business
days used) and the correct ombud per country (NFO South Africa listed).

**Refunds Policy** — unauthorised-payment refund window (13 months used) and
"next business day" refund timing, against local payment regulation.

**PAIA & POPIA Manual** — Information Regulator contact details, prescribed
forms and fees, and the categories of records.

**Missing documents to consider:** fee schedule, rewards/promotion terms,
contributions (stokvel) terms, staff/API developer terms, country-specific
addenda.
