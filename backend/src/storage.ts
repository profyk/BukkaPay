import { db } from "./db/index";
import {
  users,
  admins,
  walletCards,
  transactions,
  contacts,
  paymentRequests,
  loyaltyRewards,
  autoPays,
  beneficiaries,
  challenges,
  achievements,
  chatMessages,
  billSplits,
  virtualCards,
  merchants,
  merchantTransactions,
  properties,
  propertyUnits,
  tenants,
  rentPayments,
  rentPaymentLinks,
  webauthnCredentials,
  giftCards,
  contributionGroups,
  contributions,
  purchaseTransactions,
} from "./shared/schema";

import type {
  User,
  InsertUser,
  Admin,
  InsertAdmin,
  WalletCard,
  InsertWalletCard,
  Transaction,
  InsertTransaction,
  Contact,
  InsertContact,
  PaymentRequest,
  InsertPaymentRequest,
  LoyaltyReward,
  AutoPay,
  Beneficiary,
  Challenge,
  Achievement,
  ChatMessage,
  BillSplit,
  VirtualCard,
  Merchant,
  InsertMerchant,
  MerchantTransaction,
  InsertMerchantTransaction,
  Property,
  InsertProperty,
  PropertyUnit,
  InsertPropertyUnit,
  Tenant,
  InsertTenant,
  RentPayment,
  InsertRentPayment,
  RentPaymentLink,
  InsertRentPaymentLink,
  WebauthnCredential,
  InsertWebauthnCredential,
  GiftCard,
  InsertGiftCard,
  ContributionGroup,
  InsertContributionGroup,
  Contribution,
  InsertContribution,
  PurchaseTransaction,
  InsertPurchaseTransaction,
} from "./shared/schema";

import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Admins
  getAdmin(id: string): Promise<Admin | undefined>;
  getAdminByEmail(email: string): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;

  // Wallets
  getWalletCards(userId: string): Promise<WalletCard[]>;
  getWalletCard(id: string, userId: string): Promise<WalletCard | undefined>;
  createWalletCard(card: InsertWalletCard): Promise<WalletCard>;
  updateWalletCardBalance(id: string, userId: string, balance: string): Promise<WalletCard | undefined>;

  // Transactions
  getTransactions(userId: string, limit?: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;

  // Contacts
  getContacts(userId: string): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;

  // Payment Requests
  createPaymentRequest(request: InsertPaymentRequest): Promise<PaymentRequest>;
  getPaymentRequest(id: string): Promise<PaymentRequest | undefined>;
  getPaymentRequestsByUser(userId: string): Promise<PaymentRequest[]>;
  updatePaymentRequestStatus(id: string, status: string): Promise<PaymentRequest | undefined>;

  // Loyalty
  getLoyaltyReward(userId: string): Promise<LoyaltyReward | undefined>;
  updateLoyaltyPoints(userId: string, points: number): Promise<void>;

  // AutoPays
  getAutoPays(userId: string): Promise<AutoPay[]>;
  createAutoPay(autoPay: any): Promise<AutoPay>;

  // Beneficiaries
  getBeneficiaries(userId: string): Promise<Beneficiary[]>;
  createBeneficiary(beneficiary: any): Promise<Beneficiary>;

  // Challenges
  getChallenges(userId: string): Promise<Challenge[]>;
  createChallenge(challenge: any): Promise<Challenge>;

  // Achievements
  getAchievements(userId: string): Promise<Achievement[]>;
  createAchievement(achievement: any): Promise<Achievement>;

  // Virtual Cards
  createVirtualCard(card: any): Promise<VirtualCard>;
  getVirtualCards(userId: string): Promise<VirtualCard[]>;

  // Merchants
  createMerchant(merchant: InsertMerchant & { qrCode: string; paymentLink: string; userId: string }): Promise<Merchant>;
  getMerchant(id: string): Promise<Merchant | undefined>;
  getMerchantByQrCode(qrCode: string): Promise<Merchant | undefined>;
  getMerchantByPaymentLink(paymentLink: string): Promise<Merchant | undefined>;
  getMerchantsByUser(userId: string): Promise<Merchant[]>;
  updateMerchantBalance(id: string, balance: string): Promise<Merchant | undefined>;

  // Merchant Transactions
  createMerchantTransaction(transaction: InsertMerchantTransaction): Promise<MerchantTransaction>;
  getMerchantTransactions(merchantId: string, limit?: number): Promise<MerchantTransaction[]>;

  // Properties
  createProperty(property: InsertProperty): Promise<Property>;
  getProperty(id: string): Promise<Property | undefined>;
  getPropertiesByMerchant(merchantId: string): Promise<Property[]>;
  getPropertiesByLandlord(landlordId: string): Promise<Property[]>;
  updateProperty(id: string, data: Partial<InsertProperty>): Promise<Property | undefined>;

  // Property Units
  createPropertyUnit(unit: InsertPropertyUnit): Promise<PropertyUnit>;
  getPropertyUnit(id: string): Promise<PropertyUnit | undefined>;
  getPropertyUnits(propertyId: string): Promise<PropertyUnit[]>;
  updatePropertyUnit(id: string, data: Partial<InsertPropertyUnit>): Promise<PropertyUnit | undefined>;

  // Tenants
  createTenant(tenant: InsertTenant & { tenantId: string }): Promise<Tenant>;
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantByTenantId(tenantId: string): Promise<Tenant | undefined>;
  getTenantsByProperty(propertyId: string): Promise<Tenant[]>;
  getTenantsByLandlord(landlordId: string): Promise<Tenant[]>;
  getTenantByUserId(userId: string): Promise<Tenant | undefined>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;

  // Rent Payments
  createRentPayment(payment: InsertRentPayment): Promise<RentPayment>;
  getRentPayments(tenantId: string): Promise<RentPayment[]>;
  getRentPaymentsByProperty(propertyId: string): Promise<RentPayment[]>;
  getRentPaymentsByMerchant(merchantId: string): Promise<RentPayment[]>;
  getRentPaymentsForMonth(tenantId: string, rentMonth: string): Promise<RentPayment[]>;

  // Rent Payment Links
  createRentPaymentLink(link: InsertRentPaymentLink): Promise<RentPaymentLink>;
  getRentPaymentLinkByCode(linkCode: string): Promise<RentPaymentLink | undefined>;
  updateRentPaymentLink(id: string, data: Partial<InsertRentPaymentLink>): Promise<RentPaymentLink | undefined>;

  // WebAuthn
  createWebauthnCredential(credential: InsertWebauthnCredential): Promise<WebauthnCredential>;
  getWebauthnCredentialsByUserId(userId: string): Promise<WebauthnCredential[]>;
  getWebauthnCredentialByCredentialId(credentialId: string): Promise<WebauthnCredential | undefined>;
  updateWebauthnCredentialCounter(id: string, counter: number): Promise<void>;
  deleteWebauthnCredential(id: string): Promise<void>;
  updateUserBiometricEnabled(userId: string, enabled: boolean): Promise<void>;

  // Gift Cards
  createGiftCard(giftCard: InsertGiftCard & { code: string }): Promise<GiftCard>;
  getGiftCard(id: string): Promise<GiftCard | undefined>;
  getGiftCardByCode(code: string): Promise<GiftCard | undefined>;
  getGiftCardsBySender(senderId: string): Promise<GiftCard[]>;
  getReceivedGiftCards(userId: string): Promise<GiftCard[]>;
  updateGiftCardStatus(id: string, status: string, redeemedBy?: string): Promise<GiftCard | undefined>;

  // Contribution Groups
  createContributionGroup(group: InsertContributionGroup & { shareCode: string }): Promise<ContributionGroup>;
  getContributionGroup(id: string): Promise<ContributionGroup | undefined>;
  getContributionGroupByShareCode(shareCode: string): Promise<ContributionGroup | undefined>;
  getContributionGroupsByCreator(creatorId: string): Promise<ContributionGroup[]>;
  updateContributionGroupAmount(id: string, amount: string): Promise<ContributionGroup | undefined>;

  // Contributions
  createContribution(contribution: InsertContribution): Promise<Contribution>;
  getContributionsByGroup(groupId: string): Promise<Contribution[]>;

  // Bill Splits
  createBillSplit(billSplit: { creatorId: string; title: string; totalAmount: string; participants: any[] }): Promise<BillSplit>;
  getBillSplit(id: string): Promise<BillSplit | undefined>;
  getBillSplitsByUser(userId: string): Promise<BillSplit[]>;
  updateBillSplitParticipants(id: string, participants: any[]): Promise<BillSplit | undefined>;
  updateBillSplitStatus(id: string, status: string): Promise<BillSplit | undefined>;

  // Purchase Transactions
  createPurchaseTransaction(transaction: InsertPurchaseTransaction & { reference: string }): Promise<PurchaseTransaction>;
  getPurchaseTransaction(id: string): Promise<PurchaseTransaction | undefined>;
  getPurchaseTransactionsByUser(userId: string, filters?: { category?: string; status?: string; startDate?: Date; endDate?: Date; limit?: number; offset?: number }): Promise<PurchaseTransaction[]>;
}

export class DatabaseStorage implements IStorage {
  // ---------------- Users ----------------
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
  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  // ---------------- Admins ----------------
  async getAdmin(id: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.id, id));
    return admin;
  }
  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.email, email));
    return admin;
  }
  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    const [newAdmin] = await db.insert(admins).values(admin).returning();
    return newAdmin;
  }

  // ---------------- Wallet Cards ----------------
  async getWalletCards(userId: string): Promise<WalletCard[]> {
    return await db.select().from(walletCards).where(eq(walletCards.userId, userId));
  }
  async getWalletCard(id: string, userId: string): Promise<WalletCard | undefined> {
    const [card] = await db.select().from(walletCards).where(and(eq(walletCards.id, id), eq(walletCards.userId, userId)));
    return card;
  }
  async createWalletCard(card: InsertWalletCard): Promise<WalletCard> {
    const [newCard] = await db.insert(walletCards).values(card).returning();
    return newCard;
  }
  async updateWalletCardBalance(id: string, userId: string, balance: string): Promise<WalletCard | undefined> {
    const [updated] = await db.update(walletCards).set({ balance }).where(and(eq(walletCards.id, id), eq(walletCards.userId, userId))).returning();
    return updated;
  }

  // ---------------- Transactions ----------------
  async getTransactions(userId: string, limit?: number): Promise<Transaction[]> {
    let query = db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.createdAt));
    if (limit) query = query.limit(limit) as any;
    return await query;
  }
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTx] = await db.insert(transactions).values(transaction).returning();
    return newTx;
  }

  // ---------------- Contacts ----------------
  async getContacts(userId: string): Promise<Contact[]> {
    return await db.select().from(contacts).where(eq(contacts.userId, userId));
  }
  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).returning();
    return newContact;
  }

  // ---------------- Payment Requests ----------------
  async createPaymentRequest(request: InsertPaymentRequest): Promise<PaymentRequest> {
    const [newReq] = await db.insert(paymentRequests).values(request).returning();
    return newReq;
  }
  async getPaymentRequest(id: string): Promise<PaymentRequest | undefined> {
    const [req] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id));
    return req;
  }
  async getPaymentRequestsByUser(userId: string): Promise<PaymentRequest[]> {
    return await db.select().from(paymentRequests).where(eq(paymentRequests.userId, userId)).orderBy(desc(paymentRequests.createdAt));
  }
  async updatePaymentRequestStatus(id: string, status: string): Promise<PaymentRequest | undefined> {
    const [updated] = await db.update(paymentRequests).set({ status }).where(eq(paymentRequests.id, id)).returning();
    return updated;
  }

  // ---------------- Loyalty ----------------
  async getLoyaltyReward(userId: string): Promise<LoyaltyReward | undefined> {
    const [reward] = await db.select().from(loyaltyRewards).where(eq(loyaltyRewards.userId, userId));
    return reward;
  }
  async updateLoyaltyPoints(userId: string, points: number): Promise<void> {
    const existing = await this.getLoyaltyReward(userId);
    if (existing) {
      await db.update(loyaltyRewards).set({ totalPoints: (existing.totalPoints ?? 0) + points }).where(eq(loyaltyRewards.userId, userId));
    } else {
      await db.insert(loyaltyRewards).values({ userId, pointsEarned: points, totalPoints: points, tier: "bronze" });
    }
  }

  // ---------------- AutoPays ----------------
  async getAutoPays(userId: string): Promise<AutoPay[]> {
    return await db.select().from(autoPays).where(eq(autoPays.userId, userId));
  }
  async createAutoPay(autoPay: any): Promise<AutoPay> {
    const [newAuto] = await db.insert(autoPays).values(autoPay).returning();
    return newAuto;
  }

  // ---------------- Beneficiaries ----------------
  async getBeneficiaries(userId: string): Promise<Beneficiary[]> {
    return await db.select().from(beneficiaries).where(eq(beneficiaries.userId, userId));
  }
  async createBeneficiary(beneficiary: any): Promise<Beneficiary> {
    const [newB] = await db.insert(beneficiaries).values(beneficiary).returning();
    return newB;
  }

  // ---------------- Challenges ----------------
  async getChallenges(userId: string): Promise<Challenge[]> {
    return await db.select().from(challenges).where(eq(challenges.userId, userId));
  }
  async createChallenge(challenge: any): Promise<Challenge> {
    const [newC] = await db.insert(challenges).values(challenge).returning();
    return newC;
  }

  // ---------------- Achievements ----------------
  async getAchievements(userId: string): Promise<Achievement[]> {
    return await db.select().from(achievements).where(eq(achievements.userId, userId));
  }
  async createAchievement(achievement: any): Promise<Achievement> {
    const [newA] = await db.insert(achievements).values(achievement).returning();
    return newA;
  }

  // ---------------- Virtual Cards ----------------
  async createVirtualCard(card: any): Promise<VirtualCard> {
    const [newV] = await db.insert(virtualCards).values(card).returning();
    return newV;
  }
  async getVirtualCards(userId: string): Promise<VirtualCard[]> {
    return await db.select().from(virtualCards).where(eq(virtualCards.userId, userId));
  }

  // ---------------- Merchants ----------------
  async createMerchant(merchant: InsertMerchant & { qrCode: string; paymentLink: string; userId: string }): Promise<Merchant> {
    const [newM] = await db.insert(merchants).values(merchant as any).returning();
    return newM;
  }
  async getMerchant(id: string): Promise<Merchant | undefined> {
    const [m] = await db.select().from(merchants).where(eq(merchants.id, id));
    return m;
  }
  async getMerchantByQrCode(qrCode: string): Promise<Merchant | undefined> {
    const [m] = await db.select().from(merchants).where(eq(merchants.qrCode, qrCode));
    return m;
  }
  async getMerchantByPaymentLink(paymentLink: string): Promise<Merchant | undefined> {
    const [m] = await db.select().from(merchants).where(eq(merchants.paymentLink, paymentLink));
    return m;
  }
  async getMerchantsByUser(userId: string): Promise<Merchant[]> {
    return await db.select().from(merchants).where(eq(merchants.userId, userId)).orderBy(desc(merchants.createdAt));
  }
  async updateMerchantBalance(id: string, balance: string): Promise<Merchant | undefined> {
    const [updated] = await db.update(merchants).set({ walletBalance: balance }).where(eq(merchants.id, id)).returning();
    return updated;
  }

  // ---------------- Merchant Transactions ----------------
  async createMerchantTransaction(transaction: InsertMerchantTransaction): Promise<MerchantTransaction> {
    const [newTx] = await db.insert(merchantTransactions).values(transaction).returning();
    return newTx;
  }
  async getMerchantTransactions(merchantId: string, limit?: number): Promise<MerchantTransaction[]> {
    let query = db.select().from(merchantTransactions).where(eq(merchantTransactions.merchantId, merchantId)).orderBy(desc(merchantTransactions.createdAt));
    if (limit) query = query.limit(limit) as any;
    return await query;
  }

  // ---------------- Properties ----------------
  async createProperty(property: InsertProperty): Promise<Property> {
    const [p] = await db.insert(properties).values(property).returning();
    return p;
  }
  async getProperty(id: string): Promise<Property | undefined> {
    const [p] = await db.select().from(properties).where(eq(properties.id, id));
    return p;
  }
  async getPropertiesByMerchant(merchantId: string): Promise<Property[]> {
// ---------------- Purchase Transactions ----------------
  async createPurchaseTransaction(transaction: InsertPurchaseTransaction & { reference: string }): Promise<PurchaseTransaction> {
    const [newTx] = await db.insert(purchaseTransactions).values(transaction).returning();
    return newTx;
  }

  async getPurchaseTransaction(id: string): Promise<PurchaseTransaction | undefined> {
    const [tx] = await db.select().from(purchaseTransactions).where(eq(purchaseTransactions.id, id));
    return tx;
  }

  async getPurchaseTransactionsByUser(userId: string): Promise<PurchaseTransaction[]> {
    return await db.select()
      .from(purchaseTransactions)
      .where(eq(purchaseTransactions.userId, userId))
      .orderBy(desc(purchaseTransactions.createdAt));
  }

} // ✅ FINAL closing brace
