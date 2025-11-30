import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { signup, login, generateSessionToken } from "./auth";
import { insertWalletCardSchema, insertTransactionSchema, insertContactSchema, insertUserSchema, loginSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

// Session store (in production, use Redis or database)
const sessions = new Map<string, { userId: string; expiresAt: number }>();

// Middleware to get userId from session token
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
      const token = generateSessionToken();
      sessions.set(token, { userId: user.id, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }); // 30 days

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

  app.post("/api/cards", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const validation = insertWalletCardSchema.safeParse({ ...req.body, userId });
      
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const card = await storage.createWalletCard(validation.data);
      res.status(201).json(card);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/cards/:id/balance", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const { id } = req.params;
      const { balance } = req.body;

      if (!balance || isNaN(parseFloat(balance))) {
        return res.status(400).json({ error: "Invalid balance" });
      }

      const card = await storage.updateWalletCardBalance(id, userId, balance);
      if (!card) {
        return res.status(404).json({ error: "Card not found" });
      }

      res.json(card);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Transactions
  app.get("/api/transactions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const transactions = await storage.getTransactions(userId, limit);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const validation = insertTransactionSchema.safeParse({ ...req.body, userId });
      
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const transaction = await storage.createTransaction(validation.data);

      if (req.body.cardId && req.body.type === "expense") {
        const card = await storage.getWalletCard(req.body.cardId, userId);
        if (card) {
          const newBalance = (parseFloat(card.balance) + parseFloat(req.body.amount)).toFixed(2);
          await storage.updateWalletCardBalance(req.body.cardId, userId, newBalance);
        }
      }

      res.status(201).json(transaction);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
      
      const validation = insertContactSchema.safeParse({ ...req.body, userId });
      
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const contact = await storage.createContact(validation.data);
      res.status(201).json(contact);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Seed endpoint for initial data
  app.post("/api/seed", async (req, res) => {
    try {
      const userId = "demo-user";
      
      const existingUser = await storage.getUserByUsername("alex_morgan");
      if (!existingUser) {
        await storage.createUser({
          name: "Alex Morgan",
          email: "alex.morgan@example.com",
          username: "alex_morgan",
          password: "demo123",
        });
      }

      const existingCards = await storage.getWalletCards(userId);
      if (existingCards.length === 0) {
        await storage.createWalletCard({
          userId,
          title: "Fuel",
          balance: "1250.50",
          currency: "$",
          icon: "fuel",
          color: "blue",
          cardNumber: "**** 4582",
        });
        
        await storage.createWalletCard({
          userId,
          title: "Groceries",
          balance: "450.75",
          currency: "$",
          icon: "shopping-cart",
          color: "green",
          cardNumber: "**** 9921",
        });

        await storage.createWalletCard({
          userId,
          title: "Transport",
          balance: "85.20",
          currency: "$",
          icon: "bus",
          color: "purple",
          cardNumber: "**** 3310",
        });

        await storage.createWalletCard({
          userId,
          title: "Leisure",
          balance: "320.00",
          currency: "$",
          icon: "coffee",
          color: "orange",
          cardNumber: "**** 1209",
        });

        await storage.createTransaction({
          userId,
          title: "Shell Station",
          category: "Fuel",
          amount: "-45.00",
          type: "expense",
          icon: "fuel",
        });

        await storage.createTransaction({
          userId,
          title: "Sarah Jenkins",
          category: "Transfer",
          amount: "150.00",
          type: "income",
          icon: "arrow-down-left",
        });

        await storage.createTransaction({
          userId,
          title: "Whole Foods",
          category: "Groceries",
          amount: "-123.45",
          type: "expense",
          icon: "shopping-cart",
        });
      }

      res.json({ success: true, message: "Database seeded" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Transfer endpoint
  app.post("/api/transfer", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const { fromCardId, toCardId, amount } = req.body;

      if (!fromCardId || !toCardId || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Invalid transfer parameters" });
      }

      const fromCard = await storage.getWalletCard(fromCardId, userId);
      const toCard = await storage.getWalletCard(toCardId, userId);

      if (!fromCard || !toCard) {
        return res.status(404).json({ error: "Card not found" });
      }

      if (parseFloat(fromCard.balance) < parseFloat(amount)) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      const newFromBalance = (parseFloat(fromCard.balance) - parseFloat(amount)).toFixed(2);
      const newToBalance = (parseFloat(toCard.balance) + parseFloat(amount)).toFixed(2);

      await storage.updateWalletCardBalance(fromCardId, userId, newFromBalance);
      await storage.updateWalletCardBalance(toCardId, userId, newToBalance);

      await storage.createTransaction({
        userId,
        cardId: fromCardId,
        title: `Transfer to ${toCard.title}`,
        category: "Transfer",
        amount: `-${amount}`,
        type: "expense",
        icon: "arrow-right-left",
      });

      await storage.createTransaction({
        userId,
        cardId: toCardId,
        title: `Transfer from ${fromCard.title}`,
        category: "Transfer",
        amount: amount,
        type: "income",
        icon: "arrow-right-left",
      });

      res.json({ success: true, fromCard: await storage.getWalletCard(fromCardId, userId), toCard: await storage.getWalletCard(toCardId, userId) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
