import { Request, Response, NextFunction, Express } from "express";
import { db } from "./db/index";
import {
  users, walletCards, transactions, paymentLinks, merchants,
  notifications, virtualCards, stokvels, stokvelMembers,
  loyaltyRewards, claimPayments, adminUsers, adminSessions,
} from "./shared/schema";
import { eq, desc, ilike, or, sql, and, count, sum, lt } from "drizzle-orm";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateAdminToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function safeAdmin(a: any) {
  const { password, ...rest } = a;
  return rest;
}

function safeUser(u: any) {
  const { password, ...rest } = u;
  return rest;
}

// ─── Admin Origin Check ───────────────────────────────────────────────────────

const ALLOWED_ADMIN_ORIGINS = ["https://admin.bukkapay.com", "http://admin.bukkapay.com"];

function isAllowedAdminOrigin(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const origin = req.headers.origin || req.headers.referer || "";
  return ALLOWED_ADMIN_ORIGINS.some((o) => origin.startsWith(o));
}

// ─── In-memory admin session cache ───────────────────────────────────────────

const adminSessionCache = new Map<string, { adminId: string; expiresAt: number }>();

async function loadAdminSessions() {
  try {
    const now = new Date();
    const rows = await db.select().from(adminSessions).where(
      // only active sessions
      sql`${adminSessions.expiresAt} > ${now}`
    );
    for (const row of rows) {
      adminSessionCache.set(row.token, { adminId: row.adminId, expiresAt: row.expiresAt.getTime() });
    }
    console.log(`[admin] Loaded ${rows.length} admin session(s)`);
  } catch (e: any) {
    console.warn("[admin] Could not load sessions:", e.message);
  }
}

async function persistAdminSession(token: string, adminId: string, expiresAt: Date) {
  try {
    await db.insert(adminSessions).values({ token, adminId, expiresAt })
      .onConflictDoUpdate({ target: adminSessions.token, set: { adminId, expiresAt } });
  } catch (e) {}
}

async function deleteAdminSession(token: string) {
  try {
    adminSessionCache.delete(token);
    await db.delete(adminSessions).where(eq(adminSessions.token, token));
  } catch (e) {}
}

// ─── Admin Auth Middleware ─────────────────────────────────────────────────────

async function adminAuth(req: Request & { adminUser?: any; isMasterKey?: boolean }, res: Response, next: NextFunction) {
  const masterKey = process.env.ADMIN_API_KEY;

  // Option 1: Master API key via x-admin-token header (machine-to-machine)
  const xToken = req.headers["x-admin-token"] as string;
  if (xToken) {
    if (!masterKey) return res.status(503).json({ error: "Admin API not configured" });
    if (xToken !== masterKey) return res.status(401).json({ error: "Invalid admin token" });
    req.isMasterKey = true;
    return next();
  }

  // Option 2: Personal admin session via Authorization: Bearer <token>
  const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
  if (bearer) {
    const cached = adminSessionCache.get(bearer);
    if (cached && cached.expiresAt > Date.now()) {
      const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, cached.adminId));
      if (!admin || !admin.isActive) return res.status(401).json({ error: "Admin account inactive" });
      req.adminUser = safeAdmin(admin);
      return next();
    }
    // Check DB as fallback
    const [session] = await db.select().from(adminSessions).where(eq(adminSessions.token, bearer));
    if (session && session.expiresAt > new Date()) {
      adminSessionCache.set(bearer, { adminId: session.adminId, expiresAt: session.expiresAt.getTime() });
      const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, session.adminId));
      if (!admin || !admin.isActive) return res.status(401).json({ error: "Admin account inactive" });
      req.adminUser = safeAdmin(admin);
      return next();
    }
    return res.status(401).json({ error: "Invalid or expired admin session" });
  }

  return res.status(401).json({ error: "Admin authentication required" });
}

// Master-key-only middleware (for managing admin accounts)
function masterKeyOnly(req: Request & { isMasterKey?: boolean }, res: Response, next: NextFunction) {
  if (!req.isMasterKey) return res.status(403).json({ error: "This action requires the master API key" });
  next();
}

export async function registerAdminRoutes(app: Express) {
  await loadAdminSessions();

  // ─── Admin Auth ────────────────────────────────────────────────────────────

  // POST /api/admin/auth/login — only works from admin.bukkapay.com
  app.post("/api/admin/auth/login", async (req: any, res) => {
    try {
      if (!isAllowedAdminOrigin(req)) {
        return res.status(403).json({ error: "Admin login is only available from admin.bukkapay.com" });
      }

      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "email and password are required" });

      const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase().trim()));
      if (!admin) return res.status(401).json({ error: "Invalid email or password" });
      if (!admin.isActive) return res.status(403).json({ error: "Admin account is deactivated" });

      const valid = await bcrypt.compare(password, admin.password);
      if (!valid) return res.status(401).json({ error: "Invalid email or password" });

      const token = generateAdminToken();
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours
      adminSessionCache.set(token, { adminId: admin.id, expiresAt: expiresAt.getTime() });
      await persistAdminSession(token, admin.id, expiresAt);

      // Update last login time
      await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, admin.id));

      res.json({ token, expiresAt, admin: safeAdmin(admin) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/admin/auth/me
  app.get("/api/admin/auth/me", adminAuth, async (req: any, res) => {
    if (req.isMasterKey) return res.json({ role: "master", name: "Master Key", email: null });
    res.json(req.adminUser);
  });

  // POST /api/admin/auth/logout
  app.post("/api/admin/auth/logout", adminAuth, async (req: any, res) => {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (bearer) await deleteAdminSession(bearer);
    res.json({ success: true });
  });

  // ─── Admin Account Management (master key only) ────────────────────────────

  // GET /api/admin/admins — list all admin users
  app.get("/api/admin/admins", adminAuth, masterKeyOnly, async (_req, res) => {
    try {
      const admins = await db.select().from(adminUsers).orderBy(desc(adminUsers.createdAt));
      res.json(admins.map(safeAdmin));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/admins — create a new admin user
  app.post("/api/admin/admins", adminAuth, masterKeyOnly, async (req, res) => {
    try {
      const { email, name, password, role = "admin" } = req.body;
      if (!email || !name || !password) return res.status(400).json({ error: "email, name, and password are required" });
      if (!["admin", "super_admin"].includes(role)) return res.status(400).json({ error: "role must be admin or super_admin" });

      const existing = await db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase().trim()));
      if (existing.length > 0) return res.status(409).json({ error: "An admin with this email already exists" });

      const hashed = await bcrypt.hash(password, 12);
      const [created] = await db.insert(adminUsers).values({
        email: email.toLowerCase().trim(),
        name,
        password: hashed,
        role,
      }).returning();

      res.status(201).json(safeAdmin(created));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/admin/admins/:id — update admin (name, email, password, role, isActive)
  app.patch("/api/admin/admins/:id", adminAuth, masterKeyOnly, async (req, res) => {
    try {
      const { name, email, password, role, isActive } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email.toLowerCase().trim();
      if (role !== undefined) updates.role = role;
      if (isActive !== undefined) updates.isActive = Boolean(isActive);
      if (password) updates.password = await bcrypt.hash(password, 12);

      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });

      const [updated] = await db.update(adminUsers).set(updates).where(eq(adminUsers.id, String(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Admin not found" });

      res.json(safeAdmin(updated));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/admin/admins/:id — delete admin user
  app.delete("/api/admin/admins/:id", adminAuth, masterKeyOnly, async (req, res) => {
    try {
      const [deleted] = await db.delete(adminUsers).where(eq(adminUsers.id, String(req.params.id))).returning();
      if (!deleted) return res.status(404).json({ error: "Admin not found" });
      res.json({ success: true, message: `Admin ${deleted.email} deleted` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Platform Stats ────────────────────────────────────────────────────────

  app.get("/api/admin/stats", adminAuth, async (_req, res) => {
    try {
      const [[{ total: totalUsers }], [{ total: totalTxns }], [{ vol }], [{ total: totalLinks }], [{ active }]] = await Promise.all([
        db.select({ total: count() }).from(users),
        db.select({ total: count() }).from(transactions),
        db.select({ vol: sum(transactions.amount) }).from(transactions),
        db.select({ total: count() }).from(paymentLinks),
        db.select({ active: count() }).from(paymentLinks).where(eq(paymentLinks.status, "active")),
      ]);

      const [[frozen], [verified], [merchantCount], [adminCount]] = await Promise.all([
        db.select({ n: count() }).from(users).where(eq(users.frozen, true)),
        db.select({ n: count() }).from(users).where(eq(users.verified, true)),
        db.select({ n: count() }).from(merchants),
        db.select({ n: count() }).from(adminUsers).where(eq(adminUsers.isActive, true)),
      ]);

      res.json({
        totalUsers: Number(totalUsers),
        totalTransactions: Number(totalTxns),
        totalVolume: Number(vol ?? 0),
        totalPaymentLinks: Number(totalLinks),
        activePaymentLinks: Number(active),
        frozenAccounts: Number(frozen.n),
        verifiedUsers: Number(verified.n),
        totalMerchants: Number(merchantCount.n),
        activeAdmins: Number(adminCount.n),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Users ─────────────────────────────────────────────────────────────────

  app.get("/api/admin/users", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const q = req.query.q ? String(req.query.q).trim() : null;
      const filterFrozen = req.query.frozen === "true" ? true : req.query.frozen === "false" ? false : null;

      let conditions: any[] = [];
      if (q) {
        conditions.push(or(
          ilike(users.name, `%${q}%`),
          ilike(users.email, `%${q}%`),
          ilike(users.username, `%${q}%`),
          ilike(users.walletId, `%${q}%`),
        ));
      }
      if (filterFrozen !== null) conditions.push(eq(users.frozen, filterFrozen));

      const baseQuery = conditions.length > 0
        ? db.select().from(users).where(and(...conditions))
        : db.select().from(users);

      const [{ total }] = await db.select({ total: count() }).from(users);
      const rows = await (baseQuery as any).orderBy(desc(users.createdAt)).limit(limit).offset(offset);

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
      const user = await storage.getUser(String(req.params.id));
      if (!user) return res.status(404).json({ error: "User not found" });

      const [cards, recentTxns, recentLinks, loyalty] = await Promise.all([
        db.select().from(walletCards).where(eq(walletCards.userId, user.id)).orderBy(desc(walletCards.createdAt)),
        db.select().from(transactions).where(eq(transactions.userId, user.id)).orderBy(desc(transactions.createdAt)).limit(20),
        db.select().from(paymentLinks).where(eq(paymentLinks.senderId, user.id)).orderBy(desc(paymentLinks.createdAt)).limit(10),
        storage.getLoyaltyReward(user.id),
      ]);

      const totalBalance = cards.reduce((s, c) => s + parseFloat(c.balance ?? "0"), 0);
      res.json({ user: safeUser(user), cards, recentTransactions: recentTxns, recentPaymentLinks: recentLinks, loyalty: loyalty ?? null, totalBalance: totalBalance.toFixed(2) });
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
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      const [updated] = await db.update(users).set(updates).where(eq(users.id, String(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json(safeUser(updated));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/users/:id/freeze", adminAuth, async (req, res) => {
    try {
      const frozen = req.body.frozen !== false;
      const [updated] = await db.update(users).set({ frozen }).where(eq(users.id, String(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "User not found" });
      await storage.createNotification({
        userId: String(req.params.id),
        type: frozen ? "alert" : "info",
        title: frozen ? "Account Suspended" : "Account Reinstated",
        message: frozen
          ? "Your account has been temporarily suspended. Please contact support for assistance."
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
      const [updated] = await db.update(users).set({ verified }).where(eq(users.id, String(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "User not found" });
      if (verified) {
        await storage.createNotification({ userId: String(req.params.id), type: "success", title: "Account Verified", message: "Congratulations! Your BukkaPay account has been verified." });
      }
      res.json({ success: true, verified, user: safeUser(updated) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/admin/users/:id", adminAuth, async (req, res) => {
    try {
      const user = await storage.getUser(String(req.params.id));
      if (!user) return res.status(404).json({ error: "User not found" });
      await db.delete(users).where(eq(users.id, String(req.params.id)));
      res.json({ success: true, message: `User ${user.username} deleted` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:id/notify", adminAuth, async (req, res) => {
    try {
      const { type = "info", title, message } = req.body;
      if (!title || !message) return res.status(400).json({ error: "title and message are required" });
      const user = await storage.getUser(String(req.params.id));
      if (!user) return res.status(404).json({ error: "User not found" });
      const notif = await storage.createNotification({ userId: String(req.params.id), type, title, message });
      res.status(201).json(notif);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/broadcast", adminAuth, async (req, res) => {
    try {
      const { type = "info", title, message } = req.body;
      if (!title || !message) return res.status(400).json({ error: "title and message are required" });
      const allUsers = await db.select({ id: users.id }).from(users);
      await Promise.all(allUsers.map((u) => storage.createNotification({ userId: u.id, type, title, message })));
      res.json({ success: true, sent: allUsers.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Transactions ──────────────────────────────────────────────────────────

  app.get("/api/admin/transactions", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const userId = req.query.userId ? String(req.query.userId) : null;

      const baseJoin = db.select({
        transaction: transactions,
        user: { id: users.id, name: users.name, username: users.username, email: users.email },
      }).from(transactions).innerJoin(users, eq(transactions.userId, users.id));

      const rows = await (userId
        ? (baseJoin as any).where(eq(transactions.userId, userId))
        : baseJoin
      ).orderBy(desc(transactions.createdAt)).limit(limit).offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(transactions);
      res.json({ transactions: rows.map((r: any) => ({ ...r.transaction, user: r.user })), pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/admin/transactions/:id", adminAuth, async (req, res) => {
    try {
      await db.delete(transactions).where(eq(transactions.id, String(req.params.id)));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Wallets ───────────────────────────────────────────────────────────────

  app.get("/api/admin/wallets", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const userId = req.query.userId ? String(req.query.userId) : null;

      const baseJoin = db.select({
        card: walletCards,
        user: { id: users.id, name: users.name, username: users.username, walletId: users.walletId },
      }).from(walletCards).innerJoin(users, eq(walletCards.userId, users.id));

      const rows = await (userId
        ? (baseJoin as any).where(eq(walletCards.userId, userId))
        : baseJoin
      ).orderBy(desc(walletCards.createdAt)).limit(limit).offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(walletCards);
      res.json({ wallets: rows.map((r: any) => ({ ...r.card, user: r.user })), pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/wallets/:id/freeze", adminAuth, async (req, res) => {
    try {
      const frozen = req.body.frozen !== false;
      const [updated] = await db.update(walletCards).set({ frozen }).where(eq(walletCards.id, String(req.params.id))).returning();
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
      const [updated] = await db.update(walletCards).set({ balance: String(balance) }).where(eq(walletCards.id, String(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Card not found" });
      res.json({ success: true, card: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Payment Links ─────────────────────────────────────────────────────────

  app.get("/api/admin/payment-links", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const status = req.query.status ? String(req.query.status) : null;

      const baseJoin = db.select({
        link: paymentLinks,
        user: { id: users.id, name: users.name, username: users.username, email: users.email },
      }).from(paymentLinks).innerJoin(users, eq(paymentLinks.senderId, users.id));

      const rows = await (status
        ? (baseJoin as any).where(eq(paymentLinks.status, status))
        : baseJoin
      ).orderBy(desc(paymentLinks.createdAt)).limit(limit).offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(paymentLinks);
      res.json({ paymentLinks: rows.map((r: any) => ({ ...r.link, user: r.user })), pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/payment-links/:id/status", adminAuth, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: "status is required" });
      const [updated] = await db.update(paymentLinks).set({ status }).where(eq(paymentLinks.id, String(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Payment link not found" });
      res.json({ success: true, paymentLink: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Merchants ─────────────────────────────────────────────────────────────

  app.get("/api/admin/merchants", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const rows = await db.select({
        merchant: merchants,
        user: { id: users.id, name: users.name, username: users.username, email: users.email },
      }).from(merchants).innerJoin(users, eq(merchants.userId, users.id)).orderBy(desc(merchants.createdAt)).limit(limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(merchants);
      res.json({ merchants: rows.map((r) => ({ ...r.merchant, user: r.user })), pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Virtual Cards ─────────────────────────────────────────────────────────

  app.get("/api/admin/virtual-cards", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const rows = await db.select({
        card: virtualCards,
        user: { id: users.id, name: users.name, username: users.username, email: users.email },
      }).from(virtualCards).innerJoin(users, eq(virtualCards.userId, users.id)).orderBy(desc(virtualCards.createdAt)).limit(limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(virtualCards);
      res.json({ virtualCards: rows.map((r) => ({ ...r.card, user: r.user })), pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Stokvels ──────────────────────────────────────────────────────────────

  app.get("/api/admin/stokvels", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const rows = await db.select().from(stokvels).orderBy(desc(stokvels.createdAt)).limit(limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(stokvels);
      res.json({ stokvels: rows, pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Claims ────────────────────────────────────────────────────────────────

  app.get("/api/admin/claims", adminAuth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? 1)));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 50))));
      const offset = (page - 1) * limit;
      const rows = await db.select().from(claimPayments).orderBy(desc(claimPayments.createdAt)).limit(limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(claimPayments);
      res.json({ claims: rows, pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
