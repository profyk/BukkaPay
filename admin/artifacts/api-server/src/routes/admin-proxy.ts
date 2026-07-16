import { Router, type Request, type Response } from "express";
import axios, { type AxiosError } from "axios";

const router = Router();

const BUKKAPAY_API = process.env.BUKKAPAY_API_URL ?? "https://api.bukkapay.com";
const ADMIN_MASTER_KEY = process.env.ADMIN_MASTER_KEY ?? "";

// ─── In-proxy wallet state (persists while server runs) ───────────────────────
const flaggedWallets = new Set<string>();
const blockedWallets = new Set<string>();

// ─── In-proxy pricing config ──────────────────────────────────────────────────
const pricingConfig = {
  transfer:     { fee_percentage: 0.5,  fee_fixed: 2.00, min_amount: 10,  max_amount: 50000  },
  payment_link: { fee_percentage: 1.5,  fee_fixed: 0,    min_amount: 5,   max_amount: 100000 },
  virtual_card: { issuance_fee: 25,     monthly_fee: 10, transaction_fee_percentage: 0.3     },
  withdrawal:   { fee_fixed: 15,        fee_percentage: 0, min_amount: 50, max_amount: 25000 },
  stokvel:      { management_fee_percentage: 0.2 },
  loyalty:      { points_per_rand: 1,   redemption_rate: 100 },
};

// ─── Core proxy helper ────────────────────────────────────────────────────────

interface ProxyOptions {
  method?: string;
  body?: any;
  transform?: (data: any) => any;
  useMasterKey?: boolean;
}

async function proxyRequest(req: Request, res: Response, targetPath: string, options?: ProxyOptions) {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const auth = req.headers["authorization"];
    if (options?.useMasterKey && ADMIN_MASTER_KEY) {
      headers["x-admin-token"] = ADMIN_MASTER_KEY;
    } else if (auth) {
      headers["Authorization"] = auth as string;
    }

    const qs = Object.keys(req.query).length
      ? "?" + new URLSearchParams(req.query as Record<string, string>).toString()
      : "";
    const url = `${BUKKAPAY_API}${targetPath}${qs}`;

    const response = await axios({
      method: options?.method ?? req.method,
      url,
      headers,
      data:
        options?.body !== undefined
          ? options.body
          : req.body && Object.keys(req.body).length > 0
            ? req.body
            : undefined,
      validateStatus: () => true,
    });

    let data = response.data;
    if (response.status < 400 && options?.transform) {
      data = options.transform(data);
    }
    res.status(response.status).json(data);
  } catch (err) {
    const e = err as AxiosError;
    if (e.code === "ECONNREFUSED" || e.code === "ENOTFOUND") {
      res.status(502).json({ message: `Cannot reach BukkaPay backend at ${BUKKAPAY_API}` });
    } else {
      res.status(500).json({ message: "Proxy error: " + (e.message ?? "Unknown error") });
    }
  }
}

// ─── Super-admin guard (verifies JWT role before acting) ──────────────────────

async function requireSuperAdmin(req: Request): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!ADMIN_MASTER_KEY) {
    return { ok: false, error: "Admin management not configured (set ADMIN_MASTER_KEY on the proxy)", status: 503 };
  }
  const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
  if (!bearer) return { ok: false, error: "Authentication required", status: 401 };

  try {
    const me = await axios.get(`${BUKKAPAY_API}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${bearer}` },
      validateStatus: () => true,
    });
    if (me.status !== 200) return { ok: false, error: "Invalid or expired session", status: 401 };
    if (me.data?.role !== "super_admin") {
      return { ok: false, error: "Super Admin access required for this action", status: 403 };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not verify admin credentials", status: 502 };
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post("/admin/login", (req, res) =>
  proxyRequest(req, res, "/api/admin/auth/login", {
    transform: (d) => ({ token: d.token, admin: d.admin }),
  }),
);

router.get("/admin/auth/me", (req, res) =>
  proxyRequest(req, res, "/api/admin/auth/me"),
);

router.post("/admin/auth/logout", (req, res) =>
  proxyRequest(req, res, "/api/admin/auth/logout"),
);

// ─── Admin Management (super_admin only) ─────────────────────────────────────

router.get("/admin/admins", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  proxyRequest(req, res, "/api/admin/admins", { useMasterKey: true });
});

router.post("/admin/admins", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  proxyRequest(req, res, "/api/admin/admins", { useMasterKey: true });
});

router.patch("/admin/admins/:id", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  proxyRequest(req, res, `/api/admin/admins/${req.params.id}`, { useMasterKey: true });
});

router.delete("/admin/admins/:id", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  proxyRequest(req, res, `/api/admin/admins/${req.params.id}`, { useMasterKey: true, method: "DELETE" });
});

// ─── Pricing (super_admin only) ───────────────────────────────────────────────

router.get("/admin/pricing", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  res.json(pricingConfig);
});

router.patch("/admin/pricing", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  const { category, values } = req.body;
  if (!category || !values || !(category in pricingConfig)) {
    return res.status(400).json({ message: "Invalid pricing category or values" });
  }
  (pricingConfig as any)[category] = { ...(pricingConfig as any)[category], ...values };
  res.json(pricingConfig);
});

// ─── Dashboard stats ──────────────────────────────────────────────────────────

router.get("/admin/dashboard/stats", (req, res) =>
  proxyRequest(req, res, "/api/admin/stats", {
    transform: (d) => ({
      total_users: d.totalUsers ?? 0,
      active_users: (d.totalUsers ?? 0) - (d.frozenAccounts ?? 0),
      frozen_users: d.frozenAccounts ?? 0,
      total_transactions: d.totalTransactions ?? 0,
      flagged_transactions: 0,
      total_volume: d.totalVolume ?? 0,
      pending_kyc: (d.totalUsers ?? 0) - (d.verifiedUsers ?? 0),
      total_merchants: d.totalMerchants ?? 0,
      total_payment_links: d.totalPaymentLinks ?? 0,
      active_payment_links: d.activePaymentLinks ?? 0,
      recent_transactions: [],
      user_growth: [],
    }),
  }),
);

// ─── Users ────────────────────────────────────────────────────────────────────

router.get("/admin/users", (req, res) =>
  proxyRequest(req, res, "/api/admin/users", {
    transform: (d) => ({
      users: (d.users ?? d).map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.name ?? "",
        username: u.username ?? "",
        walletId: u.walletId ?? "",
        phone: u.phone ?? "",
        status: u.frozen ? "frozen" : "active",
        role: u.role ?? "user",
        verified: u.verified ?? false,
        createdAt: u.createdAt ?? null,
      })),
      pagination: d.pagination ?? { page: 1, limit: 50, total: 0, pages: 1 },
    }),
  }),
);

router.get("/admin/users/:id", (req, res) =>
  proxyRequest(req, res, `/api/admin/users/${req.params.id}`),
);

router.post("/admin/freeze/:id", (req, res) =>
  proxyRequest(req, res, `/api/admin/users/${req.params.id}/freeze`, { method: "PATCH", body: { frozen: true } }),
);

router.post("/admin/activate/:id", (req, res) =>
  proxyRequest(req, res, `/api/admin/users/${req.params.id}/freeze`, { method: "PATCH", body: { frozen: false } }),
);

router.patch("/admin/users/:id/verify", (req, res) =>
  proxyRequest(req, res, `/api/admin/users/${req.params.id}/verify`),
);

router.delete("/admin/delete/:id", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  proxyRequest(req, res, `/api/admin/users/${req.params.id}`, { method: "DELETE" });
});

router.post("/admin/users/:id/notify", (req, res) =>
  proxyRequest(req, res, `/api/admin/users/${req.params.id}/notify`),
);

router.post("/admin/broadcast", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  proxyRequest(req, res, "/api/admin/broadcast");
});

// ─── KYC ─────────────────────────────────────────────────────────────────────

router.get("/admin/kyc", (req, res) =>
  proxyRequest(req, res, "/api/admin/users?limit=100", {
    transform: (d) =>
      (d.users ?? d).filter((u: any) => !u.verified).map((u: any) => ({
        id: u.id,
        user_id: u.id,
        user_email: u.email,
        full_name: u.name ?? u.username ?? u.email,
        document_type: "national_id",
        document_number: u.walletId ?? "N/A",
        status: "pending",
        submitted_at: u.createdAt ?? new Date().toISOString(),
      })),
  }),
);

router.post("/admin/kyc/:id/approve", (req, res) =>
  proxyRequest(req, res, `/api/admin/users/${req.params.id}/verify`, { method: "PATCH", body: { verified: true } }),
);

router.post("/admin/kyc/:id/reject", (req, res) =>
  proxyRequest(req, res, `/api/admin/users/${req.params.id}/verify`, { method: "PATCH", body: { verified: false } }),
);

// ─── Transactions ─────────────────────────────────────────────────────────────

router.get("/admin/transactions", (req, res) =>
  proxyRequest(req, res, "/api/admin/transactions", {
    transform: (d) => ({
      transactions: (d.transactions ?? d).map((t: any) => ({
        id: t.id,
        user_email: t.user?.email ?? "",
        user_name: t.user?.name ?? "",
        amount: parseFloat(t.amount ?? "0"),
        status: t.status ?? "completed",
        currency: t.currency ?? "ZAR",
        type: t.type ?? "transfer",
        description: t.description ?? "",
        created_at: t.createdAt ?? null,
      })),
      pagination: d.pagination ?? { page: 1, limit: 50, total: 0, pages: 1 },
    }),
  }),
);

router.post("/admin/transactions/flag/:id", (_req, res) => res.json({ success: true }));

router.delete("/admin/transactions/:id", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  proxyRequest(req, res, `/api/admin/transactions/${req.params.id}`, { method: "DELETE" });
});

// ─── Wallets ──────────────────────────────────────────────────────────────────

router.get("/admin/wallets", (req, res) =>
  proxyRequest(req, res, "/api/admin/wallets", {
    transform: (d) => ({
      wallets: (d.wallets ?? d).map((w: any) => {
        const id = w.id;
        const isFrozen = !!w.frozen;
        const isBlocked = blockedWallets.has(id);
        const isFlagged = flaggedWallets.has(id);
        return {
          id,
          user_id: w.userId ?? w.user?.id ?? "",
          user_email: w.user?.email ?? "",
          user_name: w.user?.name ?? "",
          balance: parseFloat(w.balance ?? "0"),
          currency: w.currency ?? "ZAR",
          status: isBlocked ? "blocked" : isFrozen ? "frozen" : "active",
          flagged: isFlagged,
          cardNumber: w.cardNumber ?? "",
          cardType: w.cardType ?? "",
          last_transaction_at: w.lastTransactionAt ?? null,
          created_at: w.createdAt ?? null,
        };
      }),
      pagination: d.pagination ?? { page: 1, limit: 50, total: 0, pages: 1 },
    }),
  }),
);

// Freeze wallet (temporary)
router.patch("/admin/wallets/:id/freeze", (req, res) => {
  const { frozen } = req.body;
  if (!frozen) blockedWallets.delete(req.params.id); // unfreeze also unblocks
  proxyRequest(req, res, `/api/admin/wallets/${req.params.id}/freeze`);
});

// Block wallet (permanent — freeze + mark blocked)
router.patch("/admin/wallets/:id/block", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  blockedWallets.add(req.params.id);
  flaggedWallets.delete(req.params.id);
  proxyRequest(req, res, `/api/admin/wallets/${req.params.id}/freeze`, { body: { frozen: true } });
});

// Unblock wallet
router.patch("/admin/wallets/:id/unblock", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  blockedWallets.delete(req.params.id);
  proxyRequest(req, res, `/api/admin/wallets/${req.params.id}/freeze`, { body: { frozen: false } });
});

// Flag wallet (suspicious)
router.patch("/admin/wallets/:id/flag", (req, res) => {
  flaggedWallets.add(req.params.id);
  res.json({ success: true, flagged: true });
});

// Unflag wallet
router.patch("/admin/wallets/:id/unflag", (req, res) => {
  flaggedWallets.delete(req.params.id);
  res.json({ success: true, flagged: false });
});

router.patch("/admin/wallets/:id/balance", async (req, res) => {
  const check = await requireSuperAdmin(req);
  if (!check.ok) return res.status(check.status).json({ message: check.error });
  proxyRequest(req, res, `/api/admin/wallets/${req.params.id}/balance`);
});

// ─── Payment Links ────────────────────────────────────────────────────────────

router.get("/admin/payment-links", (req, res) =>
  proxyRequest(req, res, "/api/admin/payment-links", {
    transform: (d) => ({
      paymentLinks: (d.paymentLinks ?? d).map((item: any) => {
        const link = item.link ?? item;
        const user = item.user ?? {};
        return {
          id: link.id,
          user_email: user.email ?? "",
          user_name: user.name ?? "",
          amount: parseFloat(link.amount ?? "0"),
          currency: link.currency ?? "ZAR",
          description: link.description ?? "",
          status: link.status ?? "active",
          expiresAt: link.expiresAt ?? null,
          created_at: link.createdAt ?? null,
        };
      }),
      pagination: d.pagination ?? { page: 1, limit: 50, total: 0, pages: 1 },
    }),
  }),
);

router.patch("/admin/payment-links/:id/status", (req, res) =>
  proxyRequest(req, res, `/api/admin/payment-links/${req.params.id}/status`),
);

// ─── Merchants ────────────────────────────────────────────────────────────────

router.get("/admin/merchants", (req, res) =>
  proxyRequest(req, res, "/api/admin/merchants", {
    transform: (d) => ({
      merchants: (d.merchants ?? d).map((item: any) => {
        const m = item.merchant ?? item;
        const u = item.user ?? {};
        return { id: m.id, business_name: m.businessName ?? m.name ?? "", user_email: u.email ?? "", user_name: u.name ?? "", category: m.category ?? "", status: m.status ?? "active", created_at: m.createdAt ?? null };
      }),
      pagination: d.pagination ?? { page: 1, limit: 50, total: 0, pages: 1 },
    }),
  }),
);

// ─── Virtual Cards ────────────────────────────────────────────────────────────

router.get("/admin/virtual-cards", (req, res) =>
  proxyRequest(req, res, "/api/admin/virtual-cards", {
    transform: (d) => ({
      virtualCards: (d.virtualCards ?? d).map((item: any) => {
        const c = item.card ?? item;
        const u = item.user ?? {};
        return { id: c.id, user_email: u.email ?? "", user_name: u.name ?? "", last4: c.last4 ?? c.cardNumber?.slice(-4) ?? "****", brand: c.brand ?? "Visa", balance: parseFloat(c.balance ?? "0"), currency: c.currency ?? "ZAR", status: c.frozen ? "frozen" : "active", created_at: c.createdAt ?? null };
      }),
      pagination: d.pagination ?? { page: 1, limit: 50, total: 0, pages: 1 },
    }),
  }),
);

// ─── Stokvels ─────────────────────────────────────────────────────────────────

router.get("/admin/stokvels", (req, res) =>
  proxyRequest(req, res, "/api/admin/stokvels", {
    transform: (d) => ({ stokvels: d.stokvels ?? d, pagination: d.pagination ?? {} }),
  }),
);

// ─── Claims ───────────────────────────────────────────────────────────────────

router.get("/admin/claims", (req, res) =>
  proxyRequest(req, res, "/api/admin/claims", {
    transform: (d) => ({ claims: d.claims ?? d, pagination: d.pagination ?? {} }),
  }),
);

// ─── Audit logs ───────────────────────────────────────────────────────────────

router.get("/admin/audit-logs", (_req, res) => res.json([]));

export default router;
