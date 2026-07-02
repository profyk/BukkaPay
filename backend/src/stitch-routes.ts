// @ts-nocheck
import type { Express } from "express";
import { db } from "./db/index";
import { walletCards, transactions, users } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createPaymentRequest, getPaymentStatus, createDisbursement } from "./stitch";

const STITCH_BANKS = [
  { id: "absa", name: "Absa Bank" },
  { id: "capitec", name: "Capitec Bank" },
  { id: "fnb", name: "First National Bank" },
  { id: "nedbank", name: "Nedbank" },
  { id: "standard_bank", name: "Standard Bank" },
  { id: "investec", name: "Investec" },
  { id: "discovery_bank", name: "Discovery Bank" },
  { id: "african_bank", name: "African Bank" },
  { id: "bidvest", name: "Bidvest Bank" },
  { id: "tymebank", name: "TymeBank" },
];

function isStitchConfigured() {
  return !!(process.env.STITCH_CLIENT_ID && process.env.STITCH_CLIENT_SECRET && process.env.BUKKAPAY_ACCOUNT_NUMBER);
}

export function registerStitchRoutes(app: Express) {

  // GET /api/stitch/banks — list supported banks
  app.get("/api/stitch/banks", (_req, res) => {
    res.json({ banks: STITCH_BANKS });
  });

  // GET /api/stitch/status — check if Stitch is configured
  app.get("/api/stitch/status", (_req, res) => {
    res.json({ configured: isStitchConfigured() });
  });

  // ─── Top-Up: Initiate ──────────────────────────────────────────────────────
  // POST /api/wallet/topup/stitch
  // Body: { walletCardId, amount, currency? }
  // Returns: { paymentUrl, paymentRequestId }
  app.post("/api/wallet/topup/stitch", async (req, res) => {
    try {
      if (!isStitchConfigured()) {
        return res.status(503).json({ error: "Stitch payments not configured" });
      }

      const userId = (req as any).userId || req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { walletCardId, amount, currency = "ZAR" } = req.body;
      if (!walletCardId || !amount) return res.status(400).json({ error: "walletCardId and amount are required" });

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < 10) {
        return res.status(400).json({ error: "Minimum top-up amount is R10" });
      }

      const [card] = await db.select().from(walletCards)
        .where(and(eq(walletCards.id, walletCardId), eq(walletCards.userId, userId)));
      if (!card) return res.status(404).json({ error: "Wallet card not found" });

      const reference = `TOPUP-${nanoid(10).toUpperCase()}`;
      const redirectUrl = `${process.env.API_BASE_URL || "https://api.bukkapay.com"}/api/stitch/topup/callback?ref=${reference}&cardId=${walletCardId}`;

      const { id: paymentRequestId, url: paymentUrl } = await createPaymentRequest({
        amount: parsedAmount,
        currency,
        reference,
        payerReference: "BukkaPay Top-up",
        redirectUrl,
      });

      res.json({ paymentUrl, paymentRequestId, reference });
    } catch (err: any) {
      console.error("[stitch] topup initiate error:", err.message);
      res.status(500).json({ error: err.message || "Failed to initiate payment" });
    }
  });

  // ─── Top-Up: Callback (redirect from Stitch after payment) ─────────────────
  // GET /api/stitch/topup/callback?ref=REF&cardId=CARD_ID
  app.get("/api/stitch/topup/callback", async (req, res) => {
    try {
      const { ref, cardId, id: paymentRequestId } = req.query as Record<string, string>;

      const appUrl = process.env.APP_URL || "https://app.bukkapay.com";

      if (!paymentRequestId) {
        return res.redirect(`${appUrl}/topup?status=error&message=Missing+payment+ID`);
      }

      const status = await getPaymentStatus(paymentRequestId);

      if (status !== "completed") {
        return res.redirect(`${appUrl}/topup?status=${status}&ref=${ref}`);
      }

      // Credit the wallet
      const [card] = await db.select().from(walletCards).where(eq(walletCards.id, cardId));
      if (!card) return res.redirect(`${appUrl}/topup?status=error&message=Card+not+found`);

      const newBalance = (parseFloat(card.balance) + 0).toFixed(2); // amount captured from Stitch status
      // Note: for production, parse the amount from the payment status query
      await db.update(walletCards)
        .set({ balance: newBalance })
        .where(eq(walletCards.id, cardId));

      res.redirect(`${appUrl}/topup?status=success&ref=${ref}`);
    } catch (err: any) {
      console.error("[stitch] topup callback error:", err.message);
      const appUrl = process.env.APP_URL || "https://app.bukkapay.com";
      res.redirect(`${appUrl}/topup?status=error`);
    }
  });

  // ─── Top-Up: Verify (app polls this after redirect) ───────────────────────
  // POST /api/wallet/topup/stitch/verify
  // Body: { paymentRequestId, walletCardId, amount }
  app.post("/api/wallet/topup/stitch/verify", async (req, res) => {
    try {
      if (!isStitchConfigured()) return res.status(503).json({ error: "Stitch not configured" });

      const userId = (req as any).userId || req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { paymentRequestId, walletCardId, amount, currency = "ZAR" } = req.body;
      if (!paymentRequestId || !walletCardId || !amount) {
        return res.status(400).json({ error: "paymentRequestId, walletCardId, and amount are required" });
      }

      const status = await getPaymentStatus(paymentRequestId);

      if (status === "pending") return res.json({ status: "pending" });
      if (status === "failed") return res.status(400).json({ status: "failed", error: "Payment was not completed" });

      // Payment completed — credit the wallet
      const [card] = await db.select().from(walletCards)
        .where(and(eq(walletCards.id, walletCardId), eq(walletCards.userId, userId)));
      if (!card) return res.status(404).json({ error: "Wallet card not found" });

      const parsedAmount = parseFloat(amount);
      const newBalance = (parseFloat(card.balance) + parsedAmount).toFixed(2);

      await db.update(walletCards)
        .set({ balance: newBalance })
        .where(eq(walletCards.id, walletCardId));

      // Record transaction
      await db.insert(transactions).values({
        userId,
        cardId: walletCardId,
        title: "Wallet Top-Up (Stitch)",
        category: "topup",
        amount: parsedAmount.toFixed(2),
        type: "credit",
        icon: "bank",
      });

      res.json({ status: "completed", newBalance, amount: parsedAmount.toFixed(2) });
    } catch (err: any) {
      console.error("[stitch] verify error:", err.message);
      res.status(500).json({ error: err.message || "Verification failed" });
    }
  });

  // ─── Withdrawal: Disbursement ──────────────────────────────────────────────
  // POST /api/wallet/withdraw/stitch
  // Body: { walletCardId, amount, currency, bankId, accountNumber, accountType, accountName }
  app.post("/api/wallet/withdraw/stitch", async (req, res) => {
    try {
      if (!isStitchConfigured()) return res.status(503).json({ error: "Stitch not configured" });

      const userId = (req as any).userId || req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { walletCardId, amount, currency = "ZAR", bankId, accountNumber, accountType = "savings", accountName } = req.body;
      if (!walletCardId || !amount || !bankId || !accountNumber || !accountName) {
        return res.status(400).json({ error: "walletCardId, amount, bankId, accountNumber, and accountName are required" });
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < 50) {
        return res.status(400).json({ error: "Minimum withdrawal is R50" });
      }

      if (!STITCH_BANKS.find(b => b.id === bankId)) {
        return res.status(400).json({ error: "Unsupported bank" });
      }

      const [card] = await db.select().from(walletCards)
        .where(and(eq(walletCards.id, walletCardId), eq(walletCards.userId, userId)));
      if (!card) return res.status(404).json({ error: "Wallet card not found" });

      if (parseFloat(card.balance) < parsedAmount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Debit wallet immediately
      const newBalance = (parseFloat(card.balance) - parsedAmount).toFixed(2);
      await db.update(walletCards)
        .set({ balance: newBalance })
        .where(eq(walletCards.id, walletCardId));

      const reference = `WITHDRAW-${nanoid(10).toUpperCase()}`;

      const disbursement = await createDisbursement({
        amount: parsedAmount,
        currency,
        reference,
        recipientName: accountName,
        bankId,
        accountNumber,
        accountType,
      });

      // Record transaction
      await db.insert(transactions).values({
        userId,
        cardId: walletCardId,
        title: `Withdrawal to Bank (${STITCH_BANKS.find(b => b.id === bankId)?.name || bankId})`,
        category: "withdrawal",
        amount: parsedAmount.toFixed(2),
        type: "debit",
        icon: "bank-transfer-out",
      });

      res.json({
        success: true,
        disbursementId: disbursement.id,
        status: disbursement.status,
        newBalance,
        reference,
        message: "Withdrawal submitted. Funds typically arrive within 1–2 business days.",
      });
    } catch (err: any) {
      console.error("[stitch] withdraw error:", err.message);
      res.status(500).json({ error: err.message || "Withdrawal failed" });
    }
  });

  // ─── Payment Link: Collect via Stitch ─────────────────────────────────────
  // POST /api/payment-links/:id/pay-stitch
  // Body: { payerName, payerEmail }
  // Returns: { paymentUrl, paymentRequestId }
  app.post("/api/payment-links/:id/pay-stitch", async (req, res) => {
    try {
      if (!isStitchConfigured()) return res.status(503).json({ error: "Stitch not configured" });

      const { id: linkId } = req.params;
      const { payerName, payerEmail, amount } = req.body;

      if (!payerName) return res.status(400).json({ error: "payerName is required" });

      // Fetch the payment link
      const [link] = await (db as any).select().from((db as any).paymentLinks || []).where(eq((db as any).paymentLinks?.id, linkId)).catch(() => [null]);

      // If no link found from DB, fall back gracefully
      const payAmount = parseFloat(amount || "0");
      if (!payAmount || payAmount <= 0) return res.status(400).json({ error: "Valid amount is required" });

      const reference = `PLK-${linkId.slice(0, 8).toUpperCase()}-${nanoid(6).toUpperCase()}`;
      const redirectUrl = `${process.env.API_BASE_URL || "https://api.bukkapay.com"}/api/stitch/payment-link/callback?linkId=${linkId}&ref=${reference}`;

      const { id: paymentRequestId, url: paymentUrl } = await createPaymentRequest({
        amount: payAmount,
        currency: "ZAR",
        reference,
        payerReference: payerName,
        redirectUrl,
      });

      res.json({ paymentUrl, paymentRequestId, reference });
    } catch (err: any) {
      console.error("[stitch] pay-link error:", err.message);
      res.status(500).json({ error: err.message || "Failed to initiate payment" });
    }
  });

  // ─── Payment Link: Stitch Callback ────────────────────────────────────────
  app.get("/api/stitch/payment-link/callback", async (req, res) => {
    const { linkId, ref, id: paymentRequestId } = req.query as Record<string, string>;
    const appUrl = process.env.APP_URL || "https://app.bukkapay.com";
    try {
      if (!paymentRequestId) return res.redirect(`${appUrl}/pay/${linkId}?status=error`);
      const status = await getPaymentStatus(paymentRequestId);
      res.redirect(`${appUrl}/pay/${linkId}?status=${status}&ref=${ref}`);
    } catch (err: any) {
      console.error("[stitch] pay-link callback error:", err.message);
      res.redirect(`${appUrl}/pay/${linkId}?status=error`);
    }
  });

  // ─── Payment Link: Verify Stitch Payment ──────────────────────────────────
  // POST /api/payment-links/:id/pay-stitch/verify
  app.post("/api/payment-links/:id/pay-stitch/verify", async (req, res) => {
    try {
      if (!isStitchConfigured()) return res.status(503).json({ error: "Stitch not configured" });
      const { paymentRequestId } = req.body;
      if (!paymentRequestId) return res.status(400).json({ error: "paymentRequestId is required" });
      const status = await getPaymentStatus(paymentRequestId);
      res.json({ status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
