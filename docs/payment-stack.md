# BukkaPay payment stack: decision record (2026-11-24)

**Goal:** the cheapest reliable way to move money across Africa (ZAR, BWP, USD first), issue virtual and physical cards, take money in and pay money out, safeguard customer funds, run the ledger, and monitor AML/KYC/KYB.

**Method:** desk research (sources at the end). Almost every provider prices per contract, so the numbers to compare are quotes we must request, not public price lists. The architecture below is built so any provider can be swapped without touching the ledger.

---

## 1. The biggest saving is architectural: don't pay a rail per transfer

Most of BukkaPay's cross-border volume is **BukkaPay wallet → BukkaPay wallet** (ZA → BW, BW → ZA). For those, no money needs to cross a border at the moment of payment:

1. The sender's ZAR wallet is debited in South Africa.
2. The recipient's BWP wallet is credited **instantly** from BWP that BukkaPay already holds in Botswana (a *prefunded pool* at the Botswana custodian bank).
3. Treasury squares the pools up **in bulk**, daily or weekly. That means one SADC-RTGS / bank FX transfer between our own custodian accounts, or a stablecoin hop via the treasury partner for non-SADC currencies.

The result is one wholesale FX trade a day instead of thousands of retail cross-border payments. Settlement is instant for the customer and costs basis points instead of percent.

**Built (this change):** the `book` rail (`app.network.rails.BookRail`) settles `internal_book` corridors on the next worker tick (~10 s). `clearing:book:<CCY>` shows what each pool has fronted. The `internal_book` liquidity limit caps exposure per corridor. Admin → Network has `/network/treasury/book-positions`. A maker-checker `treasury.rebalance` approval books each real bulk move against `SYS_SAFEGUARD`, and the daily bank statement reconciliation then confirms it.

**Reliability:** every corridor can now name **backup rails** (`fallback_provider_ids`). A rail that is down or refuses (it sent nothing) is skipped and the next one takes the transfer. Degraded rails are tried last. Suspended or inactive rails are never used.

## 2. Recommended providers

| Need | Primary (recommended) | Backup / later | Why |
|---|---|---|---|
| **ZA money in** (top-up) | **Stitch**: PayShap + instant EFT pay-ins (already integrated) | Ozow / Peach Payments | Pay-by-bank costs far less than card acquiring. PayShap is real-time, and bank fees are falling (2026). |
| **ZA money out** (withdraw) | **Stitch** payouts (integrated; **switched off in production until credentials are set**) | Peach Payments payouts | Same contract as pay-ins, one reconciliation. |
| **BW money in/out** | **Orange Money Botswana** (≈75% of mobile money) + **FNB Botswana / Absa** EFT | Mascom MyZaka, BTC Smega. An aggregator (Cellulant) if direct terms are slow. | Go direct to the dominant wallet. Botswana's interoperability work (eWallet → Orange Money / MyZaka / Smega) lowers the cost of covering the rest later. |
| **Cross-border to non-BukkaPay recipients** (bank or mobile money elsewhere) | **Onafriq** (Africa-first, 40+ markets, PAPSS partner, USDC settlement option) | **Thunes** (140+ countries, wallet payouts) | Negotiate corridor pricing with both and route per corridor on price and success rate (failover is built). |
| **Pan-African settlement (long term)** | **PAPSS**, via a sponsoring participant bank | n/a | South Africa is only on the inbound "extended network" today. Revisit once SARB/PAPSS direct participation opens. The adapter exists and refuses until connected. |
| **Treasury / FX rebalancing** | Custodian bank FX + SADC-RTGS (ZAR↔BWP) | **Yellow Card** (stablecoin, already an adapter) for non-SADC | Bulk FX at wholesale rates. Stablecoin only where bank FX is slow or expensive. |
| **Cards: virtual + physical Visa** | **Paymentology** as issuer-processor, with a **South African sponsor bank** (Bank Zero, the Mukuru model, or Standard Bank / Tyme, both existing Paymentology clients) | Sudo Africa (if we expand to Nigeria first) | Paymentology has a Sandton HQ and its PayoCard platform for SA fintechs. Mukuru launched account + card on Paymentology with Bank Zero sponsoring in Oct 2026, the same model we need. Direct BIN membership takes 12–24 months, so a sponsor gets us live fastest. |
| **Funds custody (safeguarding)** | **Ring-fenced trust accounts** at a tier-1 bank per country: SA (Standard Bank or Absa), BW (FNB Botswana or Absa Botswana) | A second bank per country once volume grows (concentration risk) | The SARB draft Authorisation Framework requires e-money client funds in **segregated trust accounts at regulated banks**. Our proof-of-reserve already compares custodian balances with customer liabilities daily. |
| **Ledger** | **Keep the in-house double-entry ledger** (immutable journal, per-currency SYS_* chart, daily integrity + reconciliation) | n/a | Already built and tested. A third-party ledger would add cost and a dependency without adding safety. |
| **KYC** | **Smile ID** (already integrated; SA ID, Omang, passports, liveness) | Sumsub | Best coverage of African ID documents. |
| **KYB** | **Smile ID KYB** (CIPC SA; Botswana registry checks) + director screening | Sumsub KYB | One vendor for people and businesses. |
| **Sanctions / PEP screening** | **OpenSanctions**: hosted API now, then self-hosted **yente** with a data licence at volume | ComplyAdvantage (Starter ≈ $99.99 / 1,000 monitored entities) | Same `/match` API hosted or self-hosted, so the cheapest at scale, and the data is regulator-recognised. **Built (this change).** |
| **Transaction monitoring** | **In-house rules engine** (built, see §3) + compliance case queue | Add a vendor (Sumsub / ComplyAdvantage) only if a regulator or bank partner requires one | Per-transaction vendor fees would be our largest compliance cost. |

## 3. AML / KYC / KYB monitoring now in the product

- **Screening:** customers at KYC approval and businesses plus their directors at KYB approval are screened **before** approval. A confident sanctions hit (score ≥ 0.95) **freezes the account** (or deactivates the business), keeps KYC/KYB pending and opens a high-priority case. Possible hits and PEPs open a case for review / enhanced due diligence. Every verified customer is **rescreened monthly** (daily job, 03:15). With no provider connected, results say `not_screened`, never "clear".
- **Rules** (each fires at most once per person per day, so reviewers aren't flooded):
  - large transaction
  - new account moving large value
  - velocity (more than 10 outgoing payments in an hour)
  - **structuring** (3+ payments just under the large-transaction line in 24 h)
  - **rapid pass-through** (≥ 90% of a day's incoming money leaves the same day)
  - **many incoming payments** (mule pattern)
  - **high-risk jurisdiction** (FATF call-for-action list, `HIGH_RISK_COUNTRIES`)
- High-severity events open compliance cases. Nothing auto-closes.

## 4. Never charge or attempt a payment that can't succeed

- **One funds gate** (`app.ledger.funds.require`) runs before every payment: send, withdraw, payment link, flights, trips, trade invoices and claims. It locks the wallet's ledger row so no other payment can race it, then refuses an empty or short wallet with a clear "Top up" error (HTTP 402, `code: no_funds | insufficient_funds`). This happens **before** any fee is worked out and **before any bank, airline, issuer or partner is called**.
- **Payment link → bank** now books the payer's money first and only then asks the bank to pay out. Before, a payment racing another spend could send a real payout that was never debited.
- **Cards:** when a wallet runs dry, its Visa card is **paused at the issuer** (`frozen_reason = no_funds`), so terminals are declined at the network and never reach us as a declined (billable) authorisation. It **switches back on by itself** on top-up. Customer and admin freezes are never touched.
- **Card fee:** an empty wallet is never charged. The fee is taken after the next top-up, and the person is told once a month, not every day.

## 5. What the owner needs to do (in order)

1. **Stitch production credentials** (`STITCH_CLIENT_ID`, `STITCH_CLIENT_SECRET`, webhook secret) on Railway. Top-ups and withdrawals switch on immediately; today the API reports `configured: false`.
2. **Custodian trust accounts:** SA (Standard Bank / Absa) and BW (FNB Botswana / Absa Botswana). Enter them in Admin → Network → Custodians.
3. **Paymentology + sponsor bank** term sheet for the Visa programme (virtual first, physical next).
4. **Orange Money Botswana** merchant/API agreement; FNB Botswana EFT.
5. **Onafriq and Thunes**: request corridor quotes for ZA/BW → ZW, ZM, NA, MZ, KE, NG; sign the cheaper one as primary and the other as backup.
6. **OpenSanctions** API key: set `SCREENING_API_URL=https://api.opensanctions.org` and `SCREENING_API_KEY`. Move to self-hosted yente at volume.
7. **Smile ID KYB** activation on the existing Smile ID account.

## Sources

- Cross-border payouts: [BlindPay 2026](https://blindpay.com/resources/more/best-real-time-cross-border-settlement-providers-2026), [WeeTracker 2026](https://weetracker.com/2026/06/01/africa-cross-border-payments-boom/), [Lorum](https://www.lorum.com/article/best-cross-border-payout-providers), [FintechSpecs](https://fintechspecs.com/blog/best-cross-border-payout-apis-us-platforms/)
- PAPSS: [PAPSS participants](https://papss.com/get-connected/), [PAPSS coverage June 2026](https://papss.com/wp-content/uploads/2026/06/PAPSS-PAYMENTS-NETWORK-COVERAGE_JUNE2026-5.pdf), [Moonstone: SA and PAPSS](https://www.moonstone.co.za/after-fatf-delisting-can-south-africa-catch-the-papss-wave-or-miss-it/), [TechCabal: PAPSS four years on](https://techcabal.com/2026/03/31/how-papss-is-meeting-cross-border-promise-four-years-on/)
- PayShap / SA pay-ins: [Stitch: state of PayShap 2026](https://stitch.money/blog/real-time-payments-in-south-africa-the-state-of-payshap-in-2026), [TechCentral: Standard Bank PayShap fees](https://techcentral.co.za/standard-bank-slashes-payshap-fees/275120/), [BusinessTech: PayShap fees by bank](https://businesstech.co.za/news/banking/775230/payshap-fees-in-south-africa-absa-vs-nedbank-vs-standard-bank-vs-fnb-vs-tymebank-and-more/)
- Cards: [Paymentology PayoCard](https://www.paymentology.com/newsroom/paymentology-launches-payocard-to-expand-mobile-first-access-to-card-services-across-south-africa?hsLang=en), [Paymentology powers Mukuru (Bank Zero sponsor)](https://thepaypers.com/payments/news/paymentology-powers-mukurus-account-and-card-in-south-africa), [Mastercard × Paymentology SA](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2025-1/march/mastercard-strengthens-collaboration-with-paymentology-to-drive-financial-inclusion-in-south-africa), [Phaze: issuing APIs 2026](https://www.phaze.io/resources/virtual-card-issuing-apis/)
- Botswana: [Mmegi: wallet interoperability and market share](https://www.mmegi.bw/ampArticle/188909), [Mascom MyZaka](https://mascom.bw/about-mascom-myzaka/), [Fintech Times: Botswana 2026](https://thefintechtimes.com/steady-foundations-for-botswanas-fintech-ecosystem-in-2026/)
- Safeguarding: [ENS: SARB draft Authorisation Framework](https://www.ensafrica.com/news/detail/11080/sarbs-november-draft-authorisation-framework-), [SARB Authorisation Framework (Nov 2025)](https://www.resbank.co.za/content/dam/sarb/what-we-do/payments-and-settlements/pem/dialogues/2025/Authorisation%20Framework%20-%20%20for%20publication%20-%2014%20November%202025.pdf)
- AML/KYC: [Sumsub: AML for African fintechs](https://sumsub.com/blog/aml-compliance-fintechs-africa/), [G2: ComplyAdvantage vs Sumsub](https://www.g2.com/compare/complyadvantage-vs-sumsub), [Didit: AML software 2026](https://didit.me/sw/blog/best-aml-software/)
