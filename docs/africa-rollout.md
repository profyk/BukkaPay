# Africa rollout: countries, providers, money controls

## Countries

Every African Union member state is in the database: the 54 UN members plus
Western Sahara (SADR). Each country has ISO-2/ISO-3/numeric codes, capital,
dial code, mobile number lengths, currency (and currency peg), other
currencies in use, official languages, regional blocs (SADC, SACU, CMA,
ECOWAS, AES, WAEMU, CEMAC, ECCAS, EAC, COMESA, IGAD, AMU) and the main
mobile-money operators. Source: `backend/app/reference/africa.py`, loaded by
migration `0037_africa_rollout`.

### Locked until ready

A country is **locked** (`planned`) until an admin unlocks it. Locked means
the backend refuses sign-up **and** sign-in for customers and businesses
there; the apps only list open countries at sign-up.

| Status | Sign-up | Sign-in | Money |
|---|---|---|---|
| planned | refused | refused | refused |
| pilot / live | yes | yes | yes |
| suspended | refused | yes (to reach their money and support) | refused |

Unlocking (Admin → Countries → open checklist → *Request unlock*) is a
maker-checker request that a second admin approves, and it is refused unless
every required check passes:

| Check | How it's met |
|---|---|
| Compliance sign-off | Compliance officer records the regulator and licence model |
| Safeguarding custodian | An active primary custodian for the country's currency (Custodians, approval) |
| Wallets enabled | The country's currency is enabled for wallets (Currencies, approval) |
| Live collection rail | A provider's coverage in the country is **live**, and the provider is active in production |
| Live payout rail | Same, with a payout capability |
| Live KYC | Same, with the `kyc` capability |
| Transaction limits | At least one active limit rule for the country |

Recommended (not blocking): card issuing, country fee rules, corridors, cash agents.

## Recommended provider stack (cheapest, widest first)

Seeded inactive, with coverage `planned` (vendor-published footprints, late
2026). Mark coverage **live** only against a signed contract and a tested
production integration.

| Role | Provider | Why |
|---|---|---|
| Primary rail (mobile money + bank, collections + payouts, card programmes) | **Onafriq** | ~43 African markets, ~1bn wallets, ~500m bank accounts, 2,000+ corridors, card issuing with BIN sponsorship. One contract covers most launch markets. Adapter exists. |
| Cheapest mobile money / failover | **pawaPay** | ~50 operators in ~20 markets, direct operator connections, low fees. |
| Intra-African cross-border settlement | **PAPSS** | Local-currency central-bank settlement, 28 countries (all CEMAC since July 2026, WAEMU piloting). Via a participant bank. |
| SADC cross-border | **TCIB** | Instant, cheap SADC rail via participating banks. |
| KYC | **Smile ID** | Document checks in all 54 countries, 3+ ID types in most. |
| Card processing | **Paymentology** | Already integrated; BIN sponsor via Onafriq programmes or the custodian bank. |
| Safeguarding / custodian | **Ecobank** | One group in ~33 African countries; segregated accounts + PAPSS access. Standard Bank / Stanbic where Ecobank is absent (ZA, BW, NA, LS, SZ, MZ, AO). |

Suggested order: SADC first (ZA live; BW, NA, LS, SZ, ZW, ZM, MW, MZ via
Onafriq + Stanbic/Ecobank + TCIB), then East Africa (KE, UG, TZ, RW via
Onafriq/pawaPay + Ecobank), then ECOWAS/WAEMU (GH, NG, CI, SN via Onafriq/
pawaPay + Ecobank + PAPSS).

## Codes: email, not SMS

Security confirmations stay on **email codes + transaction PIN** (+ passkeys
where available). SMS one-time codes are deliberately not used to approve
money or account changes: SIM-swap fraud is common across African markets
and an SMS code is only as safe as the mobile network's SIM-replacement
process. SMS is fine for phone-number ownership checks and for alerts, and
can be added with BulkSMS for that purpose only.

## Admin money controls (insider abuse)

Nobody can add money to a wallet except through a `ledger.adjustment`
maker-checker request, and:

1. **Wallet ID only.** The customer is identified by their wallet ID number
   and currency, never by name, email, phone or internal id. The requester
   looks it up, sees the holder's name, and types the wallet ID twice. At
   execution the wallet must still be the same one.
2. **Named source of funds, always balanced.** `bank_deposit` (from
   safeguarded cash, with the bank statement reference, usable once),
   `goodwill` (company expense), `reversal` (exact mirror of an earlier entry
   that touched this customer, once only), `recovery` (take a goodwill credit
   back, never below zero). There is no "free" adjustment account.
3. **Conflict of interest.** An admin can't request or approve an adjustment
   to a wallet that looks like their own (same name or email name); the
   owner's own wallet can't be adjusted at all.
4. **Owner sign-off** (owner = super admin as requester or approver) when an
   adjustment is above USD 250, costs the company more than USD 50, takes the
   requester's company-paid credits over USD 200 in 24h, or the customer's over
   USD 100 in 30 days, or can't be measured in USD. Only the owner can change
   these limits (Admin → Money controls); changes are audited.
5. **Visible.** The customer is notified of every adjustment; Admin → Money
   controls lists every adjustment with requester, approver and company cost,
   and flags repeat requester/approver pairs and repeatedly adjusted wallets.

## Weekly cross-border settlement

Every Monday 06:00 UTC (or Admin → Cross-border settlement → *Run settlement
now*) the book-transfer pools are netted into as few bank transfers as
possible (largest surplus funds largest need, in USD terms). Download the
bank instructions, make the transfers (SADC-RTGS / TCIB / PAPSS / FX
partner), then *Record transfer* with the bank reference and the amounts
actually sent and received. That files a `treasury.rebalance` approval; when
a second admin approves it, the move is booked (balanced in both
currencies) and the line is settled. A run is locked while it has transfers
in progress. Needs that no pool surplus covers are listed as unfunded.

## Currency swaps: always a margin, never a loss

- **Live rates:** every 30 seconds the worker re-prices each swap pair from the
  market mid (`FX_FEED_URL`, default open.er-api.com; replace with the partner
  bank's or Onafriq's feed when contracted) minus a buffer (default 0.30%) that
  covers market movement between refreshes. The spread (minimum 0.5%) is
  charged on top and booked to FX revenue.
- **Circuit breaker:** a pair that would jump more than 3% in one refresh is
  held for treasury (Admin → FX desk) instead of being applied.
- **Fail safe:** if the feed stops, swaps pause after 10 minutes rather than
  trade on old prices.
- **No farming:** a round trip at current prices always loses (checked at swap
  time and refused at the FX desk); converting back within 24 hours is capped
  at the rate the customer paid; at most 10 swaps per customer per day.
- All limits: Admin → Revenue & Pricing → FX. Set `FX_FEED_ENABLED=false` on
  the worker to run on hand-set rates.
