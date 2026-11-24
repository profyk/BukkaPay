"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { APP, ApiError, api, isRef, money } from "@/lib/api";

type Invoice = {
  reference: string; status: string; currency: string; subtotal: string; taxTotal: string; total: string;
  paymentMode: string | null; sellerCountry: string | null; buyerCountry: string | null; incoterm: string | null;
  notes: string | null; dueAt: string | null; expiresAt: string | null;
  merchant?: { name: string; country: string; verified: boolean };
  seller?: { name: string; country: string; verified: boolean };
  items: { lineNo: number; description: string; hsCode: string | null; originCountry: string | null; quantity: string; unit: string | null; unitPrice: string; lineTotal: string }[];
};

export default function TradeInvoice() {
  const { ref } = useParams<{ ref: string }>();
  if (!isRef(String(ref))) notFound();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Invoice>("GET", `/api/public/trade-invoices/${encodeURIComponent(String(ref).toUpperCase())}`)
      .then(setInv)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "This invoice doesn't exist or is no longer open." : e.message));
  }, [ref]);

  if (error) return <div className="card hero"><h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Invoice not available</h1><p className="muted">{error}</p></div>;
  if (!inv) return <div className="spinner" role="status" aria-label="Loading" />;

  const seller = inv.merchant || inv.seller;
  const open = !["paid", "cancelled", "expired", "released", "settled"].includes(inv.status);
  return (
    <>
      <section className="card hero" aria-label="Trade invoice">
        <p className="from">Invoice {inv.reference} from {seller?.name || "a BukkaPay business"}</p>
        <p className="amount">{money(inv.currency, inv.total)}</p>
        <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {seller?.verified && <span className="pill ok">Verified business</span>}
          <span className={`pill ${open ? "warn" : "ok"}`}>{open ? "Awaiting payment" : inv.status.replace(/_/g, " ")}</span>
        </div>
      </section>

      <section className="card" aria-label="Items">
        <h2>Items</h2>
        {inv.items.map((it) => (
          <div className="row" key={it.lineNo}>
            <span className="k">{it.description}{Number(it.quantity) !== 1 ? ` × ${Number(it.quantity)}${it.unit ? ` ${it.unit}` : ""}` : ""}
              {it.hsCode ? <><br /><small>HS {it.hsCode}{it.originCountry ? ` · origin ${it.originCountry}` : ""}</small></> : null}</span>
            <span className="v">{money(inv.currency, it.lineTotal)}</span>
          </div>
        ))}
        <div className="row"><span className="k">Subtotal</span><span className="v">{money(inv.currency, inv.subtotal)}</span></div>
        {Number(inv.taxTotal) > 0 && <div className="row"><span className="k">Tax</span><span className="v">{money(inv.currency, inv.taxTotal)}</span></div>}
        <div className="row"><span className="k">Total</span><span className="v">{money(inv.currency, inv.total)}</span></div>
        {inv.incoterm && <div className="row"><span className="k">Incoterm</span><span className="v">{inv.incoterm}</span></div>}
        {inv.sellerCountry && <div className="row"><span className="k">Route</span><span className="v">{inv.sellerCountry} → {inv.buyerCountry || "?"}</span></div>}
        {inv.dueAt && <div className="row"><span className="k">Due</span><span className="v">{new Date(inv.dueAt).toLocaleDateString()}</span></div>}
        {inv.notes && <p className="hint">{inv.notes}</p>}
      </section>

      {open && (
        <section className="card">
          <a className="btn dark" href={`${APP}/trade/${encodeURIComponent(inv.reference)}`} rel="noopener">Pay with BukkaPay</a>
          <p className="hint center">Pay instantly, or into escrow: the seller is paid only when you confirm delivery. AfCFTA trade receipt included.</p>
        </section>
      )}
    </>
  );
}
