"use client";

import { useCallback, useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { APP, ApiError, api, isId, money } from "@/lib/api";

type Claim = {
  id: string; recipientName: string; amount: string; currency: string; note: string | null; status: string;
  claimed: boolean; claimMethod: string | null; pickupStatus: string; expiresAt: string;
};
type Step = "pin" | "choose" | "bank" | "cash" | "done";

export default function ClaimPage() {
  const { id } = useParams<{ id: string }>();
  if (!isId(String(id))) notFound();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<Step>("pin");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [doneText, setDoneText] = useState("");
  const [bank, setBank] = useState({ accountName: "", bankName: "", accountNumber: "", branchCode: "" });

  const load = useCallback(async () => {
    try { setClaim(await api<Claim>("GET", `/api/claim-payments/${id}/public`)); }
    catch (e) { setLoadError(e instanceof ApiError && e.status === 404 ? "This claim link doesn't exist." : (e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loadError) return <div className="card hero"><h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Can't open this claim</h1><p className="muted">{loadError}</p></div>;
  if (!claim) return <div className="spinner" role="status" aria-label="Loading" />;

  const closed = claim.claimed || claim.status === "cancelled" || claim.status === "completed";
  const run = async (fn: () => Promise<void>) => {
    setError(""); setBusy(true);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const verifyPin = () => run(async () => {
    if (!/^\d{4,8}$/.test(pin)) throw new Error("Enter the PIN the sender gave you.");
    await api("POST", `/api/claim-payments/${id}/verify-pin`, { pin });
    setStep("choose");
  });
  const claimBank = () => run(async () => {
    if (bank.accountName.trim().length < 2 || bank.bankName.trim().length < 2) throw new Error("Enter the account holder and bank.");
    if (!/^\d{6,16}$/.test(bank.accountNumber)) throw new Error("Enter a valid account number.");
    const r = await api<{ message: string }>("POST", `/api/claim-payments/${id}/claim-bank`, {
      pin, accountName: bank.accountName.trim(), bankName: bank.bankName.trim(), accountNumber: bank.accountNumber,
      branchCode: bank.branchCode.trim() || undefined,
    });
    setDoneText(r.message || "Your money is on its way to your bank."); setStep("done");
  });
  const claimCash = () => run(async () => {
    const r = await api<{ pickupCode: string }>("POST", `/api/claim-payments/${id}/claim-cash`, { pin });
    setCode(r.pickupCode); setStep("cash");
  });

  return (
    <>
      <section className="card hero" aria-label="Money for you">
        <p className="from">Money for {claim.recipientName}</p>
        <p className="amount">{money(claim.currency, claim.amount)}</p>
        {claim.note && <p className="desc">“{claim.note}”</p>}
        <div style={{ marginTop: 10 }}>
          {closed ? <span className="pill ok">Already claimed</span>
            : <span className="pill warn">Claim by {new Date(claim.expiresAt).toLocaleDateString()}</span>}
        </div>
      </section>

      {!closed && step === "pin" && (
        <section className="card">
          <h2>Enter your claim PIN</h2>
          <p className="hint" style={{ marginTop: 0 }}>The sender shared a PIN with you separately. After a few wrong tries the claim locks.</p>
          <label htmlFor="pin">PIN</label>
          <input id="pin" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          {error && <div className="notice bad" role="alert" style={{ marginTop: 12 }}>{error}</div>}
          <button className="btn primary" onClick={verifyPin} disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        </section>
      )}

      {!closed && step === "choose" && (
        <section className="card">
          <h2>How do you want it?</h2>
          <a className="btn dark" href={`${APP}/claim/${encodeURIComponent(claim.id)}`} rel="noopener">Into my BukkaPay wallet (instant)</a>
          <button className="btn primary" onClick={() => setStep("bank")}>To my bank account</button>
          <button className="btn ghost" onClick={claimCash} disabled={busy}>{busy ? "…" : "Cash pickup code"}</button>
          {error && <div className="notice bad" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        </section>
      )}

      {!closed && step === "bank" && (
        <section className="card">
          <h2>Your bank account</h2>
          {([["accountName", "Account holder name", "name"], ["bankName", "Bank", "organization"],
             ["accountNumber", "Account number", "off"], ["branchCode", "Branch code (optional)", "off"]] as const).map(([k, label, ac]) => (
            <div key={k}>
              <label htmlFor={k}>{label}</label>
              <input id={k} autoComplete={ac} value={bank[k]} inputMode={k === "accountNumber" || k === "branchCode" ? "numeric" : undefined}
                onChange={(e) => setBank({ ...bank, [k]: k === "accountNumber" || k === "branchCode" ? e.target.value.replace(/\D/g, "").slice(0, 16) : e.target.value })} />
            </div>
          ))}
          {error && <div className="notice bad" role="alert" style={{ marginTop: 12 }}>{error}</div>}
          <button className="btn primary" onClick={claimBank} disabled={busy}>{busy ? "Sending…" : `Send ${money(claim.currency, claim.amount)} to my bank`}</button>
          <button className="btn ghost" onClick={() => setStep("choose")}>Back</button>
        </section>
      )}

      {step === "cash" && (
        <section className="card center">
          <h2>Your cash pickup code</h2>
          <div className="code" aria-label="Pickup code">{code.replace(/(.{5})/g, "$1 ").trim()}</div>
          <p className="hint">Show this code at a BukkaPay cash point with your ID. Keep it private: anyone with the code can collect the money.</p>
        </section>
      )}

      {step === "done" && <div className="notice ok" role="status">{doneText}</div>}
    </>
  );
}
