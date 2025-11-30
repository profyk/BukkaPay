import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { signup, login, generateSessionToken } from "./auth";
import { insertWalletCardSchema, insertTransactionSchema, insertContactSchema, insertUserSchema, loginSchema, insertPaymentRequestSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

const sessions = new Map<string, { userId: string; expiresAt: number }>();

function getUserIdFromRequest(req: Request): string | null {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  
  return session.userId;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Auth Routes
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const validation = insertUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const user = await signup(validation.data);
      
      const defaultCards = [
        { title: "💳 Main Card", balance: "0.00", currency: "$", icon: "credit-card", color: "from-violet-600 to-indigo-600", cardNumber: "4532 **** **** 1234" },
        { title: "🛒 Groceries", balance: "0.00", currency: "$", icon: "shopping-cart", color: "from-emerald-600 to-teal-600", cardNumber: "5412 **** **** 5678" },
        { title: "🚗 Transport", balance: "0.00", currency: "$", icon: "car", color: "from-blue-600 to-cyan-600", cardNumber: "3782 **** **** 9012" },
        { title: "🎉 Leisure", balance: "0.00", currency: "$", icon: "sparkles", color: "from-pink-600 to-rose-600", cardNumber: "6011 **** **** 3456" }
      ];

      for (const card of defaultCards) {
        await storage.createWalletCard({
          userId: user.id,
          ...card,
        });
      }

      const token = generateSessionToken();
      sessions.set(token, { userId: user.id, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });

      res.status(201).json({
        token,
        user: { id: user.id, walletId: user.walletId, name: user.name, email: user.email, username: user.username, phone: user.phone, countryCode: user.countryCode },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const user = await login(validation.data);
      const token = generateSessionToken();
      sessions.set(token, { userId: user.id, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });

      res.json({
        token,
        user: { id: user.id, walletId: user.walletId, name: user.name, email: user.email, username: user.username, phone: user.phone, countryCode: user.countryCode },
      });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) sessions.delete(token);
      res.json({ success: true });
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
        res.json({ id: user.id, walletId: user.walletId, name: user.name, email: user.email, username: user.username, phone: user.phone, countryCode: user.countryCode });
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
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const card = await storage.createWalletCard({
        userId,
        ...validation.data,
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
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const transaction = await storage.createTransaction({
        userId,
        ...validation.data,
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
        return res.status(400).json({ error: fromZodError(validation.error).message });
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
        return res.status(400).json({ error: fromZodError(validation.error).message });
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

  return httpServer;
}
