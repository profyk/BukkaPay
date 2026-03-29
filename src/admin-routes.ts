import { Request, Response, NextFunction, Express } from "express";
import { db } from "./db/index";
import {
  users, walletCards, transactions, paymentLinks, merchants,
  notifications, virtualCards, stokvels, stokvelMembers,
  loyaltyRewards, claimPayments,
} from "./shared/schema";
import { eq, desc, ilike, or, sql, and, count, sum } from "drizzle-orm";
import { storage } from "./storage";

// ─── Admin Auth Middleware ─────────────────────────────────────────────────────

function adminAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-admin-token"] as string;
  const key = process.env.ADMIN_API_KEY;

  if (!key) {
    return res.status(503).json({ error: "Admin API not configured — set ADMIN_API_KEY environment variable" });
  }
  if (!token || token !== key) {
    return res.status(401).json({ error: "Invalid or missing admin token" });
  }
  next();
}

// Strip password hash before sending user data
function safeUser(u: any) {
  const { password, ...rest } = u;
  return rest;
}

export function registerAdminRoutes(app: Express) {

  // ─── Platform Stats ──────────────────────────────────────────────────────────

  app.get("/api/admin/stats", adminAuth, async (_req, res) => {
    try {
      const [[{ total: totalUsers }], [{ total: totalTxns }], [{ vol }], [{ totalLinks }], [{ active }]] = await Promise.all([
        db.select({ total: count() }).from(users),
        db.select({ total: count() }).from(transactions),
        db.select({ vol: sum(transactions.amount) }).from(transactions),
        db.select({ total: count() }).from(paymentLinks),
        db.select({ active: count() }).from(paymentLinks).where(eq(paymentLinks.status, "active")),
      ]);

      const [frozen] = await db.select({ n: count() }).from(users).where(eq(users.frozen, true));
      const [verified] = await db.select({ n: count() }).from(users).where(eq(users.verified, true));
      const [merchantCount] = await db.select({ n: count() }).from(merchants);

      res.json({
        totalUsers: Number(totalUsers),
        totalTransactions: Number(totalTxns),
        totalVolume: Number(vol ?? 0),
        totalPaymentLinks: Number(totalLinks),
        activePaymentLinks: Number(active),
        frozenAccounts: Number(frozen.n),
        verifiedUsers: Number(verified.n),
        totalMerchants: Number(merchantCount.n),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Users ───────────────────────────────────────────────────────────────────

  app.get("/api/admin/users", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const q = req.query.q ? String(req.query.q).trim() : null;
      const filterFrozen = req.query.frozen === "true" ? true : req.query.frozen === "false" ? false : null;

      let query = db.select().from(users);

      if (q) {
        query = query.where(
          or(
            ilike(users.name, `%${q}%`),
            ilike(users.email, `%${q}%`),
            ilike(users.username, `%${q}%`),
            ilike(users.walletId, `%${q}%`),
            users.phone ? ilike(users.phone, `%${q}%`) : undefined,
          )
        ) as any;
      }

      if (filterFrozen !== null) {
        query = query.where(eq(users.frozen, filterFrozen)) as any;
      }

      const [{ total }] = await db.select({ total: count() }).from(users);

      const rows = await (query as any)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({
        users: rows.map(safeUser),
        pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/users/:id", adminAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const [cards, recentTxns, recentLinks, loyalty] = await Promise.all([
        db.select().from(walletCards).where(eq(walletCards.userId, user.id)).orderBy(desc(walletCards.createdAt)),
        db.select().from(transactions).where(eq(transactions.userId, user.id)).orderBy(desc(transactions.createdAt)).limit(20),
        db.select().from(paymentLinks).where(eq(paymentLinks.senderId, user.id)).orderBy(desc(paymentLinks.createdAt)).limit(10),
        storage.getLoyaltyReward(user.id),
      ]);

      const totalBalance = cards.reduce((sum, c) => sum + parseFloat(c.balance ?? "0"), 0);

      res.json({
        user: safeUser(user),
        cards,
        recentTransactions: recentTxns,
        recentPaymentLinks: recentLinks,
        loyalty: loyalty ?? null,
        totalBalance: totalBalance.toFixed(2),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/users/:id", adminAuth, async (req, res) => {
    try {
      const { name, email, phone, verified } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (verified !== undefined) updates.verified = Boolean(verified);

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const [updated] = await db.update(users).set(updates).where(eq(users.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json(safeUser(updated));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/users/:id/freeze", adminAuth, async (req, res) => {
    try {
      const frozen = req.body.frozen !== false;
      const [updated] = await db.update(users).set({ frozen }).where(eq(users.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "User not found" });

      await storage.createNotification({
        userId: req.params.id,
        type: frozen ? "alert" : "info",
        title: frozen ? "Account Suspended" : "Account Reinstated",
        message: frozen
          ? "Your account has been temporarily suspended by our team. Please contact support."
          : "Your account has been reinstated. Welcome back!",
      });

      res.json({ success: true, frozen, user: safeUser(updated) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/users/:id/verify", adminAuth, async (req, res) => {
    try {
      const verified = req.body.verified !== false;
      const [updated] = await db.update(users).set({ verified }).where(eq(users.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "User not found" });

      if (verified) {
        await storage.createNotification({
          userId: req.params.id,
          type: "success",
          title: "Account Verified",
          message: "Congratulations! Your BukkaPay account has been verified.",
        });
      }

      res.json({ success: true, verified, user: safeUser(updated) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/admin/users/:id", adminAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      await db.delete(users).where(eq(users.id, req.params.id));
      res.json({ success: true, message: `User ${user.username} deleted` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:id/notify", adminAuth, async (req, res) => {
    try {
      const { type = "info", title, message } = req.body;
      if (!title || !message) return res.status(400).json({ error: "title and message are required" });

      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const notif = await storage.createNotification({ userId: req.params.id, type, title, message });
      res.status(201).json(notif);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Broadcast notification to ALL users
  app.post("/api/admin/broadcast", adminAuth, async (req, res) => {
    try {
      const { type = "info", title, message } = req.body;
      if (!title || !message) return res.status(400).json({ error: "title and message are required" });

      const allUsers = await db.select({ id: users.id }).from(users);
      await Promise.all(allUsers.map((u) =>
        storage.createNotification({ userId: u.id, type, title, message })
      ));

      res.json({ success: true, sent: allUsers.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Transactions ────────────────────────────────────────────────────────────

  app.get("/api/admin/transactions", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const userId = req.query.userId ? String(req.query.userId) : null;

      let rows: any[];
      if (userId) {
        rows = await db.select({
          transaction: transactions,
          user: { id: users.id, name: users.name, username: users.username, email: users.email },
        })
          .from(transactions)
          .innerJoin(users, eq(transactions.userId, users.id))
          .where(eq(transactions.userId, userId))
          .orderBy(desc(transactions.createdAt))
          .limit(limit)
          .offset(offset);
      } else {
        rows = await db.select({
          transaction: transactions,
          user: { id: users.id, name: users.name, username: users.username, email: users.email },
        })
          .from(transactions)
          .innerJoin(users, eq(transactions.userId, users.id))
          .orderBy(desc(transactions.createdAt))
          .limit(limit)
          .offset(offset);
      }

      const [{ total }] = await db.select({ total: count() }).from(transactions);

      res.json({
        transactions: rows.map((r) => ({ ...r.transaction, user: r.user })),
        pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Wallets / Cards ─────────────────────────────────────────────────────────

  app.get("/api/admin/wallets", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const userId = req.query.userId ? String(req.query.userId) : null;

      let rows: any[];
      if (userId) {
        rows = await db.select({
          card: walletCards,
          user: { id: users.id, name: users.name, username: users.username, walletId: users.walletId },
        })
          .from(walletCards)
          .innerJoin(users, eq(walletCards.userId, users.id))
          .where(eq(walletCards.userId, userId))
          .orderBy(desc(walletCards.createdAt))
          .limit(limit).offset(offset);
      } else {
        rows = await db.select({
          card: walletCards,
          user: { id: users.id, name: users.name, username: users.username, walletId: users.walletId },
        })
          .from(walletCards)
          .innerJoin(users, eq(walletCards.userId, users.id))
          .orderBy(desc(walletCards.createdAt))
          .limit(limit).offset(offset);
      }

      const [{ total }] = await db.select({ total: count() }).from(walletCards);

      res.json({
        wallets: rows.map((r) => ({ ...r.card, user: r.user })),
        pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/wallets/:id/freeze", adminAuth, async (req, res) => {
    try {
      const frozen = req.body.frozen !== false;
      const [updated] = await db.update(walletCards).set({ frozen }).where(eq(walletCards.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Card not found" });
      res.json({ success: true, frozen, card: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/wallets/:id/balance", adminAuth, async (req, res) => {
    try {
      const { balance } = req.body;
      if (balance === undefined) return res.status(400).json({ error: "balance is required" });
      const [updated] = await db.update(walletCards).set({ balance: String(balance) }).where(eq(walletCards.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Card not found" });
      res.json({ success: true, card: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Payment Links ───────────────────────────────────────────────────────────

  app.get("/api/admin/payment-links", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const status = req.query.status ? String(req.query.status) : null;

      let q = db.select({
        link: paymentLinks,
        user: { id: users.id, name: users.name, username: users.username, email: users.email },
      })
        .from(paymentLinks)
        .innerJoin(users, eq(paymentLinks.senderId, users.id));

      if (status) {
        q = q.where(eq(paymentLinks.status, status)) as any;
      }

      const rows = await (q as any).orderBy(desc(paymentLinks.createdAt)).limit(limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(paymentLinks);

      res.json({
        paymentLinks: rows.map((r: any) => ({ ...r.link, user: r.user })),
        pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/payment-links/:id/status", adminAuth, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: "status is required" });
      const [updated] = await db.update(paymentLinks).set({ status }).where(eq(paymentLinks.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Payment link not found" });
      res.json({ success: true, paymentLink: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Merchants ───────────────────────────────────────────────────────────────

  app.get("/api/admin/merchants", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;

      const rows = await db.select({
        merchant: merchants,
        user: { id: users.id, name: users.name, username: users.username, email: users.email },
      })
        .from(merchants)
        .innerJoin(users, eq(merchants.userId, users.id))
        .orderBy(desc(merchants.createdAt))
        .limit(limit).offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(merchants);

      res.json({
        merchants: rows.map((r) => ({ ...r.merchant, user: r.user })),
        pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Virtual Cards ───────────────────────────────────────────────────────────

  app.get("/api/admin/virtual-cards", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;

      const rows = await db.select({
        card: virtualCards,
        user: { id: users.id, name: users.name, username: users.username, email: users.email },
      })
        .from(virtualCards)
        .innerJoin(users, eq(virtualCards.userId, users.id))
        .orderBy(desc(virtualCards.createdAt))
        .limit(limit).offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(virtualCards);

      res.json({
        virtualCards: rows.map((r) => ({ ...r.card, user: r.user })),
        pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Stokvels ────────────────────────────────────────────────────────────────

  app.get("/api/admin/stokvels", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;

      const rows = await db.select().from(stokvels)
        .orderBy(desc(stokvels.createdAt))
        .limit(limit).offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(stokvels);

      res.json({
        stokvels: rows,
        pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Claims ──────────────────────────────────────────────────────────────────

  app.get("/api/admin/claims", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;

      const rows = await db.select().from(claimPayments)
        .orderBy(desc(claimPayments.createdAt))
        .limit(limit).offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(claimPayments);

      res.json({
        claims: rows,
        pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Delete transaction (admin only) ─────────────────────────────────────────

  app.delete("/api/admin/transactions/:id", adminAuth, async (req, res) => {
    try {
      await db.delete(transactions).where(eq(transactions.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
