import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { signup, login, generateSessionToken, hashPassword } from "./auth";
import { insertWalletCardSchema, insertTransactionSchema, insertContactSchema, insertUserSchema, loginSchema, insertPaymentRequestSchema, insertLoyaltyRewardSchema, insertAutoPaySchema, insertBeneficiarySchema, insertChallengeSchema, insertVirtualCardSchema, insertMerchantSchema, insertMerchantTransactionSchema, insertPropertySchema, insertPropertyUnitSchema, insertTenantSchema, insertRentPaymentSchema, insertGiftCardSchema, insertContributionGroupSchema, insertContributionSchema } from "./shared/schema";
import crypto from "crypto";
import { fromZodError } from "zod-validation-error";
import bcrypt from "bcryptjs";
import { db, pool } from "./db";
import { claimPayments, userSessions } from "./shared/schema";
import { eq, and, gt } from "drizzle-orm";
import PDFDocument from "pdfkit";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";

const sessions = new Map<string, { userId: string; expiresAt: number }>();
const webauthnChallenges = new Map<string, { challenge: string; expiresAt: number }>();

// Load all active sessions from DB into memory (called once at startup)
async function loadSessionsFromDB() {
  try {
    const rows = await db.select().from(userSessions).where(gt(userSessions.expiresAt, new Date()));
    for (const row of rows) {
      sessions.set(row.token, { userId: row.userId, expiresAt: row.expiresAt.getTime() });
    }
    console.log(`[sessions] Loaded ${rows.length} active session(s) from DB`);
  } catch (e: any) {
    console.warn("[sessions] Could not load sessions from DB:", e.message);
  }
}

async function persistSessionToDB(token: string, userId: string, expiresAt: Date) {
  try {
    await db.insert(userSessions).values({ token, userId, expiresAt })
      .onConflictDoUpdate({ target: userSessions.token, set: { userId, expiresAt } });
  } catch (e: any) {
    console.warn("[sessions] Failed to persist session to DB:", e.message);
  }
}

async function deleteSessionFromDB(token: string) {
  try {
    await db.delete(userSessions).where(eq(userSessions.token, token));
  } catch (e: any) {
    console.warn("[sessions] Failed to delete session from DB:", e.message);
  }
}

const rpName = "BukkaPay";
const rpID = process.env.REPL_SLUG ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co` : "localhost";
const origin = process.env.REPL_SLUG ? `https://${rpID}` : "http://localhost:5000";

function getUserIdFromRequest(req: Request): string | null {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    deleteSessionFromDB(token); // fire-and-forget cleanup
    return null;
  }
  
  return session.userId;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Load persisted sessions from DB so they survive backend restarts
  await loadSessionsFromDB();

  // One-time migration trigger endpoint (secret key protected, idempotent)
  app.post("/api/sys/migrate", async (req, res) => {
    const key = req.headers["x-migrate-key"] || req.query.key;
    if (key !== "bukkapay-migrate-2024") return res.status(403).json({ error: "Forbidden" });
    try {
      const { runCoreMigrations } = await import("./migrate");
      await runCoreMigrations();
      res.json({ ok: true, message: "Migration completed successfully" });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Auth Routes
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const validation = insertUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const user = await signup(validation.data);
      
      // Create single default card for new users
      await storage.createWalletCard({
        userId: user.id,
        title: "💳 BukkaPay",
        balance: "0.00",
        currency: "$",
        icon: "credit-card",
        color: "from-blue-900 to-blue-800",
        cardNumber: "4532 **** **** 1234"
      });

      const token = generateSessionToken();
      const exp30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      sessions.set(token, { userId: user.id, expiresAt: exp30d.getTime() });
      persistSessionToDB(token, user.id, exp30d);

      res.status(201).json({
        token,
        user: { id: user.id, walletId: user.walletId, name: user.name, email: user.email, username: user.username, phone: user.phone, countryCode: user.countryCode, loyaltyPoints: user.loyaltyPoints, biometricEnabled: user.biometricEnabled },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const user = await login(validation.data);

      if ((user as any).frozen) {
        return res.status(403).json({ error: "Your account has been suspended. Please contact support." });
      }

      const token = generateSessionToken();
      const exp30d2 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      sessions.set(token, { userId: user.id, expiresAt: exp30d2.getTime() });
      persistSessionToDB(token, user.id, exp30d2);

      res.json({
        token,
        user: { id: user.id, walletId: user.walletId, name: user.name, email: user.email, username: user.username, phone: user.phone, countryCode: user.countryCode, loyaltyPoints: user.loyaltyPoints, biometricEnabled: user.biometricEnabled, verified: user.verified },
      });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) { sessions.delete(token); await deleteSessionFromDB(token); }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Password reset tokens storage (in production, use database with expiration)
  const resetTokens = new Map<string, { email: string; expires: number }>();

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Check if user exists
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists for security, but still return success
        return res.json({ success: true, message: "If an account with that email exists, we've sent reset instructions." });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expires = Date.now() + 3600000; // 1 hour

      // Store token
      resetTokens.set(resetToken, { email, expires });

      // In a real app, you would send an email here
      // For demo purposes, we return the reset link
      const resetLink = `/reset-password?token=${resetToken}`;

      res.json({ 
        success: true, 
        message: "Password reset link sent",
        resetLink // Only for demo - remove in production
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ error: "Token and password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      // Verify token
      const tokenData = resetTokens.get(token);
      if (!tokenData) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      if (Date.now() > tokenData.expires) {
        resetTokens.delete(token);
        return res.status(400).json({ error: "Reset token has expired" });
      }

      // Find user and update password
      const user = await storage.getUserByEmail(tokenData.email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Hash new password and update
      const hashedPassword = await hashPassword(password);
      await storage.updateUserPassword(user.id, hashedPassword);

      // Delete used token
      resetTokens.delete(token);

      res.json({ success: true, message: "Password reset successful" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      storage.getUser(userId).then(user => {
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ id: user.id, walletId: user.walletId, name: user.name, email: user.email, username: user.username, phone: user.phone, countryCode: user.countryCode, loyaltyPoints: user.loyaltyPoints, biometricEnabled: user.biometricEnabled, avatar: user.avatar });
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/auth/profile", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { name, phone, avatar } = req.body;
      if (!name && !phone && !avatar) {
        return res.status(400).json({ error: "At least one field (name, phone, or avatar) is required" });
      }

      const updateData: { name?: string; phone?: string; avatar?: string } = {};
      if (name) updateData.name = name;
      if (phone) updateData.phone = phone;
      if (avatar) updateData.avatar = avatar;

      const updatedUser = await storage.updateUserProfile(userId, updateData);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ 
        id: updatedUser.id, 
        walletId: updatedUser.walletId, 
        name: updatedUser.name, 
        email: updatedUser.email, 
        username: updatedUser.username, 
        phone: updatedUser.phone, 
        countryCode: updatedUser.countryCode, 
        loyaltyPoints: updatedUser.loyaltyPoints, 
        biometricEnabled: updatedUser.biometricEnabled,
        avatar: updatedUser.avatar
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Wallet Cards
  app.get("/api/cards", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const cards = await storage.getWalletCards(userId);
      res.json(cards);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cards/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const card = await storage.getWalletCard(req.params.id, userId);
      if (!card) return res.status(404).json({ error: "Card not found" });
      
      res.json(card);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cards", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertWalletCardSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const card = await storage.createWalletCard({
        userId,
        ...validation.data,
      });
      await storage.createNotification({
        userId,
        type: "success",
        title: "Card Added",
        message: `Your card "${card.name}" has been added successfully`,
        relatedId: card.id,
        relatedType: "card",
      });
      res.status(201).json(card);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/cards/:id/balance", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { balance } = req.body;
      if (!balance) return res.status(400).json({ error: "Balance is required" });

      const updated = await storage.updateWalletCardBalance(req.params.id, userId, balance);
      if (!updated) return res.status(404).json({ error: "Card not found" });
      
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Transactions
  app.get("/api/transactions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const transactions = await storage.getTransactions(userId);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertTransactionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const transaction = await storage.createTransaction({
        userId,
        ...validation.data,
      });

      const isCredit = String(validation.data.type).toLowerCase() === "credit";
      const amount = parseFloat(String(validation.data.amount)).toLocaleString("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 });
      await storage.createNotification({
        userId,
        type: isCredit ? "success" : "info",
        title: isCredit ? "Money Received" : "Payment Sent",
        message: `${validation.data.title} — ${amount}`,
        relatedId: transaction.id,
        relatedType: "transaction",
      });

      res.status(201).json(transaction);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Payment Requests
  app.post("/api/payment-requests", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertPaymentRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const request = await storage.createPaymentRequest({
        userId,
        ...validation.data,
      });
      
      const requester = await storage.getUser(userId);
      res.status(201).json({ ...request, requester });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/payment-requests/:id", async (req, res) => {
    try {
      const request = await storage.getPaymentRequest(req.params.id);
      if (!request) return res.status(404).json({ error: "Payment request not found" });
      
      const requester = await storage.getUser(request.userId);
      res.json({ ...request, requester });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/payment-requests", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const requests = await storage.getPaymentRequestsByUser(userId);
      res.json(requests);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/payment-requests/:id/status", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { status } = req.body;
      if (!status) return res.status(400).json({ error: "Status is required" });

      const updated = await storage.updatePaymentRequestStatus(req.params.id, status);
      if (!updated) return res.status(404).json({ error: "Payment request not found" });
      
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Contacts
  app.get("/api/contacts", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const contacts = await storage.getContacts(userId);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertContactSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const contact = await storage.createContact({
        userId,
        ...validation.data,
      });
      res.status(201).json(contact);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Loyalty
  app.get("/api/loyalty", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const reward = await storage.getLoyaltyReward(userId);
      res.json(reward || { userId, totalPoints: 0, tier: "bronze" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Auto Pay
  app.get("/api/autopays", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const autoPays = await storage.getAutoPays(userId);
      res.json(autoPays);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/autopays", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertAutoPaySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const autoPay = await storage.createAutoPay({
        userId,
        ...validation.data,
      });
      res.status(201).json(autoPay);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Beneficiaries
  app.get("/api/beneficiaries", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const beneficiaries = await storage.getBeneficiaries(userId);
      res.json(beneficiaries);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/beneficiaries", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertBeneficiarySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const beneficiary = await storage.createBeneficiary({
        userId,
        ...validation.data,
      });
      res.status(201).json(beneficiary);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Challenges
  app.get("/api/challenges", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const challenges = await storage.getChallenges(userId);
      res.json(challenges);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/challenges", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertChallengeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const challenge = await storage.createChallenge({
        userId,
        ...validation.data,
      });
      res.status(201).json(challenge);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Virtual Cards
  app.get("/api/virtual-cards", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const cards = await storage.getVirtualCards(userId);
      res.json(cards);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/virtual-cards", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertVirtualCardSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const card = await storage.createVirtualCard({
        userId,
        ...validation.data,
      });
      res.status(201).json(card);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Merchant Routes
  app.get("/api/merchants", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const merchantsList = await storage.getMerchantsByUser(userId);
      res.json(merchantsList);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/merchants/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const merchant = await storage.getMerchant(req.params.id);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });
      if (merchant.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      
      res.json(merchant);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/merchants", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertMerchantSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const qrCode = `BKP-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const paymentLink = `pay-${crypto.randomBytes(6).toString('hex')}`;

      const merchant = await storage.createMerchant({
        userId,
        ...validation.data,
        qrCode,
        paymentLink,
      });

      // Update extended merchant fields (added via ALTER TABLE)
      const { businessLogo, businessEmail, businessPhone, businessAddress, businessRegNumber, vatNumber, website, subscriptionPlan } = validation.data;
      const extras: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (businessLogo) { extras.push(`business_logo = $${idx++}`); vals.push(businessLogo); }
      if (businessEmail) { extras.push(`business_email = $${idx++}`); vals.push(businessEmail); }
      if (businessPhone) { extras.push(`business_phone = $${idx++}`); vals.push(businessPhone); }
      if (businessAddress) { extras.push(`business_address = $${idx++}`); vals.push(businessAddress); }
      if (businessRegNumber) { extras.push(`business_reg_number = $${idx++}`); vals.push(businessRegNumber); }
      if (vatNumber) { extras.push(`vat_number = $${idx++}`); vals.push(vatNumber); }
      if (website) { extras.push(`website = $${idx++}`); vals.push(website); }
      if (subscriptionPlan) { extras.push(`subscription_plan = $${idx++}`); vals.push(subscriptionPlan); }
      if (extras.length > 0) {
        vals.push(merchant.id);
        try { await pool.query(`UPDATE merchants SET ${extras.join(", ")} WHERE id = $${idx}`, vals); } catch (_) {}
      }

      res.status(201).json({ ...merchant, businessLogo, businessEmail, businessPhone, subscriptionPlan: subscriptionPlan || "starter" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/merchants/:id/transactions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const merchant = await storage.getMerchant(req.params.id);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });
      if (merchant.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const txs = await storage.getMerchantTransactions(req.params.id, limit);
      res.json(txs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/merchants/:id/analytics", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const merchant = await storage.getMerchant(req.params.id);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });
      if (merchant.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const allTxs = await storage.getMerchantTransactions(req.params.id);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);

      const todayTxs = allTxs.filter(tx => new Date(tx.createdAt) >= today);
      const weekTxs = allTxs.filter(tx => new Date(tx.createdAt) >= weekAgo);
      const monthTxs = allTxs.filter(tx => new Date(tx.createdAt) >= monthAgo);

      const sumAmount = (txs: any[]) => txs.reduce((s, t) => s + parseFloat(t.amount), 0);
      const avgAmount = (txs: any[]) => txs.length > 0 ? sumAmount(txs) / txs.length : 0;

      const uniqueCustomers = new Set(allTxs.filter(tx => tx.payerId).map(tx => tx.payerId));
      const monthCustomers = new Set(monthTxs.filter(tx => tx.payerId).map(tx => tx.payerId));

      const customerMap: Record<string, { name: string; total: number; count: number }> = {};
      for (const tx of allTxs) {
        const key = tx.payerId || tx.payerName || "anonymous";
        if (!customerMap[key]) customerMap[key] = { name: tx.payerName || "Anonymous", total: 0, count: 0 };
        customerMap[key].total += parseFloat(tx.amount);
        customerMap[key].count += 1;
      }
      const topCustomers = Object.values(customerMap).sort((a, b) => b.total - a.total).slice(0, 5);

      const last30Days: { date: string; amount: number; count: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().split("T")[0];
        const dayTxs = allTxs.filter(tx => new Date(tx.createdAt).toISOString().split("T")[0] === dayStr);
        last30Days.push({ date: dayStr, amount: sumAmount(dayTxs), count: dayTxs.length });
      }

      const last7Days = last30Days.slice(-7);

      const completedTxs = allTxs.filter(tx => tx.status === "completed");
      const pendingTxs = allTxs.filter(tx => tx.status === "pending");
      const failedTxs = allTxs.filter(tx => tx.status === "failed");

      const dailyUsed = sumAmount(todayTxs);
      const dailyLimit = parseFloat(merchant.dailyLimit || "10000");

      const prevMonthStart = new Date(monthAgo); prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
      const prevMonthTxs = allTxs.filter(tx => {
        const d = new Date(tx.createdAt);
        return d >= prevMonthStart && d < monthAgo;
      });
      const monthRevenue = sumAmount(monthTxs);
      const prevMonthRevenue = sumAmount(prevMonthTxs);
      const revenueGrowth = prevMonthRevenue > 0 ? ((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : 0;

      res.json({
        summary: {
          todayRevenue: sumAmount(todayTxs),
          todayCount: todayTxs.length,
          weekRevenue: sumAmount(weekTxs),
          weekCount: weekTxs.length,
          monthRevenue,
          monthCount: monthTxs.length,
          totalRevenue: sumAmount(allTxs),
          totalCount: allTxs.length,
          avgTransaction: avgAmount(allTxs),
          revenueGrowth: Math.round(revenueGrowth * 10) / 10,
        },
        customers: {
          total: uniqueCustomers.size,
          thisMonth: monthCustomers.size,
          topCustomers,
        },
        dailyChart: last7Days,
        monthlyChart: last30Days,
        statusBreakdown: {
          completed: completedTxs.length,
          pending: pendingTxs.length,
          failed: failedTxs.length,
        },
        dailyLimit: {
          limit: dailyLimit,
          used: dailyUsed,
          remaining: Math.max(0, dailyLimit - dailyUsed),
          percentUsed: dailyLimit > 0 ? Math.round((dailyUsed / dailyLimit) * 100) : 0,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/merchants/:id — delete a merchant business (owner only)
  app.delete("/api/merchants/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const merchant = await storage.getMerchant(req.params.id);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });
      if (merchant.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      await storage.deleteMerchant(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/merchants/:id/withdraw — request a payout to bank account
  app.post("/api/merchants/:id/withdraw", async (req, res) => {
    try {
      const userId = (req as any).userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const merchant = await storage.getMerchant(req.params.id);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });
      if (merchant.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const { amount, currency, bankingDetails } = req.body;
      const parsedAmount = parseFloat(amount);
      if (!parsedAmount || parsedAmount <= 0) return res.status(400).json({ error: "Invalid withdrawal amount" });
      if (!bankingDetails?.accountHolder || !bankingDetails?.accountNumber) {
        return res.status(400).json({ error: "Account holder name and account number are required" });
      }

      const currentBalance = parseFloat(merchant.walletBalance || "0");
      if (parsedAmount > currentBalance) {
        return res.status(400).json({ error: `Insufficient balance. Available: ${currentBalance.toFixed(2)}` });
      }

      // Debit the merchant wallet
      const newBalance = (currentBalance - parsedAmount).toFixed(2);
      await storage.updateMerchantBalance(merchant.id, newBalance);

      // Log as a merchant transaction
      await storage.createMerchantTransaction({
        merchantId: merchant.id,
        amount: parsedAmount.toFixed(2),
        type: "withdrawal",
        status: "pending",
        reference: `WD-${Date.now()}`,
      });

      // Send notification to user
      try {
        await storage.createNotification({
          userId,
          title: "Withdrawal Requested",
          message: `Your withdrawal of ${currency || "ZAR"} ${parsedAmount.toFixed(2)} has been submitted and will arrive in 1–3 business days.`,
          type: "transaction",
          read: false,
        });
      } catch {}

      res.json({
        success: true,
        message: "Withdrawal request submitted. Funds will arrive in 1–3 business days.",
        newBalance,
        amount: parsedAmount.toFixed(2),
        currency: currency || "ZAR",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/merchant-pay/:paymentLink", async (req, res) => {
    try {
      const merchant = await storage.getMerchantByPaymentLink(req.params.paymentLink);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });
      
      const owner = await storage.getUser(merchant.userId);
      res.json({ 
        merchantId: merchant.id,
        businessName: merchant.businessName,
        businessType: merchant.businessType,
        qrCode: merchant.qrCode,
        ownerName: owner?.name || "Unknown"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/merchant-pay/:merchantId", async (req, res) => {
    try {
      const { amount, payerName, reference } = req.body;
      if (!amount) return res.status(400).json({ error: "Amount is required" });

      const merchant = await storage.getMerchant(req.params.merchantId);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });

      const userId = getUserIdFromRequest(req);

      const transaction = await storage.createMerchantTransaction({
        merchantId: merchant.id,
        payerId: userId || undefined,
        payerName: payerName || "Anonymous",
        amount: amount.toString(),
        type: "payment",
        status: "completed",
        reference,
      });

      const newBalance = (parseFloat(merchant.walletBalance || "0") + parseFloat(amount)).toFixed(2);
      await storage.updateMerchantBalance(merchant.id, newBalance);

      res.status(201).json({ transaction, newBalance });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // RENTAL PAYMENT SYSTEM ROUTES
  // ============================================

  // Generate tenant ID: TEN-[YYYYMMDD]-[Random4Digits]
  function generateTenantId(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `TEN-${dateStr}-${random}`;
  }

  // Get all properties for landlord
  app.get("/api/rental/properties", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const props = await storage.getPropertiesByLandlord(userId);
      res.json(props);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new property
  app.post("/api/rental/properties", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { merchantId, name, address, propertyType, totalUnits } = req.body;
      if (!merchantId || !name) {
        return res.status(400).json({ error: "Merchant ID and name are required" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant || merchant.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const property = await storage.createProperty({
        merchantId,
        landlordId: userId,
        name,
        address,
        propertyType: propertyType || "apartment",
        totalUnits: totalUnits || 1,
      });

      res.status(201).json(property);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get property details
  app.get("/api/rental/properties/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const property = await storage.getProperty(req.params.id);
      if (!property) return res.status(404).json({ error: "Property not found" });
      if (property.landlordId !== userId) return res.status(403).json({ error: "Forbidden" });

      res.json(property);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get units for a property
  app.get("/api/rental/properties/:id/units", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const property = await storage.getProperty(req.params.id);
      if (!property) return res.status(404).json({ error: "Property not found" });
      if (property.landlordId !== userId) return res.status(403).json({ error: "Forbidden" });

      const units = await storage.getPropertyUnits(req.params.id);
      res.json(units);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a unit in a property
  app.post("/api/rental/properties/:id/units", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const property = await storage.getProperty(req.params.id);
      if (!property) return res.status(404).json({ error: "Property not found" });
      if (property.landlordId !== userId) return res.status(403).json({ error: "Forbidden" });

      const { unitNumber, monthlyRent } = req.body;
      if (!unitNumber || !monthlyRent) {
        return res.status(400).json({ error: "Unit number and monthly rent are required" });
      }

      const unit = await storage.createPropertyUnit({
        propertyId: req.params.id,
        unitNumber,
        monthlyRent: monthlyRent.toString(),
      });

      res.status(201).json(unit);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get all tenants for landlord
  app.get("/api/rental/tenants", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const allTenants = await storage.getTenantsByLandlord(userId);
      res.json(allTenants);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new tenant
  app.post("/api/rental/tenants", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { propertyId, unitId, name, email, phone } = req.body;
      if (!propertyId || !unitId || !name) {
        return res.status(400).json({ error: "Property, unit, and name are required" });
      }

      const property = await storage.getProperty(propertyId);
      if (!property || property.landlordId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const tenantIdCode = generateTenantId();
      const tenant = await storage.createTenant({
        tenantId: tenantIdCode,
        propertyId,
        unitId,
        name,
        email,
        phone,
      });

      await storage.updatePropertyUnit(unitId, { isOccupied: true });

      res.status(201).json(tenant);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get tenant by tenant ID (public lookup)
  app.get("/api/rental/tenant-lookup/:tenantId", async (req, res) => {
    try {
      const tenant = await storage.getTenantByTenantId(req.params.tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });

      const unit = await storage.getPropertyUnit(tenant.unitId);
      const property = await storage.getProperty(tenant.propertyId);

      res.json({
        id: tenant.id,
        tenantId: tenant.tenantId,
        name: tenant.name,
        propertyName: property?.name,
        unitNumber: unit?.unitNumber,
        monthlyRent: unit?.monthlyRent,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get landlord dashboard data
  app.get("/api/rental/dashboard", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const props = await storage.getPropertiesByLandlord(userId);
      const allTenants = await storage.getTenantsByLandlord(userId);
      
      let totalIncome = 0;
      const tenantDetails = [];
      const currentMonth = new Date().toISOString().slice(0, 7);

      for (const tenant of allTenants) {
        const unit = await storage.getPropertyUnit(tenant.unitId);
        const property = await storage.getProperty(tenant.propertyId);
        const payments = await storage.getRentPaymentsForMonth(tenant.id, currentMonth);
        
        const monthlyRent = parseFloat(unit?.monthlyRent || "0");
        const amountPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        
        let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
        if (amountPaid >= monthlyRent) status = 'paid';
        else if (amountPaid > 0) status = 'partial';

        tenantDetails.push({
          id: tenant.id,
          tenantId: tenant.tenantId,
          name: tenant.name,
          email: tenant.email,
          phone: tenant.phone,
          propertyId: tenant.propertyId,
          propertyName: property?.name,
          unitId: tenant.unitId,
          unitNumber: unit?.unitNumber,
          monthlyRent,
          amountPaid,
          status,
        });
      }

      // Calculate total income from all rent payments
      for (const prop of props) {
        const payments = await storage.getRentPaymentsByProperty(prop.id);
        totalIncome += payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      }

      const unpaidCount = tenantDetails.filter(t => t.status === 'unpaid').length;
      const partialCount = tenantDetails.filter(t => t.status === 'partial').length;
      const paidCount = tenantDetails.filter(t => t.status === 'paid').length;

      res.json({
        totalProperties: props.length,
        totalTenants: allTenants.length,
        totalIncome,
        unpaidCount,
        partialCount,
        paidCount,
        properties: props,
        tenants: tenantDetails,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get rent payments for a property
  app.get("/api/rental/properties/:id/payments", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const property = await storage.getProperty(req.params.id);
      if (!property || property.landlordId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const payments = await storage.getRentPaymentsByProperty(req.params.id);
      
      const paymentDetails = await Promise.all(payments.map(async (p) => {
        const tenant = await storage.getTenant(p.tenantId);
        const unit = await storage.getPropertyUnit(p.unitId);
        return {
          ...p,
          tenantName: tenant?.name,
          tenantIdCode: tenant?.tenantId,
          unitNumber: unit?.unitNumber,
        };
      }));

      res.json(paymentDetails);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Make a rent payment (for tenants)
  app.post("/api/rental/pay", async (req, res) => {
    try {
      const { tenantId, amount, paymentMethod, reference } = req.body;
      if (!tenantId || !amount) {
        return res.status(400).json({ error: "Tenant ID and amount are required" });
      }

      const tenant = await storage.getTenantByTenantId(tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });

      const property = await storage.getProperty(tenant.propertyId);
      if (!property) return res.status(404).json({ error: "Property not found" });

      const currentMonth = new Date().toISOString().slice(0, 7);

      const payment = await storage.createRentPayment({
        tenantId: tenant.id,
        propertyId: tenant.propertyId,
        unitId: tenant.unitId,
        merchantId: property.merchantId,
        amount: amount.toString(),
        rentMonth: currentMonth,
        paymentMethod: paymentMethod || "wallet",
        status: "completed",
        reference,
      });

      const merchant = await storage.getMerchant(property.merchantId);
      if (merchant) {
        const newBalance = (parseFloat(merchant.walletBalance || "0") + parseFloat(amount)).toFixed(2);
        await storage.updateMerchantBalance(merchant.id, newBalance);
      }

      res.status(201).json(payment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get tenant dashboard (for tenant view)
  app.get("/api/rental/tenant-dashboard", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const tenant = await storage.getTenantByUserId(userId);
      if (!tenant) return res.status(404).json({ error: "Tenant profile not found" });

      const unit = await storage.getPropertyUnit(tenant.unitId);
      const property = await storage.getProperty(tenant.propertyId);
      const currentMonth = new Date().toISOString().slice(0, 7);
      const payments = await storage.getRentPaymentsForMonth(tenant.id, currentMonth);
      const allPayments = await storage.getRentPayments(tenant.id);

      const monthlyRent = parseFloat(unit?.monthlyRent || "0");
      const amountPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      
      let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
      if (amountPaid >= monthlyRent) status = 'paid';
      else if (amountPaid > 0) status = 'partial';

      res.json({
        id: tenant.id,
        tenantId: tenant.tenantId,
        name: tenant.name,
        propertyName: property?.name,
        unitNumber: unit?.unitNumber,
        monthlyRent,
        amountPaid,
        amountDue: Math.max(0, monthlyRent - amountPaid),
        status,
        dueDate: `${currentMonth}-01`,
        paymentHistory: allPayments,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Link tenant to user account
  app.post("/api/rental/link-tenant", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ error: "Tenant ID is required" });

      const tenant = await storage.getTenantByTenantId(tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });

      if (tenant.userId) {
        return res.status(400).json({ error: "Tenant already linked to an account" });
      }

      const updated = await storage.updateTenant(tenant.id, { userId });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create rent payment link (landlord sends to tenant)
  app.post("/api/rental/payment-links", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { tenantId, amount, rentMonth } = req.body;
      if (!tenantId || !amount) {
        return res.status(400).json({ error: "Tenant ID and amount are required" });
      }
      
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });

      const property = await storage.getProperty(tenant.propertyId);
      if (!property || property.landlordId !== userId) {
        return res.status(403).json({ error: "Not authorized to create payment link for this tenant" });
      }

      const linkCode = `RPL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const currentMonth = rentMonth || new Date().toISOString().slice(0, 7);

      const paymentLink = await storage.createRentPaymentLink({
        linkCode,
        tenantId,
        merchantId: property.merchantId,
        amount: amount.toString(),
        rentMonth: currentMonth,
        status: "pending",
      });

      res.status(201).json({
        ...paymentLink,
        shareableLink: `/pay-rent/${linkCode}`,
        tenantName: tenant.name,
        propertyName: property.name,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get payment link details (PUBLIC - no auth required for viewing)
  app.get("/api/rental/payment-links/:linkCode", async (req, res) => {
    try {
      const paymentLink = await storage.getRentPaymentLinkByCode(req.params.linkCode);
      if (!paymentLink) {
        return res.status(404).json({ error: "Payment link not found or expired" });
      }

      if (paymentLink.status === "paid") {
        return res.status(400).json({ error: "This payment link has already been used" });
      }

      const tenant = await storage.getTenant(paymentLink.tenantId);
      const property = tenant ? await storage.getProperty(tenant.propertyId) : null;
      const unit = tenant ? await storage.getPropertyUnit(tenant.unitId) : null;
      const merchant = await storage.getMerchant(paymentLink.merchantId);

      res.json({
        ...paymentLink,
        tenantName: tenant?.name,
        tenantEmail: tenant?.email,
        propertyName: property?.name,
        propertyAddress: property?.address,
        unitNumber: unit?.unitNumber,
        landlordBusinessName: merchant?.businessName,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Pay rent via payment link
  app.post("/api/rental/payment-links/:linkCode/pay", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Please login or create an account to pay" });

      const paymentLink = await storage.getRentPaymentLinkByCode(req.params.linkCode);
      if (!paymentLink) {
        return res.status(404).json({ error: "Payment link not found" });
      }

      if (paymentLink.status === "paid") {
        return res.status(400).json({ error: "This payment link has already been paid" });
      }

      const tenant = await storage.getTenant(paymentLink.tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });

      const property = await storage.getProperty(tenant.propertyId);
      if (!property) return res.status(404).json({ error: "Property not found" });

      // Get user's primary card for payment
      const cards = await storage.getCardsByUserId(userId);
      if (!cards || cards.length === 0) {
        return res.status(400).json({ error: "No wallet card found. Please add a card first." });
      }

      const primaryCard = cards[0];
      const cardBalance = parseFloat(primaryCard.balance || "0");
      const paymentAmount = parseFloat(paymentLink.amount);

      if (cardBalance < paymentAmount) {
        return res.status(400).json({ error: "Insufficient funds in your wallet" });
      }

      // Deduct from user's wallet
      const newCardBalance = (cardBalance - paymentAmount).toFixed(2);
      await storage.updateCardBalance(primaryCard.id, newCardBalance);

      // Create transaction record for payer
      await storage.createTransaction({
        userId,
        cardId: primaryCard.id,
        title: `Rent Payment - ${property.name}`,
        category: "Rent",
        amount: (-paymentAmount).toString(),
        type: "rent_payment",
        icon: "home",
      });

      // Create rent payment record
      const rentPayment = await storage.createRentPayment({
        tenantId: tenant.id,
        propertyId: tenant.propertyId,
        unitId: tenant.unitId,
        merchantId: property.merchantId,
        amount: paymentLink.amount,
        rentMonth: paymentLink.rentMonth,
        paymentMethod: "wallet",
        status: "completed",
        reference: `LINK-${paymentLink.linkCode}`,
      });

      // Credit landlord's merchant wallet
      const merchant = await storage.getMerchant(property.merchantId);
      if (merchant) {
        const newMerchantBalance = (parseFloat(merchant.walletBalance || "0") + paymentAmount).toFixed(2);
        await storage.updateMerchantBalance(merchant.id, newMerchantBalance);
      }

      // Mark payment link as paid
      await storage.updateRentPaymentLink(paymentLink.id, { status: "paid" });

      // Link tenant to user if not already linked
      if (!tenant.userId) {
        await storage.updateTenant(tenant.id, { userId });
      }

      res.json({
        success: true,
        message: "Rent payment successful!",
        payment: rentPayment,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // WebAuthn Routes
  
  // Generate registration options (for registering a new biometric credential)
  app.post("/api/webauthn/register/options", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const existingCredentials = await storage.getWebauthnCredentialsByUserId(userId);
      
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: new TextEncoder().encode(userId),
        userName: user.email,
        userDisplayName: user.name,
        attestationType: "none",
        excludeCredentials: existingCredentials.map(cred => ({
          id: cred.credentialId,
          transports: cred.transports ? (cred.transports.split(",") as any) : undefined,
        })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
          authenticatorAttachment: "platform",
        },
      });

      // Store challenge for verification
      webauthnChallenges.set(userId, {
        challenge: options.challenge,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      res.json(options);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Verify registration response
  app.post("/api/webauthn/register/verify", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const challengeData = webauthnChallenges.get(userId);
      if (!challengeData || challengeData.expiresAt < Date.now()) {
        webauthnChallenges.delete(userId);
        return res.status(400).json({ error: "Challenge expired or not found" });
      }

      const response = req.body as RegistrationResponseJSON;
      
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ error: "Verification failed" });
      }

      const { credential, credentialDeviceType } = verification.registrationInfo;
      
      // Store credential
      await storage.createWebauthnCredential({
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64"),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        transports: response.response.transports?.join(","),
      });

      // Enable biometric for user
      await storage.updateUserBiometricEnabled(userId, true);

      webauthnChallenges.delete(userId);
      res.json({ success: true, message: "Biometric credential registered successfully" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Generate authentication options (for logging in with biometrics)
  app.post("/api/webauthn/authenticate/options", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ error: "User not found" });

      const credentials = await storage.getWebauthnCredentialsByUserId(user.id);
      if (credentials.length === 0) {
        return res.status(400).json({ error: "No biometric credentials found. Please set up biometrics first." });
      }

      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "preferred",
        allowCredentials: credentials.map(cred => ({
          id: cred.credentialId,
          transports: cred.transports ? (cred.transports.split(",") as any) : undefined,
        })),
      });

      // Store challenge for verification
      webauthnChallenges.set(user.id, {
        challenge: options.challenge,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      res.json({ options, userId: user.id });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Verify authentication response
  app.post("/api/webauthn/authenticate/verify", async (req, res) => {
    try {
      const { response: authResponse, userId } = req.body as { response: AuthenticationResponseJSON; userId: string };
      
      if (!userId) return res.status(400).json({ error: "User ID is required" });

      const challengeData = webauthnChallenges.get(userId);
      if (!challengeData || challengeData.expiresAt < Date.now()) {
        webauthnChallenges.delete(userId);
        return res.status(400).json({ error: "Challenge expired or not found" });
      }

      const credential = await storage.getWebauthnCredentialByCredentialId(authResponse.id);
      if (!credential || credential.userId !== userId) {
        return res.status(400).json({ error: "Credential not found" });
      }

      const verification = await verifyAuthenticationResponse({
        response: authResponse,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: credential.credentialId,
          publicKey: Buffer.from(credential.publicKey, "base64"),
          counter: credential.counter,
        },
      });

      if (!verification.verified) {
        return res.status(400).json({ error: "Verification failed" });
      }

      // Update credential counter
      await storage.updateWebauthnCredentialCounter(credential.id, verification.authenticationInfo.newCounter);

      // Create session
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const token = generateSessionToken();
      const exp24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
      sessions.set(token, { userId, expiresAt: exp24h.getTime() });
      persistSessionToDB(token, userId, exp24h);

      webauthnChallenges.delete(userId);
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          walletId: user.walletId,
          phone: user.phone,
          countryCode: user.countryCode,
          loyaltyPoints: user.loyaltyPoints,
          biometricEnabled: user.biometricEnabled,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get user's WebAuthn credentials
  app.get("/api/webauthn/credentials", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const credentials = await storage.getWebauthnCredentialsByUserId(userId);
      res.json(credentials.map(c => ({
        id: c.id,
        deviceType: c.deviceType,
        createdAt: c.createdAt,
      })));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete a WebAuthn credential
  app.delete("/api/webauthn/credentials/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      await storage.deleteWebauthnCredential(req.params.id);
      
      // Check if user still has credentials
      const remaining = await storage.getWebauthnCredentialsByUserId(userId);
      if (remaining.length === 0) {
        await storage.updateUserBiometricEnabled(userId, false);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Disable all WebAuthn credentials (turn off biometrics)
  app.post("/api/webauthn/disable", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      // Delete all credentials for this user
      const credentials = await storage.getWebauthnCredentialsByUserId(userId);
      for (const credential of credentials) {
        await storage.deleteWebauthnCredential(credential.id);
      }

      // Update user's biometric status
      await storage.updateUserBiometricEnabled(userId, false);

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Gift Cards Routes
  app.get("/api/gift-cards", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const sentCards = await storage.getGiftCardsBySender(userId);
      const receivedCards = await storage.getReceivedGiftCards(userId);
      
      res.json({ sent: sentCards, received: receivedCards });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/gift-cards", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertGiftCardSchema.safeParse({ ...req.body, senderId: userId });
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const code = `GC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const giftCard = await storage.createGiftCard({
        ...validation.data,
        code,
        expiresAt,
      });

      res.status(201).json(giftCard);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/gift-cards/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const giftCard = await storage.getGiftCard(req.params.id);
      if (!giftCard) {
        return res.status(404).json({ error: "Gift card not found" });
      }

      res.json(giftCard);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/gift-cards/code/:code", async (req, res) => {
    try {
      const giftCard = await storage.getGiftCardByCode(req.params.code);
      if (!giftCard) {
        return res.status(404).json({ error: "Gift card not found" });
      }

      res.json(giftCard);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/gift-cards/:id/redeem", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const giftCard = await storage.getGiftCard(req.params.id);
      if (!giftCard) {
        return res.status(404).json({ error: "Gift card not found" });
      }

      if (giftCard.status === "redeemed") {
        return res.status(400).json({ error: "Gift card already redeemed" });
      }

      if (giftCard.expiresAt && new Date(giftCard.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Gift card has expired" });
      }

      const cards = await storage.getWalletCards(userId);
      if (cards.length === 0) {
        return res.status(400).json({ error: "No wallet card found" });
      }

      const primaryCard = cards[0];
      const newBalance = (parseFloat(primaryCard.balance) + parseFloat(giftCard.amount)).toFixed(2);
      await storage.updateWalletCardBalance(primaryCard.id, userId, newBalance);

      const updatedGiftCard = await storage.updateGiftCardStatus(giftCard.id, "redeemed", userId);

      await storage.createTransaction({
        userId,
        cardId: primaryCard.id,
        title: `Gift Card Redeemed`,
        category: "gift",
        amount: giftCard.amount,
        type: "credit",
        icon: "gift",
      });

      res.json(updatedGiftCard);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Contribution Groups Routes
  app.get("/api/contributions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const groups = await storage.getContributionGroupsByCreator(userId);
      res.json(groups);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/contributions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const validation = insertContributionGroupSchema.safeParse({ ...req.body, creatorId: userId });
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const shareCode = `CON-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      
      const group = await storage.createContributionGroup({
        ...validation.data,
        shareCode,
      });

      res.status(201).json(group);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/contributions/:id", async (req, res) => {
    try {
      const group = await storage.getContributionGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Contribution group not found" });
      }

      const contributionsList = await storage.getContributionsByGroup(group.id);
      res.json({ group, contributions: contributionsList });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/contributions/code/:code", async (req, res) => {
    try {
      const group = await storage.getContributionGroupByShareCode(req.params.code);
      if (!group) {
        return res.status(404).json({ error: "Contribution group not found" });
      }

      const contributionsList = await storage.getContributionsByGroup(group.id);
      res.json({ group, contributions: contributionsList });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/contributions/:id/contribute", async (req, res) => {
    try {
      const group = await storage.getContributionGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Contribution group not found" });
      }

      if (!group.isActive) {
        return res.status(400).json({ error: "This contribution group is no longer active" });
      }

      const userId = getUserIdFromRequest(req);
      
      const validation = insertContributionSchema.safeParse({ 
        ...req.body, 
        groupId: group.id,
        contributorId: userId || null,
      });
      
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error as any).message });
      }

      const contribution = await storage.createContribution(validation.data);
      
      const newAmount = (parseFloat(group.currentAmount) + parseFloat(contribution.amount)).toFixed(2);
      await storage.updateContributionGroupAmount(group.id, newAmount);

      res.status(201).json(contribution);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bill Split Routes
  app.get("/api/bill-splits", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const billSplits = await storage.getBillSplitsByUser(userId);
      res.json(billSplits);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/bill-splits", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { title, totalAmount, participants } = req.body;
      
      if (!title || !totalAmount) {
        return res.status(400).json({ error: "Title and total amount are required" });
      }

      const billSplit = await storage.createBillSplit({
        creatorId: userId,
        title,
        totalAmount: totalAmount.toString(),
        participants: participants || [],
      });

      res.status(201).json(billSplit);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/bill-splits/:id", async (req, res) => {
    try {
      const billSplit = await storage.getBillSplit(req.params.id);
      if (!billSplit) {
        return res.status(404).json({ error: "Bill split not found" });
      }
      res.json(billSplit);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/bill-splits/:id/participants", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const billSplit = await storage.getBillSplit(req.params.id);
      if (!billSplit) {
        return res.status(404).json({ error: "Bill split not found" });
      }

      if (billSplit.creatorId !== userId) {
        return res.status(403).json({ error: "Not authorized to update this bill" });
      }

      const { participants } = req.body;
      const updated = await storage.updateBillSplitParticipants(req.params.id, participants);
      
      // Check if all participants have paid
      const allPaid = participants.every((p: any) => p.paid);
      if (allPaid) {
        await storage.updateBillSplitStatus(req.params.id, "completed");
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/bill-splits/:id/status", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const billSplit = await storage.getBillSplit(req.params.id);
      if (!billSplit) {
        return res.status(404).json({ error: "Bill split not found" });
      }

      if (billSplit.creatorId !== userId) {
        return res.status(403).json({ error: "Not authorized to update this bill" });
      }

      const { status } = req.body;
      const updated = await storage.updateBillSplitStatus(req.params.id, status);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==========================================
  // Purchase Transactions Routes (Purchases Hub)
  // ==========================================

  // GET /api/transactions - Get user's purchase transactions with optional filters
  app.get("/api/transactions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { category, status, start_date, end_date, limit, offset } = req.query;

      const filters: {
        category?: string;
        status?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
      } = {};

      if (category && typeof category === "string") filters.category = category;
      if (status && typeof status === "string") filters.status = status;
      if (start_date && typeof start_date === "string") filters.startDate = new Date(start_date);
      if (end_date && typeof end_date === "string") filters.endDate = new Date(end_date);
      if (limit) filters.limit = parseInt(limit as string, 10);
      if (offset) filters.offset = parseInt(offset as string, 10);

      const transactions = await storage.getPurchaseTransactionsByUser(userId, filters);
      res.json(transactions);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // GET /api/transactions/:id - Get single transaction detail
  app.get("/api/transactions/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const transaction = await storage.getPurchaseTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Ensure user can only access their own transactions
      if (transaction.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(transaction);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/transactions - Create a new purchase transaction (internal use)
  app.post("/api/transactions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { category, merchantName, amount, currency, status, metadata } = req.body;

      if (!category || !merchantName || !amount) {
        return res.status(400).json({ error: "Missing required fields: category, merchantName, amount" });
      }

      const reference = `TXN-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

      const transaction = await storage.createPurchaseTransaction({
        userId,
        category,
        merchantName,
        amount: String(amount),
        currency: currency || "USD",
        status: status || "success",
        reference,
        metadata: metadata || null,
      });

      res.status(201).json(transaction);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ─── Payment Links + Invoicing ───────────────────────────────────────────────

  // POST /api/payment-links - Create a payment link
  app.post("/api/payment-links", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { amount, currency, description, allowPartialPayment, minimumPayment, type, region, subRegion, destination, bankDetails, invoice, businessName, businessLogo } = req.body;

      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }

      const amountStr = String(parseFloat(amount).toFixed(2));
      const link = await storage.createPaymentLink({
        senderId: userId,
        amount: amountStr,
        currency: currency || "ZAR",
        description: description || null,
        allowPartialPayment: !!allowPartialPayment,
        minimumPayment: minimumPayment ? String(parseFloat(minimumPayment).toFixed(2)) : null,
        type: type || "personal",
        region: region || "local",
        subRegion: subRegion || null,
        destination: destination || "wallet",
        bankDetails: bankDetails || null,
        businessName: businessName || null,
        businessLogo: businessLogo || null,
        remainingBalance: amountStr,
      });

      let createdInvoice = null;
      if (invoice && invoice.customerName) {
        const items = (invoice.items || []).map((item: any) => ({
          name: item.name,
          quantity: Number(item.quantity) || 1,
          unitPrice: parseFloat(item.unitPrice) || 0,
          total: (Number(item.quantity) || 1) * (parseFloat(item.unitPrice) || 0),
        }));
        const total = items.reduce((sum: number, i: any) => sum + i.total, 0);
        createdInvoice = await storage.createInvoice({
          paymentLinkId: link.id,
          customerName: invoice.customerName,
          customerEmail: invoice.customerEmail || null,
          customerPhone: invoice.customerPhone || null,
          items,
          totalAmount: String(total.toFixed(2)),
          type: invoice.type || "invoice",
          dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
          notes: invoice.notes || null,
          attachment: invoice.attachment || null,
        } as any);
      }

      const paymentUrl = `https://app.bukkapay.com/pay/${link.id}`;
      res.status(201).json({ ...link, invoice: createdInvoice, paymentUrl });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // GET /api/payment-links - Get user's payment links (created + received)
  app.get("/api/payment-links", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const [created, received] = await Promise.all([
        storage.getPaymentLinksByUser(userId),
        storage.getSavedPaymentLinks(userId),
      ]);
      const normalize = (l: any, direction: string) => ({
        ...l,
        direction,
        paymentUrl: `https://app.bukkapay.com/pay/${l.id}`,
      });
      res.json([
        ...created.map((l: any) => normalize(l, "sent")),
        ...received.map((l: any) => normalize(l, "received")),
      ]);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/payment-links/:linkId/save - Save a received payment link to inbox
  app.post("/api/payment-links/:linkId/save", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const link = await storage.getPaymentLink(req.params.linkId);
      if (!link) return res.status(404).json({ error: "Payment link not found" });
      await storage.savePaymentLink(userId, link.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // DELETE /api/payment-links/:linkId/save - Remove a saved link from inbox
  app.delete("/api/payment-links/:linkId/save", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await storage.removeSavedPaymentLink(userId, req.params.linkId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // DELETE /api/payment-links/:linkId - Delete a payment link (sender only)
  app.delete("/api/payment-links/:linkId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const link = await storage.getPaymentLink(req.params.linkId);
      if (!link) return res.status(404).json({ error: "Payment link not found" });
      if (link.senderId !== userId) return res.status(403).json({ error: "You can only delete your own payment links" });
      await storage.deletePaymentLink(req.params.linkId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // GET /api/payment-links/:linkId - Get payment link details (public)
  app.get("/api/payment-links/:linkId", async (req, res) => {
    try {
      const link = await storage.getPaymentLink(req.params.linkId);
      if (!link) return res.status(404).json({ error: "Payment link not found" });

      const invoice = await storage.getInvoiceByPaymentLink(link.id);
      const payments = await storage.getInvoicePaymentsByLink(link.id);
      const sender = await storage.getUser(link.senderId);

      res.json({
        ...link,
        invoice,
        payments,
        senderName: sender?.name || "BukkaPay User",
        paymentUrl: `https://app.bukkapay.com/pay/${link.id}`,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/payment-links/:linkId/pay-wallet - Pay with BukkaPay wallet
  app.post("/api/payment-links/:linkId/pay-wallet", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const link = await storage.getPaymentLink(req.params.linkId);
      if (!link) return res.status(404).json({ error: "Payment link not found" });
      if (link.status === "paid") return res.status(400).json({ error: "This payment link has already been fully paid" });

      const { amount } = req.body;
      const payAmount = parseFloat(amount || link.remainingBalance);
      const remaining = parseFloat(link.remainingBalance);

      if (isNaN(payAmount) || payAmount <= 0) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }
      if (payAmount > remaining + 0.01) {
        return res.status(400).json({ error: "Amount exceeds remaining balance" });
      }
      if (link.allowPartialPayment && link.minimumPayment) {
        const minPay = parseFloat(link.minimumPayment);
        if (payAmount < minPay - 0.01) {
          return res.status(400).json({ error: `Minimum payment is ${link.currency} ${link.minimumPayment}` });
        }
      }

      // Deduct from payer's wallet card
      const payerCards = await storage.getCardsByUserId(userId);
      if (!payerCards.length) return res.status(400).json({ error: "No wallet card found" });

      const payerCard = payerCards[0];
      const payerBalance = parseFloat(payerCard.balance);
      if (payerBalance < payAmount) {
        return res.status(400).json({ error: "Insufficient wallet balance" });
      }

      // Update payer balance
      await storage.updateCardBalance(payerCard.id, String((payerBalance - payAmount).toFixed(2)));

      // If destination is wallet, credit sender
      if (link.destination === "wallet") {
        const senderCards = await storage.getCardsByUserId(link.senderId);
        if (senderCards.length) {
          const senderBalance = parseFloat(senderCards[0].balance);
          await storage.updateCardBalance(senderCards[0].id, String((senderBalance + payAmount).toFixed(2)));
        }
      }

      // Record the payment
      const reference = `PAY-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const payer = await storage.getUser(userId);
      await storage.createInvoicePayment({
        paymentLinkId: link.id,
        amount: String(payAmount.toFixed(2)),
        currency: link.currency,
        method: "wallet",
        payerName: payer?.name || null,
        payerEmail: payer?.email || null,
        payerUserId: userId,
        reference,
        gateway: null,
        gatewayRef: null,
      });

      // Update link amounts
      const newAmountPaid = parseFloat(link.amountPaid) + payAmount;
      const newRemaining = parseFloat(link.amount) - newAmountPaid;
      const newStatus = newRemaining <= 0.01 ? "paid" : "partial";
      await storage.updatePaymentLink(link.id, {
        amountPaid: String(newAmountPaid.toFixed(2)),
        remainingBalance: String(Math.max(0, newRemaining).toFixed(2)),
        status: newStatus,
      });

      // Create wallet transaction record
      await storage.createTransaction({
        userId,
        title: `Payment to ${payer?.name || "Recipient"}`,
        category: "payment",
        amount: String(payAmount.toFixed(2)),
        type: "debit",
        icon: "link",
      });

      res.json({ success: true, amountPaid: newAmountPaid.toFixed(2), remaining: Math.max(0, newRemaining).toFixed(2), status: newStatus });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/payment-links/:linkId/pay-card/initialize - Initialize Paystack card payment
  app.post("/api/payment-links/:linkId/pay-card/initialize", async (req, res) => {
    try {
      const link = await storage.getPaymentLink(req.params.linkId);
      if (!link) return res.status(404).json({ error: "Payment link not found" });
      if (link.status === "paid") return res.status(400).json({ error: "This payment link has already been fully paid" });

      const { email, amount, payerName } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required for card payment" });

      const payAmount = parseFloat(amount || link.remainingBalance);
      const remaining = parseFloat(link.remainingBalance);
      if (isNaN(payAmount) || payAmount <= 0 || payAmount > remaining + 0.01) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }

      const paystackKey = process.env.PAYSTACK_SECRET_KEY;
      if (!paystackKey) {
        return res.status(503).json({ error: "Card payment not configured. Please contact the business." });
      }

      const reference = `PAY-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const amountKobo = Math.round(payAmount * 100);

      const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          amount: amountKobo,
          currency: link.currency === "ZAR" ? "ZAR" : link.currency,
          reference,
          metadata: { paymentLinkId: link.id, payerName: payerName || email },
        }),
      });

      const paystackData: any = await paystackRes.json();
      if (!paystackData.status) return res.status(400).json({ error: paystackData.message || "Payment initialization failed" });

      // Pre-create invoice payment record as pending
      await storage.createInvoicePayment({
        paymentLinkId: link.id,
        amount: String(payAmount.toFixed(2)),
        currency: link.currency,
        method: "card",
        payerName: payerName || null,
        payerEmail: email,
        payerUserId: null,
        reference,
        gateway: "paystack",
        gatewayRef: null,
      });

      res.json({ authorizationUrl: paystackData.data.authorization_url, reference });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/payments/webhook/paystack - Paystack webhook
  app.post("/api/payments/webhook/paystack", async (req, res) => {
    try {
      const paystackKey = process.env.PAYSTACK_SECRET_KEY;
      if (paystackKey) {
        const hash = crypto.createHmac("sha512", paystackKey).update(JSON.stringify(req.body)).digest("hex");
        if (hash !== req.headers["x-paystack-signature"]) {
          return res.status(400).json({ error: "Invalid signature" });
        }
      }

      const { event, data } = req.body;
      if (event === "charge.success") {
        const reference = data.reference;
        const existingPayment = await storage.getInvoicePaymentByReference(reference);
        if (!existingPayment || existingPayment.status === "completed") {
          return res.json({ received: true });
        }

        await storage.updateInvoicePayment(existingPayment.id, { status: "completed", gatewayRef: data.id?.toString() });

        const link = await storage.getPaymentLink(existingPayment.paymentLinkId);
        if (link) {
          const newAmountPaid = parseFloat(link.amountPaid) + parseFloat(existingPayment.amount);
          const newRemaining = parseFloat(link.amount) - newAmountPaid;
          const newStatus = newRemaining <= 0.01 ? "paid" : "partial";
          await storage.updatePaymentLink(link.id, {
            amountPaid: String(newAmountPaid.toFixed(2)),
            remainingBalance: String(Math.max(0, newRemaining).toFixed(2)),
            status: newStatus,
          });

          // Credit sender's wallet if destination is wallet
          if (link.destination === "wallet") {
            const senderCards = await storage.getCardsByUserId(link.senderId);
            if (senderCards.length) {
              const payAmount = parseFloat(existingPayment.amount);
              const senderBalance = parseFloat(senderCards[0].balance);
              await storage.updateCardBalance(senderCards[0].id, String((senderBalance + payAmount).toFixed(2)));
            }
          }
        }
      }

      res.json({ received: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // GET /api/payment-links/:linkId/invoice/pdf - Download invoice as PDF
  app.get("/api/payment-links/:linkId/invoice/pdf", async (req, res) => {
    try {
      const link = await storage.getPaymentLink(req.params.linkId);
      if (!link) return res.status(404).json({ error: "Payment link not found" });

      const invoice = await storage.getInvoiceByPaymentLink(link.id);
      const sender = await storage.getUser(link.senderId);
      const payments = await storage.getInvoicePaymentsByLink(link.id);

      const doc = new PDFDocument({ margin: 50 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="invoice-${link.id.slice(0, 8)}.pdf"`);
      doc.pipe(res);

      const PRIMARY = "#7C3AED";
      doc.rect(0, 0, doc.page.width, 80).fill(PRIMARY);
      doc.fillColor("#FFFFFF").fontSize(24).font("Helvetica-Bold").text("BukkaPay", 50, 25);
      doc.fontSize(10).font("Helvetica").text(invoice?.type?.toUpperCase() || "PAYMENT RECEIPT", 50, 55);

      doc.fillColor("#1A1A2E").fontSize(11).font("Helvetica-Bold");
      doc.text(`Document #: ${link.id.slice(0, 8).toUpperCase()}`, 50, 110);
      doc.text(`Date: ${new Date(link.createdAt).toLocaleDateString()}`, 50, 128);
      if (invoice?.dueDate) {
        doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 50, 146);
      }
      doc.text(`Status: ${link.status.toUpperCase()}`, 50, 164);

      doc.font("Helvetica-Bold").text("From:", 350, 110);
      doc.font("Helvetica").text(sender?.name || "BukkaPay User", 350, 128);
      if (sender?.email) doc.text(sender.email, 350, 146);

      if (invoice) {
        doc.font("Helvetica-Bold").text("Bill To:", 50, 210);
        doc.font("Helvetica").text(invoice.customerName, 50, 228);
        if (invoice.customerEmail) doc.text(invoice.customerEmail, 50, 246);
        if (invoice.customerPhone) doc.text(invoice.customerPhone, 50, 264);
      }

      if (invoice && Array.isArray(invoice.items) && invoice.items.length > 0) {
        let y = 310;
        doc.rect(50, y, doc.page.width - 100, 22).fill("#F3F0FF");
        doc.fillColor("#1A1A2E").font("Helvetica-Bold").fontSize(10);
        doc.text("Item", 60, y + 6);
        doc.text("Qty", 280, y + 6);
        doc.text("Unit Price", 340, y + 6);
        doc.text("Total", 450, y + 6);
        y += 28;

        for (const item of invoice.items as any[]) {
          doc.font("Helvetica").fillColor("#374151");
          doc.text(item.name || "", 60, y, { width: 200 });
          doc.text(String(item.quantity || 1), 280, y);
          doc.text(`${link.currency} ${parseFloat(item.unitPrice || 0).toFixed(2)}`, 340, y);
          doc.text(`${link.currency} ${parseFloat(item.total || 0).toFixed(2)}`, 450, y);
          y += 20;
          doc.moveTo(50, y - 2).lineTo(doc.page.width - 50, y - 2).strokeColor("#E5E7EB").stroke();
        }

        y += 10;
        doc.font("Helvetica-Bold").fillColor("#1A1A2E");
        doc.text("Total Amount:", 340, y);
        doc.text(`${link.currency} ${parseFloat(link.amount).toFixed(2)}`, 450, y);
        y += 20;
        doc.fillColor("#10B981").text("Amount Paid:", 340, y);
        doc.text(`${link.currency} ${parseFloat(link.amountPaid).toFixed(2)}`, 450, y);
        y += 20;
        if (parseFloat(link.remainingBalance) > 0) {
          doc.fillColor("#EF4444").text("Remaining:", 340, y);
          doc.text(`${link.currency} ${parseFloat(link.remainingBalance).toFixed(2)}`, 450, y);
        }
      } else {
        let y = 280;
        doc.font("Helvetica-Bold").fillColor("#1A1A2E").text("Payment Details", 50, y);
        y += 20;
        doc.font("Helvetica").text(`Description: ${link.description || "Payment"}`, 50, y);
        y += 20;
        doc.text(`Amount: ${link.currency} ${parseFloat(link.amount).toFixed(2)}`, 50, y);
        y += 20;
        doc.fillColor("#10B981").text(`Paid: ${link.currency} ${parseFloat(link.amountPaid).toFixed(2)}`, 50, y);
        if (parseFloat(link.remainingBalance) > 0) {
          y += 20;
          doc.fillColor("#EF4444").text(`Remaining: ${link.currency} ${parseFloat(link.remainingBalance).toFixed(2)}`, 50, y);
        }
      }

      if (payments.length > 0) {
        let y = doc.page.height - 180;
        doc.fillColor("#6B7280").font("Helvetica").fontSize(9).text("Payment History:", 50, y);
        y += 16;
        for (const p of payments.filter(p => p.status === "completed").slice(0, 5)) {
          doc.text(`• ${new Date(p.createdAt).toLocaleDateString()} — ${p.method.toUpperCase()} — ${link.currency} ${parseFloat(p.amount).toFixed(2)}`, 50, y);
          y += 14;
        }
      }

      doc.fillColor("#9CA3AF").fontSize(8).text("Generated by BukkaPay | bukkapay.com", 50, doc.page.height - 40, { align: "center" });
      doc.end();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // GET /api/payment-links/:linkId/payments - Get all payments for a link
  app.get("/api/payment-links/:linkId/payments", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const link = await storage.getPaymentLink(req.params.linkId);
      if (!link) return res.status(404).json({ error: "Payment link not found" });
      if (userId && link.senderId !== userId) return res.status(403).json({ error: "Access denied" });
      const payments = await storage.getInvoicePaymentsByLink(link.id);
      res.json(payments);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==========================================
  // Claim Payments — Send Money to Anyone
  // ==========================================

  function generatePickupCode(): string {
    const part = () => Math.floor(Math.random() * 100000).toString().padStart(5, "0");
    return `${part()}${part()}${part()}`;
  }

  // POST /api/claim-payments — create a claim (auth required)
  app.post("/api/claim-payments", async (req, res) => {
    try {
      const senderId = getUserIdFromRequest(req);
      if (!senderId) return res.status(401).json({ error: "Unauthorized" });

      const { recipientName, recipientContact, amount, currency, note, pin } = req.body;
      if (!recipientName || !recipientContact || !amount || !pin) {
        return res.status(400).json({ error: "recipientName, recipientContact, amount and pin are required" });
      }
      if (String(pin).length < 4 || String(pin).length > 6) {
        return res.status(400).json({ error: "PIN must be 4–6 digits" });
      }
      if (isNaN(Number(pin)) || !/^\d+$/.test(String(pin))) {
        return res.status(400).json({ error: "PIN must be numeric" });
      }

      const sender = await storage.getUser(senderId);
      if (!sender) return res.status(404).json({ error: "Sender not found" });

      const senderCards = await storage.getWalletCards(senderId);
      if (!senderCards.length) return res.status(400).json({ error: "No wallet card found" });
      const card = senderCards[0];

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) return res.status(400).json({ error: "Invalid amount" });
      if (parseFloat(card.balance) < amountNum) return res.status(400).json({ error: "Insufficient balance" });

      const pinHash = await bcrypt.hash(String(pin), 12);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [claim] = await db.insert(claimPayments).values({
        senderId,
        recipientName,
        recipientContact,
        amount: amountNum.toFixed(2),
        currency: currency || "ZAR",
        note: note || null,
        pinHash,
        requirePin: true,
        status: "pending",
        claimed: false,
        attempts: 0,
        expiresAt,
      }).returning();

      // Deduct from sender wallet (escrow)
      const newBalance = (parseFloat(card.balance) - amountNum).toFixed(2);
      await storage.updateWalletCardBalance(card.id, senderId, newBalance);

      // Record transaction
      await storage.createTransaction({
        userId: senderId,
        cardId: card.id,
        title: `Claim sent to ${recipientName}`,
        category: "transfer",
        amount: amountNum.toFixed(2),
        type: "debit",
        icon: "send",
      });

      res.status(201).json({
        id: claim.id,
        claimUrl: `https://app.bukkapay.com/claim/${claim.id}`,
        expiresAt: claim.expiresAt,
        recipientName: claim.recipientName,
        amount: claim.amount,
        currency: claim.currency,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // GET /api/claim-payments/mine — sender's claims (auth required)
  app.get("/api/claim-payments/mine", async (req, res) => {
    try {
      const senderId = getUserIdFromRequest(req);
      if (!senderId) return res.status(401).json({ error: "Unauthorized" });

      const claims = await db.select().from(claimPayments)
        .where(eq(claimPayments.senderId, senderId))
        .orderBy(claimPayments.createdAt);

      res.json(claims.map(c => ({
        id: c.id,
        recipientName: c.recipientName,
        recipientContact: c.recipientContact,
        amount: c.amount,
        currency: c.currency,
        note: c.note,
        status: c.status,
        claimed: c.claimed,
        claimMethod: c.claimMethod,
        pickupStatus: c.pickupStatus,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
      })));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // DELETE /api/claim-payments/:id — cancel and refund (auth required)
  app.delete("/api/claim-payments/:id", async (req, res) => {
    try {
      const senderId = getUserIdFromRequest(req);
      if (!senderId) return res.status(401).json({ error: "Unauthorized" });

      const [claim] = await db.select().from(claimPayments)
        .where(and(eq(claimPayments.id, req.params.id), eq(claimPayments.senderId, senderId)));

      if (!claim) return res.status(404).json({ error: "Claim not found" });
      if (claim.claimed) return res.status(400).json({ error: "Cannot cancel — already claimed" });
      if (claim.status === "cancelled") return res.status(400).json({ error: "Already cancelled" });

      await db.update(claimPayments).set({ status: "cancelled" })
        .where(eq(claimPayments.id, claim.id));

      // Refund to sender
      const senderCards = await storage.getWalletCards(senderId);
      if (senderCards.length) {
        const card = senderCards[0];
        const refunded = (parseFloat(card.balance) + parseFloat(claim.amount)).toFixed(2);
        await storage.updateWalletCardBalance(card.id, senderId, refunded);
        await storage.createTransaction({
          userId: senderId,
          cardId: card.id,
          title: `Refund — cancelled claim for ${claim.recipientName}`,
          category: "refund",
          amount: claim.amount,
          type: "credit",
          icon: "refresh-cw",
        });
      }

      res.json({ success: true, message: "Claim cancelled and refunded" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // GET /api/claim-payments/:id/public — public claim info (no auth)
  app.get("/api/claim-payments/:id/public", async (req, res) => {
    try {
      const [claim] = await db.select({
        id: claimPayments.id,
        recipientName: claimPayments.recipientName,
        amount: claimPayments.amount,
        currency: claimPayments.currency,
        note: claimPayments.note,
        status: claimPayments.status,
        claimed: claimPayments.claimed,
        claimMethod: claimPayments.claimMethod,
        pickupCode: claimPayments.pickupCode,
        pickupStatus: claimPayments.pickupStatus,
        expiresAt: claimPayments.expiresAt,
        createdAt: claimPayments.createdAt,
      }).from(claimPayments).where(eq(claimPayments.id, req.params.id));

      if (!claim) return res.status(404).json({ error: "Claim not found" });
      if (new Date() > new Date(claim.expiresAt)) {
        return res.status(410).json({ error: "This claim link has expired" });
      }
      res.json(claim);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/claim-payments/:id/verify-pin — verify PIN (no auth, max 5 attempts)
  app.post("/api/claim-payments/:id/verify-pin", async (req, res) => {
    try {
      const [claim] = await db.select().from(claimPayments).where(eq(claimPayments.id, req.params.id));
      if (!claim) return res.status(404).json({ error: "Claim not found" });
      if (claim.claimed) return res.status(400).json({ error: "This payment has already been claimed" });
      if (claim.status === "cancelled") return res.status(400).json({ error: "This claim has been cancelled" });
      if (new Date() > new Date(claim.expiresAt)) return res.status(410).json({ error: "Claim link expired" });
      if (claim.attempts >= 5) return res.status(429).json({ error: "Too many attempts. Contact the sender." });

      const { pin } = req.body;
      if (!pin) return res.status(400).json({ error: "PIN is required" });

      const match = await bcrypt.compare(String(pin), claim.pinHash);
      if (!match) {
        await db.update(claimPayments).set({ attempts: claim.attempts + 1 })
          .where(eq(claimPayments.id, claim.id));
        const remaining = 4 - claim.attempts;
        return res.status(401).json({ error: `Incorrect PIN. ${remaining} attempt(s) remaining.` });
      }

      res.json({ success: true, message: "PIN verified" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/claim-payments/:id/claim-bank — claim via bank transfer
  app.post("/api/claim-payments/:id/claim-bank", async (req, res) => {
    try {
      const [claim] = await db.select().from(claimPayments).where(eq(claimPayments.id, req.params.id));
      if (!claim) return res.status(404).json({ error: "Claim not found" });
      if (claim.claimed) return res.status(400).json({ error: "Already claimed" });
      if (claim.status !== "pending") return res.status(400).json({ error: "Claim is not pending" });

      const { accountName, bankName, accountNumber, branchCode } = req.body;
      if (!accountName || !bankName || !accountNumber) {
        return res.status(400).json({ error: "accountName, bankName and accountNumber are required" });
      }

      await db.update(claimPayments).set({
        claimed: true,
        status: "completed",
        claimMethod: "bank",
        bankDetails: { accountName, bankName, accountNumber, branchCode: branchCode || "" },
      }).where(eq(claimPayments.id, claim.id));

      res.json({ success: true, message: `R${claim.amount} will be transferred to your ${bankName} account within 1–2 business days.` });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/claim-payments/:id/claim-wallet — claim via BukkaPay wallet
  app.post("/api/claim-payments/:id/claim-wallet", async (req, res) => {
    try {
      const [claim] = await db.select().from(claimPayments).where(eq(claimPayments.id, req.params.id));
      if (!claim) return res.status(404).json({ error: "Claim not found" });
      if (claim.claimed) return res.status(400).json({ error: "Already claimed" });
      if (claim.status !== "pending") return res.status(400).json({ error: "Claim is not pending" });

      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "email is required" });

      const receiver = await storage.getUserByEmail(email);
      if (!receiver) return res.status(404).json({ error: "No BukkaPay account found for this email. Please sign up first." });

      const receiverCards = await storage.getWalletCards(receiver.id);
      if (receiverCards.length) {
        const card = receiverCards[0];
        const newBalance = (parseFloat(card.balance) + parseFloat(claim.amount)).toFixed(2);
        await storage.updateWalletCardBalance(card.id, receiver.id, newBalance);
        await storage.createTransaction({
          userId: receiver.id,
          cardId: card.id,
          title: `Claim received from ${claim.recipientName}`,
          category: "transfer",
          amount: claim.amount,
          type: "credit",
          icon: "download",
        });
      }

      await db.update(claimPayments).set({
        claimed: true,
        status: "completed",
        claimMethod: "wallet",
      }).where(eq(claimPayments.id, claim.id));

      res.json({ success: true, message: `R${claim.amount} has been added to your BukkaPay wallet!` });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/claim-payments/:id/claim-cash — generate pickup code
  app.post("/api/claim-payments/:id/claim-cash", async (req, res) => {
    try {
      const [claim] = await db.select().from(claimPayments).where(eq(claimPayments.id, req.params.id));
      if (!claim) return res.status(404).json({ error: "Claim not found" });
      if (claim.claimed) return res.status(400).json({ error: "Already claimed" });
      if (claim.status !== "pending") return res.status(400).json({ error: "Claim is not pending" });

      // If pickup code already generated, return it
      if (claim.pickupCode) {
        return res.json({ success: true, pickupCode: claim.pickupCode, amount: claim.amount, currency: claim.currency });
      }

      const pickupCode = generatePickupCode();
      await db.update(claimPayments).set({
        claimMethod: "cash",
        pickupCode,
        pickupStatus: "pending",
      }).where(eq(claimPayments.id, claim.id));

      res.json({ success: true, pickupCode, amount: claim.amount, currency: claim.currency });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/pickup/claim — agent redeems a pickup code
  app.post("/api/pickup/claim", async (req, res) => {
    try {
      const { pickupCode } = req.body;
      if (!pickupCode) return res.status(400).json({ error: "pickupCode is required" });

      const [claim] = await db.select().from(claimPayments)
        .where(eq(claimPayments.pickupCode, String(pickupCode)));

      if (!claim) return res.status(404).json({ error: "Invalid pickup code" });
      if (claim.claimed) return res.status(400).json({ error: "This pickup code has already been used" });
      if (claim.pickupStatus === "completed") return res.status(400).json({ error: "Already redeemed" });

      await db.update(claimPayments).set({
        claimed: true,
        status: "completed",
        pickupStatus: "completed",
      }).where(eq(claimPayments.id, claim.id));

      res.json({
        success: true,
        amount: claim.amount,
        currency: claim.currency,
        recipientName: claim.recipientName,
        message: `Cash pickup of ${claim.currency} ${claim.amount} confirmed for ${claim.recipientName}.`,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ─── Notifications ────────────────────────────────────────────────────────────

  app.get("/api/notifications", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const items = await storage.getNotifications(userId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await storage.markNotificationRead(req.params.id, userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await storage.deleteNotification(req.params.id, userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/notifications", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await storage.clearAllNotifications(userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── File Upload (base64 → stored as data URI for now) ─────────────────────
  app.post("/api/upload", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { base64, mimeType, filename } = req.body;
      if (!base64 || !mimeType) return res.status(400).json({ error: "base64 and mimeType are required" });
      const dataUri = `data:${mimeType};base64,${base64}`;
      res.json({ url: dataUri, filename: filename || "file", mimeType });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Merchant Subscription ─────────────────────────────────────────────────
  app.post("/api/merchants/:id/subscribe", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const merchant = await storage.getMerchant(req.params.id);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });
      if ((merchant as any).userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const { plan } = req.body;
      const planConfig: Record<string, { price: number }> = {
        starter: { price: 0 },
        pro: { price: 99 },
        business: { price: 299 },
      };
      if (!planConfig[plan]) return res.status(400).json({ error: "Invalid plan" });

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      const pool = pool;
      if (pool) {
        await pool.query(
          `INSERT INTO merchant_subscriptions (merchant_id, plan, status, price, billing_cycle, expires_at)
           VALUES ($1, $2, 'active', $3, 'monthly', $4)
           ON CONFLICT DO NOTHING`,
          [merchant.id, plan, planConfig[plan].price, expiresAt.toISOString()]
        );
        await pool.query(
          `UPDATE merchants SET subscription_plan = $1, subscription_status = 'active', subscription_expires_at = $2 WHERE id = $3`,
          [plan, expiresAt.toISOString(), merchant.id]
        );
      }

      res.json({ success: true, plan, expiresAt });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Billing Links ─────────────────────────────────────────────────────────
  app.get("/api/billing-links", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const merchantsList = await storage.getMerchantsByUser(userId);
      if (!merchantsList.length) return res.json([]);

      const merchantIds = merchantsList.map(m => m.id);
      const pool = pool;
      if (!pool) return res.json([]);

      const placeholders = merchantIds.map((_, i) => `$${i + 1}`).join(", ");
      const result = await pool.query(
        `SELECT * FROM billing_links WHERE merchant_id IN (${placeholders}) ORDER BY created_at DESC`,
        merchantIds
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/billing-links", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const {
        merchantId, billerName, billType, description, amount, currency,
        accountNumber, billingPeriod, dueDate, attachments, recipients,
      } = req.body;

      if (!merchantId || !billerName || !amount) {
        return res.status(400).json({ error: "merchantId, billerName and amount are required" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });
      if ((merchant as any).userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const pool = pool;
      if (!pool) return res.status(500).json({ error: "DB unavailable" });

      const result = await pool.query(
        `INSERT INTO billing_links
           (merchant_id, biller_name, bill_type, description, amount, currency, account_number,
            billing_period, due_date, attachments, recipients, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active')
         RETURNING *`,
        [
          merchantId, billerName, billType || "other", description || null,
          parseFloat(amount), currency || "ZAR", accountNumber || null,
          billingPeriod || null, dueDate || null,
          JSON.stringify(attachments || []), JSON.stringify(recipients || []),
        ]
      );

      const link = result.rows[0];
      // Create a corresponding payment link
      try {
        const authHeaders = await storage.getUser(userId);
        const plResult = await pool.query(
          `INSERT INTO payment_links
             (sender_id, amount, currency, description, remaining_balance, type, destination, business_name, link_type, status)
           VALUES ($1,$2,$3,$4,$5,'business','wallet',$6,'billing','active')
           RETURNING id`,
          [userId, parseFloat(amount), currency || "ZAR", `${billerName} — ${billingPeriod || "Bill"}`, parseFloat(amount), merchant.businessName]
        );
        const plId = plResult.rows[0]?.id;
        if (plId) {
          await pool.query(`UPDATE billing_links SET payment_link_id = $1 WHERE id = $2`, [plId, link.id]);
          link.payment_link_id = plId;
          link.payUrl = `https://app.bukkapay.com/pay/${plId}`;
        }
      } catch (_) {}

      res.status(201).json({ ...link, payUrl: link.payment_link_id ? `https://app.bukkapay.com/pay/${link.payment_link_id}` : null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/billing-links/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const pool = pool;
      if (!pool) return res.status(500).json({ error: "DB unavailable" });
      const result = await pool.query(`SELECT bl.*, m.user_id FROM billing_links bl JOIN merchants m ON bl.merchant_id = m.id WHERE bl.id = $1`, [req.params.id]);
      if (!result.rows.length) return res.status(404).json({ error: "Not found" });
      const link = result.rows[0];
      if (link.user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      res.json({ ...link, payUrl: link.payment_link_id ? `https://app.bukkapay.com/pay/${link.payment_link_id}` : null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/billing-links/:id/status", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { status } = req.body;
      const pool = pool;
      if (!pool) return res.status(500).json({ error: "DB unavailable" });
      const check = await pool.query(`SELECT bl.*, m.user_id FROM billing_links bl JOIN merchants m ON bl.merchant_id = m.id WHERE bl.id = $1`, [req.params.id]);
      if (!check.rows.length) return res.status(404).json({ error: "Not found" });
      if (check.rows[0].user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      await pool.query(`UPDATE billing_links SET status = $1 WHERE id = $2`, [status, req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/billing-links/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const pool = pool;
      if (!pool) return res.status(500).json({ error: "DB unavailable" });
      const check = await pool.query(`SELECT bl.*, m.user_id FROM billing_links bl JOIN merchants m ON bl.merchant_id = m.id WHERE bl.id = $1`, [req.params.id]);
      if (!check.rows.length) return res.status(404).json({ error: "Not found" });
      if (check.rows[0].user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      await pool.query(`DELETE FROM billing_links WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Patch payment link with attachments ──────────────────────────────────
  app.patch("/api/payment-links/:id/attachments", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { attachments } = req.body;
      const pool = pool;
      if (!pool) return res.status(500).json({ error: "DB unavailable" });
      const check = await pool.query(`SELECT * FROM payment_links WHERE id = $1`, [req.params.id]);
      if (!check.rows.length) return res.status(404).json({ error: "Not found" });
      if (check.rows[0].sender_id !== userId) return res.status(403).json({ error: "Forbidden" });
      await pool.query(`UPDATE payment_links SET attachments = $1 WHERE id = $2`, [JSON.stringify(attachments), req.params.id]);
      res.json({ success: true, attachments });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Tag n Ride ──────────────────────────────────────────────────────────────

  app.post("/api/tag-ride/driver/register", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { vehicleNumber, vehicleType } = req.body;
      if (!vehicleNumber?.trim()) return res.status(400).json({ error: "Vehicle number is required" });
      const existing = await pool.query(`SELECT * FROM tag_ride_drivers WHERE user_id = $1`, [userId]);
      if (existing.rows.length > 0) {
        const updated = await pool.query(
          `UPDATE tag_ride_drivers SET vehicle_number = $1, vehicle_type = $2, is_active = true WHERE user_id = $3 RETURNING *`,
          [vehicleNumber.trim(), vehicleType || "taxi", userId]
        );
        return res.json(updated.rows[0]);
      }
      const result = await pool.query(
        `INSERT INTO tag_ride_drivers (user_id, vehicle_number, vehicle_type) VALUES ($1, $2, $3) RETURNING *`,
        [userId, vehicleNumber.trim(), vehicleType || "taxi"]
      );
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tag-ride/driver/me", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const result = await pool.query(
        `SELECT d.*, u.name, u.username FROM tag_ride_drivers d JOIN users u ON d.user_id = u.id WHERE d.user_id = $1`,
        [userId]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Not registered as driver" });
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tag-ride/driver/:driverId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const result = await pool.query(
        `SELECT d.id, d.vehicle_number, d.vehicle_type, d.is_active, u.name FROM tag_ride_drivers d JOIN users u ON d.user_id = u.id WHERE d.id = $1`,
        [req.params.driverId]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Driver not found" });
      if (!result.rows[0].is_active) return res.status(400).json({ error: "Driver is not active" });
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tag-ride/pay", async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { driverId, amount } = req.body;
    if (!driverId || !amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "Invalid payment details" });
    }
    const amountDecimal = parseFloat(amount).toFixed(2);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const driverResult = await client.query(
        `SELECT d.*, u.id AS driver_user_id FROM tag_ride_drivers d JOIN users u ON d.user_id = u.id WHERE d.id = $1 FOR UPDATE`,
        [driverId]
      );
      if (!driverResult.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Driver not found" }); }
      const driver = driverResult.rows[0];
      if (!driver.is_active) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Driver is not active" }); }
      if (driver.driver_user_id === userId) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Cannot pay yourself" }); }

      const passengerCardResult = await client.query(
        `SELECT * FROM wallet_cards WHERE user_id = $1 AND (frozen IS NULL OR frozen = false) ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
        [userId]
      );
      if (!passengerCardResult.rows.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: "No active wallet card found" }); }
      const passengerCard = passengerCardResult.rows[0];

      if (parseFloat(passengerCard.balance) < parseFloat(amountDecimal)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `Insufficient balance. Available: ${parseFloat(passengerCard.balance).toFixed(2)}` });
      }

      const driverCardResult = await client.query(
        `SELECT * FROM wallet_cards WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
        [driver.driver_user_id]
      );
      if (!driverCardResult.rows.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Driver has no wallet" }); }
      const driverCard = driverCardResult.rows[0];

      await client.query(`UPDATE wallet_cards SET balance = balance - $1 WHERE id = $2`, [amountDecimal, passengerCard.id]);
      await client.query(`UPDATE wallet_cards SET balance = balance + $1 WHERE id = $2`, [amountDecimal, driverCard.id]);
      await client.query(`UPDATE tag_ride_drivers SET total_earnings = total_earnings + $1 WHERE id = $2`, [amountDecimal, driverId]);

      const reference = `TRD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const rideResult = await client.query(
        `INSERT INTO tag_ride_rides (passenger_id, driver_id, passenger_card_id, driver_card_id, amount, status, reference) VALUES ($1, $2, $3, $4, $5, 'completed', $6) RETURNING *`,
        [userId, driverId, passengerCard.id, driverCard.id, amountDecimal, reference]
      );

      await client.query(
        `INSERT INTO transactions (user_id, card_id, title, category, amount, type, icon) VALUES ($1, $2, $3, 'transport', $4, 'debit', 'car')`,
        [userId, passengerCard.id, `Tag n Ride - ${driver.name}`, amountDecimal]
      );
      await client.query(
        `INSERT INTO transactions (user_id, card_id, title, category, amount, type, icon) VALUES ($1, $2, $3, 'transport', $4, 'credit', 'cash')`,
        [driver.driver_user_id, driverCard.id, `Tag n Ride Fare`, amountDecimal]
      );

      await client.query("COMMIT");
      const newBalance = (parseFloat(passengerCard.balance) - parseFloat(amountDecimal)).toFixed(2);
      res.json({ success: true, ride: rideResult.rows[0], reference, passengerNewBalance: newBalance });
    } catch (error: any) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  });

  app.get("/api/tag-ride/rides", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const role = (req.query.role as string) || "passenger";
      if (role === "driver") {
        const driverResult = await pool.query(`SELECT id FROM tag_ride_drivers WHERE user_id = $1`, [userId]);
        if (!driverResult.rows.length) return res.json({ rides: [], todayTotal: "0.00" });
        const driverId = driverResult.rows[0].id;
        const ridesResult = await pool.query(
          `SELECT r.*, u.name AS passenger_name FROM tag_ride_rides r JOIN users u ON r.passenger_id = u.id WHERE r.driver_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
          [driverId]
        );
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayResult = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS today_total FROM tag_ride_rides WHERE driver_id = $1 AND created_at >= $2 AND status = 'completed'`,
          [driverId, todayStart]
        );
        res.json({ rides: ridesResult.rows, todayTotal: parseFloat(todayResult.rows[0].today_total).toFixed(2) });
      } else {
        const result = await pool.query(
          `SELECT r.*, d.vehicle_number, d.vehicle_type, u.name AS driver_name FROM tag_ride_rides r JOIN tag_ride_drivers d ON r.driver_id = d.id JOIN users u ON d.user_id = u.id WHERE r.passenger_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
          [userId]
        );
        res.json({ rides: result.rows });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
