"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { API, APP, ApiError, api, isId, money, safeRedirect, type PaymentLink } from "@/lib/api";
import { Bank, Bolt, Check, Doc, Lock, Shield, Wallet } from "@/lib/icons";

type Load = { state: "loading" } | { state: "error"; message: string; gone?: boolean } | { state: "ready"; link: PaymentLink };
type Method = "wallet" | "bank";

const RETURN: Record<string, { cls: string; text: string }> = {
  pending: { cls: "warn", text: "Your bank is still confirming the payment. This page updates by itself." },
  review: { cls: "warn", text: "We received your payment and are confirming the amount." },
  failed: { cls: "bad", text: "The payment wasn't completed and no money was taken. You can try again." },
  cancelled: { cls: "bad", text: "You cancelled at your bank. No money was taken." },
  error: { cls: "bad", text: "Something went wrong at the bank. No money was taken. Please try again." },
};

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "B";
const cleanAmount = (t: string) => t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").replace(/^(\d*\.\d{0,2}).*$/, "$1");

export default function PayLink() {
  const { linkId } = useParams<{ linkId: string }>();
  const search = useSearchParams();
  if (!isId(String(linkId))) notFound();

  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [method, setMethod] = useState<Method>("wallet");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const returned = search.get("status");
  const returnRef = search.get("ref");

  const fetchLink = useCallback(async () => {
    try {
      setLoad({ state: "ready", link: await api<PaymentLink>("GET", `/api/payment-links/${linkId}`) });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setLoad({ state: "error", gone: status === 404, message: status === 404 ? "This payment link doesn't exist or was deleted." : (e as Error).message });
    }
  }, [linkId]);
  useEffect(() => { fetchLink(); }, [fetchLink]);
  useEffect(() => {
    if (returned !== "pending") return;
    const t = setInterval(fetchLink, 5000);
    return () => clearInterval(t);
  }, [returned, fetchLink]);

  const view = useMemo(() => {
    if (load.state !== "ready") return null;
    const l = load.link;
    const total = Number(l.amount);
    const paid = Number(l.amountPaid || 0);
    const remaining = Math.max(0, l.remainingBalance != null ? Number(l.remainingBalance) : total - paid);
    const expired = !!l.expiresAt && new Date(l.expiresAt).getTime() < Date.now();
    const closed = l.status === "paid" || l.status === "cancelled" || expired || remaining <= 0;
    const min = l.allowPartialPayment ? Math.min(remaining, Number(l.minimumPayment || 0) || 1) : remaining;
    return { l, total, paid, remaining, expired, closed, min, bankOk: l.currency === "ZAR" };
  }, [load]);

  useEffect(() => { if (view && !amount) setAmount(view.remaining.toFixed(2)); }, [view]);

  if (load.state === "loading") return <><div className="skeleton" aria-hidden="true" /><div className="spinner" role="status" aria-label="Loading" /></>;
  if (load.state === "error") {
    return (
      <div className="card hero">
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>{load.gone ? "Link not found" : "Couldn't load this payment"}</h1>
        <p className="muted">{load.message}</p>
        {!load.gone && <button className="btn primary" onClick={fetchLink}>Try again</button>}
      </div>
    );
  }
  const { l, total, paid, remaining, expired, closed, min, bankOk } = view!;
  const pay = Number(amount || 0);
  const amountOk = l.allowPartialPayment ? pay >= min - 0.001 && pay <= remaining + 0.001 : Math.abs(pay - remaining) < 0.005;
  const payee = l.businessName || l.senderName || "BukkaPay user";
  const logo = l.businessLogo && /^(https:\/\/|data:image\/(png|jpe?g|webp|gif);)/.test(l.businessLogo) ? l.businessLogo : null;
  const fullyPaid = l.status === "paid" || remaining <= 0;
  const justPaid = returned === "completed" || returned === "paid";

  const payByBank = async () => {
    setError("");
    if (name.trim().length < 2) { setError("Please enter your name as it appears on your bank account."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("That email address doesn't look right."); return; }
    if (!amountOk) { setError(l.allowPartialPayment ? `Enter between ${money(l.currency, min)} and ${money(l.currency, remaining)}.` : "Enter the full amount."); return; }
    setBusy(true);
    try {
      const r = await api<{ paymentUrl: string }>("POST", `/api/payment-links/${l.id}/pay-stitch`, {
        payerName: name.trim().slice(0, 120), payerEmail: email.trim() || undefined, amount: pay.toFixed(2),
      });
      safeRedirect(r.paymentUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  // ── Paid: a receipt, not a form ──────────────────────────
  if (justPaid || (fullyPaid && returned)) {
    return (
      <section className="card receipt" aria-live="polite">
        <div className="tick"><Check size={34} /></div>
        <h1 style={{ margin: "0 0 4px", fontSize: 24 }}>Payment sent</h1>
        <p className="muted" style={{ margin: 0 }}>to {payee}</p>
        <div style={{ textAlign: "left", marginTop: 18 }}>
          <div className="row total"><span className="k">Amount</span><span className="v">{money(l.currency, returned ? pay || paid : paid)}</span></div>
          {l.description && <div className="row"><span className="k">For</span><span className="v">{l.description}</span></div>}
          {returnRef && <div className="row"><span className="k">Reference</span><span className="v" style={{ fontFamily: "ui-monospace, monospace" }}>{returnRef}</span></div>}
          <div className="row"><span className="k">Date</span><span className="v">{new Date().toLocaleString()}</span></div>
        </div>
        <p className="hint">Keep this page or a screenshot as your proof of payment. {payee} has been notified.</p>
        <a className="btn ghost" href="https://bukkapay.com" rel="noopener">Get BukkaPay: send money free</a>
      </section>
    );
  }

  return (
    <>
      {returned && RETURN[returned] && <div className={`notice ${RETURN[returned].cls}`} role="status">{RETURN[returned].text}</div>}

      <section className="payhero" aria-label="Payment request">
        <div className="payee">
          <div className="avatar">{logo ? <img src={logo} alt="" /> : initials(payee)}</div>
          <div>
            <div className="payee-name">{payee}</div>
            <div className="payee-sub">{l.businessName ? "Business on BukkaPay" : "is requesting a payment"}</div>
          </div>
        </div>
        <p className="big">{money(l.currency, closed ? total : remaining)} <small>{l.currency}</small></p>
        {l.description && <p className="for">{l.description}</p>}
        <div className="chips">
          {fullyPaid ? <span className="chip"><Check size={12} /> Paid in full</span>
            : l.status === "cancelled" ? <span className="chip">Cancelled</span>
            : expired ? <span className="chip">Expired</span>
            : paid > 0 ? <span className="chip">{money(l.currency, paid)} of {money(l.currency, total)} paid</span>
            : <span className="chip"><Lock size={12} /> Secure request</span>}
          {l.expiresAt && !closed && <span className="chip">Due {new Date(l.expiresAt).toLocaleDateString()}</span>}
        </div>
        {paid > 0 && !fullyPaid && <div className="progress" aria-hidden="true"><span style={{ width: `${Math.min(100, (paid / total) * 100)}%` }} /></div>}
      </section>

      {!closed && (
        <div className="trust" aria-label="Security">
          <div><Shield size={18} />Licensed partners</div>
          <div><Lock size={18} />Encrypted end to end</div>
          <div><Bolt size={18} />Instant confirmation</div>
        </div>
      )}

      {l.invoice && (
        <section className="card" aria-label="Invoice">
          <h2>Invoice · {l.invoice.customerName}</h2>
          {(l.invoice.items || []).map((it, i) => (
            <div className="row" key={i}>
              <span className="k">{it.description || it.name || "Item"}{it.quantity && it.quantity > 1 ? ` × ${it.quantity}` : ""}</span>
              <span className="v">{money(l.currency, it.amount ?? (Number(it.unitPrice ?? it.price ?? 0) * (it.quantity || 1)))}</span>
            </div>
          ))}
          <div className="row total"><span className="k">Total</span><span className="v">{money(l.currency, l.invoice.totalAmount)}</span></div>
          {l.invoice.dueDate && <div className="row"><span className="k">Due</span><span className="v">{new Date(l.invoice.dueDate).toLocaleDateString()}</span></div>}
          {l.invoice.notes && <p className="hint">{l.invoice.notes}</p>}
          <a className="btn ghost" href={`${API}/api/payment-links/${l.id}/invoice/pdf`} rel="noopener noreferrer"><Doc size={18} /> Download invoice PDF</a>
        </section>
      )}

      {!closed && (
        <section className="card" aria-label="Pay">
          {l.allowPartialPayment && (
            <>
              <h2>How much are you paying?</h2>
              <div className="amountin">
                <span>{l.currency === "ZAR" ? "R" : l.currency}</span>
                <input id="amount" aria-label={`Amount in ${l.currency}`} inputMode="decimal" value={amount} autoComplete="off"
                  onChange={(e) => setAmount(cleanAmount(e.target.value))} />
              </div>
              <div className="quick">
                {[remaining, remaining / 2, min].filter((v, i, a) => v >= min && a.indexOf(v) === i).slice(0, 3).map((v) => (
                  <button key={v} type="button" onClick={() => setAmount(v.toFixed(2))}>
                    {v === remaining ? "Full amount" : money(l.currency, v)}
                  </button>
                ))}
              </div>
              <p className="hint">Minimum {money(l.currency, min)} · up to {money(l.currency, remaining)}</p>
            </>
          )}

          <h2 style={{ marginTop: l.allowPartialPayment ? 18 : 0 }}>Pay with</h2>
          <div className="methods" role="radiogroup" aria-label="Payment method">
            <button type="button" className="method" role="radio" aria-checked={method === "wallet"} onClick={() => setMethod("wallet")}>
              <span className="ic"><Wallet size={20} /></span>
              <span><b>BukkaPay wallet</b><span>Instant · confirm in the app with your PIN</span></span>
              <span className="tag">FREE</span>
            </button>
            {bankOk && (
              <button type="button" className="method" role="radio" aria-checked={method === "bank"} onClick={() => setMethod("bank")}>
                <span className="ic"><Bank size={20} /></span>
                <span><b>Bank account</b><span>Instant EFT · approve in your banking app</span></span>
              </button>
            )}
          </div>

          {method === "wallet" ? (
            <>
              <a className="btn primary" rel="noopener"
                href={`${APP}/pay-link?linkId=${encodeURIComponent(l.id)}${l.allowPartialPayment && amountOk ? `&amount=${pay.toFixed(2)}` : ""}`}>
                <Wallet size={18} /> Pay {money(l.currency, l.allowPartialPayment ? pay : remaining)} with BukkaPay
              </a>
              <p className="hint center">No account yet? You can create one in a minute. Sending between BukkaPay wallets is always free.</p>
            </>
          ) : (
            <>
              <label htmlFor="name">Your name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
              <label htmlFor="email">Email for your receipt <span style={{ fontWeight: 500 }}>(optional)</span></label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} />
              {error && <div className="notice bad" role="alert" style={{ marginTop: 14 }}>{error}</div>}
              <button className="btn primary" onClick={payByBank} disabled={busy}>
                <Lock size={18} /> {busy ? "Opening your bank…" : `Pay ${money(l.currency, l.allowPartialPayment ? pay : remaining)} securely`}
              </button>
              <p className="hint center">Powered by Stitch. You approve the payment inside your own bank. BukkaPay never sees your banking login.</p>
            </>
          )}
        </section>
      )}

      <p className="center">
        <a className="report" rel="noopener"
          href={`https://bukkapay.com/contact?topic=report-link&ref=${encodeURIComponent(l.id)}`}>Don't recognise this request? Report it</a>
      </p>
    </>
  );
}
