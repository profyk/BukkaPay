# pay.bukkapay.com

The public side of BukkaPay, deployed on its own (Vercel project `bukkapay-pay`), apart from the signed-in apps.

| Path | What it is |
|---|---|
| `/{linkId}` | Pay a payment link: by bank (Stitch instant EFT, ZAR), or hand over to the BukkaPay app to pay from a wallet |
| `/claim/{id}` | Claim money someone sent you (PIN): to a bank account or as a cash pickup code, or into a BukkaPay wallet in the app |
| `/t/{reference}` | View an AfCFTA trade invoice; pay it (instant or escrow) in the BukkaPay app |

## Why a separate app

A payment link is opened by strangers, on any device, often from chat apps. Keeping it apart from `app.bukkapay.com` means:

- **No session on this origin.** Nothing here signs in or stores a token. A bug or injected script on a public page can't reach anyone's account. Wallet payments and wallet claims hand over to `app.bukkapay.com`, where the person is already signed in and confirms with their PIN.
- **A strict CSP with a fresh nonce per request** (`middleware.ts`): only our own scripts run. `connect-src` is limited to the BukkaPay API. No frames (`frame-ancestors 'none'`), no plugins, no `<base>` hijack, forms post only to us.
- **Private by default:**
  - `Referrer-Policy: no-referrer`, because link IDs live in the URL.
  - `X-Robots-Tag: noindex`.
  - `Cache-Control: no-store`.
  - HSTS preload.
  - COOP/CORP same-origin.
  - All API calls go out with `credentials: "omit"`.
- **Redirects are allow-listed:** the browser is only ever sent to `*.stitch.money` or `*.bukkapay.com`.
- **The API serves strangers only what they need:**
  - a public link view has no payer list, no payout bank details, no billed-customer email or phone, and no owner ID;
  - the invoice PDF follows the same rule;
  - a claim's cash pickup code is only ever returned after the PIN;
  - public endpoints are rate-limited, and claim PINs lock after repeated wrong tries.

## Run

```bash
npm ci
npm run dev        # http://localhost:3003
npm run typecheck && npm run build
```

Environment (optional; defaults are production):

- `NEXT_PUBLIC_API_URL` = `https://api.bukkapay.com`
- `NEXT_PUBLIC_APP_URL` = `https://app.bukkapay.com`

The API must list `https://pay.bukkapay.com` in `ALLOWED_ORIGINS`, and `PAY_WEB_URL` (default `https://pay.bukkapay.com`) decides the links the API generates. Old `app.bukkapay.com/pay/{id}` links redirect here permanently (see `apps/customer/vercel.json`).
