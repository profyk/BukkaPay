import { db } from "../db/index";
import { users, walletCards, transactions, contacts, paymentRequests } from "@shared/schema";
import type { 
  User, InsertUser, 
  WalletCard, InsertWalletCard,
  Transaction, InsertTransaction,
  Contact, InsertContact,
  PaymentRequest, InsertPaymentRequest
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByWalletId(walletId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getWalletCards(userId: string): Promise<WalletCard[]>;
  getWalletCard(id: string, userId: string): Promise<WalletCard | undefined>;
  createWalletCard(card: InsertWalletCard): Promise<WalletCard>;
  updateWalletCardBalance(id: string, userId: string, balance: string): Promise<WalletCard | undefined>;
  
  getTransactions(userId: string, limit?: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  
  getContacts(userId: string): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  
  createPaymentRequest(request: InsertPaymentRequest): Promise<PaymentRequest>;
  getPaymentRequest(id: string): Promise<PaymentRequest | undefined>;
  getPaymentRequestsByUser(userId: string): Promise<PaymentRequest[]>;
  updatePaymentRequestStatus(id: string, status: string): Promise<PaymentRequest | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByWalletId(walletId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.walletId, walletId));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getWalletCards(userId: string): Promise<WalletCard[]> {
    return await db.select().from(walletCards).where(eq(walletCards.userId, userId));
  }

  async getWalletCard(id: string, userId: string): Promise<WalletCard | undefined> {
    const [card] = await db.select().from(walletCards)
      .where(and(eq(walletCards.id, id), eq(walletCards.userId, userId)));
    return card;
  }

  async createWalletCard(card: InsertWalletCard): Promise<WalletCard> {
    const [newCard] = await db.insert(walletCards).values(card).returning();
    return newCard;
  }

  async updateWalletCardBalance(id: string, userId: string, balance: string): Promise<WalletCard | undefined> {
    const [updated] = await db.update(walletCards)
      .set({ balance })
      .where(and(eq(walletCards.id, id), eq(walletCards.userId, userId)))
      .returning();
    return updated;
  }

  async getTransactions(userId: string, limit?: number): Promise<Transaction[]> {
    let query = db.select().from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));
    
    if (limit) {
      query = query.limit(limit) as any;
    }
    
    return await query;
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db.insert(transactions).values(transaction).returning();
    return newTransaction;
  }

  async getContacts(userId: string): Promise<Contact[]> {
    return await db.select().from(contacts).where(eq(contacts.userId, userId));
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).returning();
    return newContact;
  }

  async createPaymentRequest(request: InsertPaymentRequest): Promise<PaymentRequest> {
    const [newRequest] = await db.insert(paymentRequests).values(request).returning();
    return newRequest;
  }

  async getPaymentRequest(id: string): Promise<PaymentRequest | undefined> {
    const [request] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id));
    return request;
  }

  async getPaymentRequestsByUser(userId: string): Promise<PaymentRequest[]> {
    return await db.select().from(paymentRequests)
      .where(eq(paymentRequests.userId, userId))
      .orderBy(desc(paymentRequests.createdAt));
  }

  async updatePaymentRequestStatus(id: string, status: string): Promise<PaymentRequest | undefined> {
    const [updated] = await db.update(paymentRequests)
      .set({ status })
      .where(eq(paymentRequests.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
