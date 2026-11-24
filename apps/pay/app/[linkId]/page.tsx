"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { API, APP, ApiError, api, isId, money, safeRedirect, type PaymentLink } from "@/lib/api";

type Load = { state: "loading" } | { state: "error"; message: string; gone?: boolean } | { state: "ready"; link: PaymentLink };

const RETURN: Record<string, { cls: string; text: string }> = {
  completed: { cls: "ok", text: "Payment received. Thank you! A receipt is on its way to the person you paid." },
  paid: { cls: "ok", text: "Payment received. Thank you!" },
  pending: { cls: "warn", text: "Your bank is still confirming the payment. This page updates once it does." },
  review: { cls: "warn", text: "We received your payment and are confirming the amount." },
  failed: { cls: "bad", text: "The payment wasn't completed. No money was taken. You can try again." },
  cancelled: { cls: "bad", text: "You cancelled at your bank. No money was taken." },
  error: { cls: "bad", text: "Something went wrong at the bank. No money was taken. Please try again." },
};

export default function PayLink() {
  const { linkId } = useParams<{ linkId: string }>();
  const search = useSearchParams();
  if (!isId(String(linkId))) notFound();

  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const returned = search.get("status");

  const fetchLink = useCallback(async () => {
    try {
      const link = await api<PaymentLink>("GET", `/api/payment-links/${linkId}`);
      setLoad({ state: "ready", link });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setLoad({ state: "error", gone: status === 404, message: status === 404 ? "This payment link doesn't exist or was deleted." : (e as Error).message });
    }
  }, [linkId]);
  useEffect(() => { fetchLink(); }, [fetchLink]);
  // A bank confirmation can land a moment after the redirect back.
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
    return { l, total, paid, remaining, expired, closed, min };
  }, [load]);

  useEffect(() => { if (view && !amount) setAmount(view.remaining.toFixed(2)); }, [view]);

  if (load.state === "loading") return <div className="spinner" role="status" aria-label="Loading" />;
  if (load.state === "error") {
    return (
      <div className="card hero">
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>{load.gone ? "Link not found" : "Couldn't load this payment"}</h1>
        <p className="muted">{load.message}</p>
        {!load.gone && <button className="btn primary" onClick={fetchLink}>Try again</button>}
      </div>
    );
  }
  const { l, total, paid, remaining, expired, closed, min } = view!;
  const pay = Number(amount || 0);
  const amountOk = l.allowPartialPayment ? pay >= min && pay <= remaining : Math.abs(pay - remaining) < 0.005;
  const payee = l.businessName || l.senderName || "BukkaPay user";

  const payByBank = async () => {
    setError("");
    if (name.trim().length < 2) { setError("Please enter your name."); return; }
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

  return (
    <>
      {returned && RETURN[returned] && <div className={`notice ${RETURN[returned].cls}`} role="status">{RETURN[returned].text}</div>}

      <section className="card hero" aria-label="Payment request">
        {l.businessLogo && /^(https:|data:image\/)/.test(l.businessLogo) && <img className="logo" src={l.businessLogo} alt="" />}
        <p className="from">{payee} is requesting</p>
        <p className="amount">{money(l.currency, closed ? total : remaining)}</p>
        {l.description && <p className="desc">{l.description}</p>}
        <div style={{ marginTop: 12 }}>
          {l.status === "paid" || remaining <= 0 ? <span className="pill ok">Paid in full</span>
            : l.status === "cancelled" ? <span className="pill bad">Cancelled</span>
            : expired ? <span className="pill bad">Expired</span>
            : paid > 0 ? <span className="pill warn">{money(l.currency, paid)} of {money(l.currency, total)} paid</span>
            : null}
        </div>
        {paid > 0 && remaining > 0 && <div className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (paid / total) * 100)}%` }} /></div>}
      </section>

      {l.invoice && (
        <section className="card" aria-label="Invoice">
          <h2>Invoice for {l.invoice.customerName}</h2>
          {(l.invoice.items || []).map((it, i) => (
            <div className="row" key={i}>
              <span className="k">{it.description || it.name || "Item"}{it.quantity && it.quantity > 1 ? ` × ${it.quantity}` : ""}</span>
              <span className="v">{money(l.currency, it.amount ?? (Number(it.unitPrice ?? it.price ?? 0) * (it.quantity || 1)))}</span>
            </div>
          ))}
          <div className="row"><span className="k">Total</span><span className="v">{money(l.currency, l.invoice.totalAmount)}</span></div>
          {l.invoice.dueDate && <div className="row"><span className="k">Due</span><span className="v">{new Date(l.invoice.dueDate).toLocaleDateString()}</span></div>}
          {l.invoice.notes && <p className="hint">{l.invoice.notes}</p>}
          <a className="btn ghost" href={`${API}/api/payment-links/${l.id}/invoice/pdf`} rel="noopener noreferrer">Download invoice (PDF)</a>
        </section>
      )}

      {!closed && (
        <section className="card" aria-label="Pay">
          <h2>Pay</h2>
          {l.allowPartialPayment && (
            <>
              <label htmlFor="amount">Amount ({l.currency})</label>
              <input id="amount" inputMode="decimal" value={amount} autoComplete="off"
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))} />
              <p className="hint">You can pay part of this: minimum {money(l.currency, min)}, up to {money(l.currency, remaining)}.</p>
            </>
          )}

          <a className="btn dark" href={`${APP}/pay-link?linkId=${encodeURIComponent(l.id)}`} rel="noopener">
            Pay with my BukkaPay wallet
          </a>
          <p className="hint center">Instant and free. You'll sign in to BukkaPay to confirm with your PIN.</p>

          {l.currency === "ZAR" && (
            <>
              <div className="or">or pay by bank</div>
              <label htmlFor="name">Your name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
              <label htmlFor="email">Email for your receipt (optional)</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} />
              {error && <div className="notice bad" role="alert" style={{ marginTop: 12 }}>{error}</div>}
              <button className="btn primary" onClick={payByBank} disabled={busy}>
                {busy ? "Opening your bank…" : `Pay ${money(l.currency, pay || remaining)} by bank`}
              </button>
              <p className="hint center">Instant EFT through Stitch. You approve the payment in your own bank's app. BukkaPay never sees your banking password.</p>
            </>
          )}
        </section>
      )}
    </>
  );
}
